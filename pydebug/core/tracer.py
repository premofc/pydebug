"""High-performance execution tracer (combining Hunter speed with AST sub-expression events)."""
from __future__ import annotations

import asyncio
import logging
import collections.abc as cabc
import dataclasses
import functools
import inspect
import linecache
import os
import re
import sys
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Generator

from pydebug.core.ast_spy import clear_active_expressions, inspect_expressions
from pydebug.core.events import TraceSession

_ADDR_RE = re.compile(r"^<[\w.]+ object at 0x[0-9a-fA-F]+>$")


def _unpack_custom_object(v: Any, _depth: int, _seen: set[int]) -> str | None:
    """Introspects and extracts meaningful fields from custom objects (SQLAlchemy, Pydantic, dataclasses)."""
    cls = type(v)
    cls_name = cls.__name__

    # 1. Pydantic v2 / v1
    if hasattr(v, "model_dump") and callable(v.model_dump):
        try:
            dump = v.model_dump()
            if isinstance(dump, dict):
                inner = ", ".join(f"{k}={safe_repr(val, _depth + 1, _seen)[:60]}" for k, val in list(dump.items())[:12])
                tail = ", ..." if len(dump) > 12 else ""
                return f"{cls_name}({inner}{tail})"
        except Exception:
            pass
    elif hasattr(v, "dict") and callable(v.dict) and not isinstance(v, type):
        try:
            dump = v.dict()
            if isinstance(dump, dict):
                inner = ", ".join(f"{k}={safe_repr(val, _depth + 1, _seen)[:60]}" for k, val in list(dump.items())[:12])
                tail = ", ..." if len(dump) > 12 else ""
                return f"{cls_name}({inner}{tail})"
        except Exception:
            pass

    # 2. Dataclasses
    if dataclasses.is_dataclass(v) and not isinstance(v, type):
        try:
            dump = dataclasses.asdict(v)
            if isinstance(dump, dict):
                inner = ", ".join(f"{k}={safe_repr(val, _depth + 1, _seen)[:60]}" for k, val in list(dump.items())[:12])
                tail = ", ..." if len(dump) > 12 else ""
                return f"{cls_name}({inner}{tail})"
        except Exception:
            pass

    # 3. Namedtuples
    if hasattr(v, "_asdict") and callable(v._asdict):
        try:
            dump = v._asdict()
            if isinstance(dump, dict):
                inner = ", ".join(f"{k}={safe_repr(val, _depth + 1, _seen)[:60]}" for k, val in list(dump.items())[:12])
                tail = ", ..." if len(dump) > 12 else ""
                return f"{cls_name}({inner}{tail})"
        except Exception:
            pass

    # 4. SQLAlchemy ORM models and standard classes with __dict__
    if hasattr(v, "__dict__") and not isinstance(v, type):
        try:
            clean_attrs = {k: val for k, val in v.__dict__.items() if not k.startswith("_")}
            if clean_attrs:
                inner = ", ".join(f"{k}={safe_repr(val, _depth + 1, _seen)[:60]}" for k, val in list(clean_attrs.items())[:12])
                tail = ", ..." if len(clean_attrs) > 12 else ""
                return f"{cls_name}({inner}{tail})"
        except Exception:
            pass

    # 5. Classes with __slots__
    if hasattr(v, "__slots__") and not isinstance(v, type):
        try:
            slots = [v.__slots__] if isinstance(v.__slots__, str) else v.__slots__
            clean_attrs = {s: getattr(v, s) for s in slots if hasattr(v, s) and not s.startswith("_")}
            if clean_attrs:
                inner = ", ".join(f"{k}={safe_repr(val, _depth + 1, _seen)[:60]}" for k, val in list(clean_attrs.items())[:12])
                tail = ", ..." if len(clean_attrs) > 12 else ""
                return f"{cls_name}({inner}{tail})"
        except Exception:
            pass

    return None


def safe_repr(v: Any, _depth: int = 0, _seen: set[int] | None = None) -> str:
    """Recursively formats Python objects into readable, bounded strings for UI display.
    
    Unpacks SQLAlchemy ORM models, Pydantic instances, dataclasses, and custom objects
    so developers see actual attribute values instead of opaque memory addresses.
    """
    try:
        if _seen is None:
            _seen = set()

        # Primitive / scalar types return fast repr
        if isinstance(v, (int, float, bool, str, bytes, type(None))):
            r = repr(v)
            return r if len(r) <= 240 else r[:237] + "..."

        vid = id(v)
        if vid in _seen:
            return f"<{type(v).__name__} ...>"
        _seen.add(vid)

        # If namedtuple subclass of tuple, prefer custom object unpacking
        if hasattr(v, "_fields") and isinstance(v, tuple) and type(v) is not tuple:
            unpacked = _unpack_custom_object(v, _depth, _seen)
            if unpacked is not None:
                return unpacked if len(unpacked) <= 240 else unpacked[:237] + "..."

        if _depth < 3 and isinstance(v, (list, tuple, set, frozenset)):
            inner = ", ".join(safe_repr(x, _depth + 1, _seen)[:80] for x in list(v)[:20])
            tail = ", ..." if len(v) > 20 else ""
            if isinstance(v, list):
                return f"[{inner}{tail}]"
            elif isinstance(v, tuple):
                return f"({inner}{',' if len(v) == 1 else ''}{tail})"
            else:
                return f"{{{inner}{tail}}}"
        elif _depth < 3 and isinstance(v, dict):
            inner = ", ".join(
                f"{safe_repr(k, _depth + 1, _seen)[:40]}: {safe_repr(val, _depth + 1, _seen)[:80]}"
                for k, val in list(v.items())[:20]
            )
            return "{" + inner + (", ..." if len(v) > 20 else "") + "}"
        elif hasattr(v, "done") and hasattr(v, "result") and callable(v.done) and callable(v.result):
            try:
                if v.done():
                    if hasattr(v, "cancelled") and v.cancelled():
                        return "<Future cancelled>"
                    return safe_repr(v.result(), _depth + 1, _seen)
                else:
                    return "(awaiting)"
            except Exception as e:
                return f"<Future error={type(e).__name__}: {e}>"
        elif inspect.iscoroutine(v):
            return f"<coroutine {getattr(v, '__name__', 'coro')}>"
        else:
            if _depth < 3:
                unpacked = _unpack_custom_object(v, _depth, _seen)
                if unpacked is not None:
                    return unpacked if len(unpacked) <= 240 else unpacked[:237] + "..."

            r = repr(v)
            if _depth < 2 and _ADDR_RE.match(r):
                if type(v).__str__ is not object.__str__:
                    return str(v)
                return f"{type(v).__name__}()"
            return r if len(r) <= 240 else r[:237] + "..."
    except Exception:
        return "<unprintable>"

_INTERNAL_CORE = str(Path(__file__).resolve().parent)
_INTERNAL_ROOT = str(Path(__file__).resolve().parents[1])


class PyTracer:
    """Execution tracer inspired by Hunter with sub-expression support."""

    def __init__(
        self,
        session: TraceSession | None = None,
        include_paths: list[str] | None = None,
        exclude_prefixes: list[str] | None = None,
        predicate: Any | None = None,
        max_depth: int = 50,
        max_events: int = 15000,
        on_session_roll: Callable[[TraceSession], None] | None = None,
    ) -> None:
        self.session = session or TraceSession()
        self.include_paths = [os.path.abspath(p) for p in (include_paths or [])]
        self.exclude_prefixes = exclude_prefixes or [
            sys.prefix,
            "<frozen",
            "importlib",
            _INTERNAL_CORE + os.sep,
            _INTERNAL_ROOT + os.sep,
            "asyncio",
            "threading",
        ]
        self.predicate = predicate
        self.max_depth = max_depth
        self.max_events = max_events
        self.on_session_roll = on_session_roll
        self._session_slice = 1
        self._base_title = self.session.title
        self._prev_trace: Any = None
        self._depth = 0
        self._active = False

    def _should_trace(self, filename: str) -> bool:
        if not filename or filename.startswith("<"):
            return False
        abs_file = os.path.abspath(filename)
        norm = abs_file.replace("\\", "/").lower()

        # Strict hard exclusions: NEVER trace virtualenvs, site-packages, or python runtime libs
        if "/site-packages/" in norm or "/.venv/" in norm or "/venv/" in norm:
            return False
        if "/python3" in norm or "/lib/python" in norm:
            return False
        if "uvicorn" in norm or "starlette" in norm or "anyio" in norm:
            return False

        # Never trace tracer core engine internals
        if abs_file.startswith(_INTERNAL_CORE + os.sep) or abs_file == _INTERNAL_CORE:
            return False

        # If explicit include_paths are specified, trace only matching files
        if self.include_paths:
            return any(abs_file.startswith(inc) for inc in self.include_paths)

        for excl in self.exclude_prefixes:
            if abs_file.startswith(excl):
                return False

        return True

    def _trace_fn(self, frame: Any, event: str, arg: Any) -> Any:
        filename = frame.f_code.co_filename
        if not self._should_trace(filename):
            return None

        # Skip our own AST-instrumentation frames: _spy_eval closures are
        # compiled in the user's file, so path filtering cannot exclude them.
        if frame.f_code.co_name == "_spy_eval":
            return None

        lineno = frame.f_lineno
        func_name = frame.f_code.co_name

        # Detect and normalize async coroutine suspend / resume transitions:
        # When an async def awaits, Python settrace emits 'return' with the awaited future.
        # When that future completes, it emits 'call' at the await instruction offset (>0).
        is_coro = bool(getattr(frame.f_code, "co_flags", 0) & 0x80)
        if is_coro:
            if event == "return" and (hasattr(arg, "done") or type(arg).__name__ in ("Future", "Task", "_asyncio.Future")):
                # Internal await suspension, not true function exit
                return self._trace_fn
            if event == "call" and getattr(frame, "f_lasti", 0) > 0:
                # Coroutine resumed at await point, not initial function invocation
                return self._trace_fn
            if event == "exception" and isinstance(arg, tuple) and len(arg) >= 1 and isinstance(arg[0], type) and issubclass(arg[0], (StopIteration, GeneratorExit)):
                # Internal asyncio loop completion signal
                return self._trace_fn

        if event == "call":
            self._depth += 1
            if self._depth > self.max_depth:
                return None

        # Check Hunter predicate query if configured
        if self.predicate is not None:
            class _EventProbe:
                pass
            p = _EventProbe()
            p.kind = event
            p.filename = filename
            p.line = lineno
            p.func = func_name
            p.depth = self._depth
            if not self.predicate(p):
                return self._trace_fn

        # Capture bounded locals
        raw_locals = frame.f_locals
        clean_locals: dict[str, str] = {}
        for k, v in list(raw_locals.items())[:30]:
            if not k.startswith("__"):
                if type(v).__name__ in ('TraceSession', 'PyTracer'):
                    continue
                clean_locals[k] = safe_repr(v)

        src_line = linecache.getline(filename, lineno).rstrip()
        exprs = clear_active_expressions()

        ret_val = safe_repr(arg) if event == "return" else None
        exc_type = None
        exc_val = None
        if event == "exception" and isinstance(arg, tuple) and len(arg) >= 2:
            exc_type = getattr(arg[0], "__name__", str(arg[0]))
            exc_val = safe_repr(arg[1])

        # Bounded event guard: roll session if max_events reached to prevent memory exhaustion
        if len(self.session.events) >= self.max_events:
            if self.on_session_roll:
                self.session.compute_stats()
                try:
                    self.on_session_roll(self.session)
                except Exception:
                    pass
            self._session_slice += 1
            new_title = f"{self._base_title} [Segment {self._session_slice}]"
            self.session = TraceSession(
                title=new_title,
                files=list(self.session.files),
                file_sources=dict(self.session.file_sources),
            )

        self.session.record_event(
            kind=event,
            filename=filename,
            lineno=lineno,
            func=func_name,
            depth=self._depth,
            source=src_line,
            locals_dict=clean_locals,
            timestamp=time.time(),
            return_val=ret_val,
            exc_type=exc_type,
            exc_val=exc_val,
            expressions=exprs,
        )

        if event in ("return", "exception"):
            self._depth = max(0, self._depth - 1)

        return self._trace_fn

    def start(self) -> TraceSession:
        self._active = True
        self._prev_trace = sys.gettrace()
        sys.settrace(self._trace_fn)
        if hasattr(threading, "settrace"):
            threading.settrace(self._trace_fn)
        caller_frame = sys._getframe().f_back
        while caller_frame:
            caller_frame.f_trace = self._trace_fn
            caller_frame = caller_frame.f_back
        return self.session

    def stop(self) -> TraceSession:
        if self._active:
            sys.settrace(self._prev_trace)
            if hasattr(threading, "settrace"):
                threading.settrace(self._prev_trace)
            self._active = False
            self.session.compute_stats()
        return self.session


class SessionLogHandler(logging.Handler):
    """Logging handler that appends formatted log records to a TraceSession."""

    def __init__(self, session: TraceSession) -> None:
        super().__init__()
        self.session = session

    def emit(self, record: logging.LogRecord) -> None:
        if record.name.startswith("pydebug"):
            return
        try:
            msg = record.getMessage()
            exc_text = None
            if record.exc_info:
                exc_text = logging.Formatter().formatException(record.exc_info)
            self.session.logs.append({
                "timestamp": record.created,
                "level": record.levelname,
                "logger": record.name,
                "message": msg,
                "file": record.filename,
                "line": record.lineno,
                "func": record.funcName,
                "exc_info": exc_text,
            })
        except Exception:
            pass


class StreamTee:
    """Tee that writes to original stream while capturing lines into session logs."""

    def __init__(self, original_stream: Any, session: TraceSession, level: str = "STDOUT") -> None:
        self.orig = original_stream
        self.session = session
        self.level = level
        self._buffer = ""

    def write(self, s: str) -> int:
        try:
            self.orig.write(s)
        except Exception:
            pass
        self._buffer += str(s)
        while "\n" in self._buffer:
            line, self._buffer = self._buffer.split("\n", 1)
            clean = line.rstrip("\r\n")
            if clean:
                self.session.logs.append({
                    "timestamp": time.time(),
                    "level": self.level,
                    "logger": self.level.lower(),
                    "message": clean,
                    "file": "",
                    "line": 0,
                    "func": "",
                    "exc_info": None,
                })
        return len(s)

    def flush(self) -> None:
        try:
            self.orig.flush()
        except Exception:
            pass
        clean = self._buffer.strip()
        if clean:
            self.session.logs.append({
                "timestamp": time.time(),
                "level": self.level,
                "logger": self.level.lower(),
                "message": clean,
                "file": "",
                "line": 0,
                "func": "",
                "exc_info": None,
            })
            self._buffer = ""

    def __getattr__(self, name: str) -> Any:
        return getattr(self.orig, name)


@contextmanager
def capture_logs(session: TraceSession, capture_stdout: bool = True, min_level: int = logging.DEBUG) -> Generator[None, None, None]:
    """Captures all logging.getLogger() records and stdout/stderr during a code block."""
    handler = SessionLogHandler(session)
    handler.setLevel(min_level)
    root_logger = logging.getLogger()
    prev_level = root_logger.level
    if root_logger.level > min_level or root_logger.level == 0:
        root_logger.setLevel(min_level)
    root_logger.addHandler(handler)

    orig_stdout = sys.stdout
    orig_stderr = sys.stderr
    stdout_tee = StreamTee(orig_stdout, session, level="STDOUT") if capture_stdout else None
    stderr_tee = StreamTee(orig_stderr, session, level="STDERR") if capture_stdout else None

    if stdout_tee:
        sys.stdout = stdout_tee  # type: ignore
    if stderr_tee:
        sys.stderr = stderr_tee  # type: ignore

    try:
        yield
    finally:
        if stdout_tee:
            stdout_tee.flush()
            sys.stdout = orig_stdout
        if stderr_tee:
            stderr_tee.flush()
            sys.stderr = orig_stderr
        root_logger.removeHandler(handler)
        root_logger.setLevel(prev_level)


@contextmanager
def capture(
    title: str = "Trace Session",
    include_paths: list[str] | None = None,
) -> Generator[TraceSession, None, None]:
    """Context manager to trace execution within a code block."""
    tracer = PyTracer(session=TraceSession(title=title), include_paths=include_paths)
    tracer.start()
    with capture_logs(tracer.session):
        try:
            yield tracer.session
        finally:
            tracer.stop()


def trace(
    fn: Callable[..., Any] | None = None,
    *,
    serve: bool = False,
    port: int = 8899,
    auto_open: bool = True,
    expressions: bool = True,
) -> Any:
    """Decorator to trace any sync or async Python function with PyDebug."""
    def decorator(target: Callable[..., Any]) -> Callable[..., Any]:
        target_fn = inspect_expressions(target) if expressions else target
        is_async = inspect.iscoroutinefunction(target_fn)
        fn_file = inspect.getfile(target)

        tag = '[MCP]' if ('tool' in target.__name__.lower() or 'mcp' in fn_file.lower()) else '[FN]'
        sess_title = f'{tag} {target.__name__}'

        if is_async:
            @functools.wraps(target)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                tracer = PyTracer(session=TraceSession(title=sess_title), include_paths=[fn_file])
                tracer.start()
                with capture_logs(tracer.session):
                    try:
                        return await target_fn(*args, **kwargs)
                    finally:
                        sess = tracer.stop()
                    try:
                        sess.compute_stats()
                        from pydebug.server.app import get_session_manager
                        get_session_manager().add_session(sess)
                    except Exception:
                        pass
                    if serve:
                        from pydebug.server.app import launch_viewer
                        launch_viewer(sess, port=port, auto_open=auto_open)
            return async_wrapper
        else:
            @functools.wraps(target)
            def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                import sys
                if sys.gettrace() is not None:
                    # An active tracer is already running in this thread/process
                    return target_fn(*args, **kwargs)
                tracer = PyTracer(session=TraceSession(title=sess_title), include_paths=[fn_file])
                tracer.start()
                with capture_logs(tracer.session):
                    try:
                        return target_fn(*args, **kwargs)
                    finally:
                        sess = tracer.stop()
                    try:
                        sess.compute_stats()
                        from pydebug.server.app import get_session_manager
                        get_session_manager().add_session(sess)
                    except Exception:
                        pass
                    if serve:
                        from pydebug.server.app import launch_viewer
                        launch_viewer(sess, port=port, auto_open=auto_open)
            return sync_wrapper

    if fn is not None:
        return decorator(fn)
    return decorator


spy = functools.partial(trace, expressions=True)
