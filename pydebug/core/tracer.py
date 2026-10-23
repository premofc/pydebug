"""High-performance execution tracer (combining Hunter speed with AST sub-expression events)."""
from __future__ import annotations

import asyncio
import collections.abc as cabc
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


def safe_repr(v: Any, _depth: int = 0) -> str:
    """Recursively formats Python objects into readable, bounded strings for UI display."""
    try:
        if _depth < 3 and isinstance(v, (list, tuple, set, frozenset)):
            inner = ", ".join(safe_repr(x, _depth + 1)[:80] for x in list(v)[:20])
            tail = ", ..." if len(v) > 20 else ""
            if isinstance(v, list):
                return f"[{inner}{tail}]"
            elif isinstance(v, tuple):
                return f"({inner}{',' if len(v) == 1 else ''}{tail})"
            else:
                return f"{{{inner}{tail}}}"
        elif _depth < 3 and isinstance(v, dict):
            inner = ", ".join(
                f"{safe_repr(k, _depth + 1)[:40]}: {safe_repr(val, _depth + 1)[:80]}"
                for k, val in list(v.items())[:20]
            )
            return "{" + inner + (", ..." if len(v) > 20 else "") + "}"
        else:
            r = repr(v)
            if _depth < 2 and _ADDR_RE.match(r):
                if type(v).__str__ is not object.__str__:
                    return str(v)
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
    ) -> None:
        self.session = session or TraceSession()
        self.include_paths = [os.path.abspath(p) for p in (include_paths or [])]
        self.exclude_prefixes = exclude_prefixes or [
            sys.prefix,
            "<frozen",
            "importlib",
            _INTERNAL_CORE,
            os.path.join(_INTERNAL_ROOT, "server"),
            os.path.join(_INTERNAL_ROOT, "integrations"),
            "asyncio",
            "threading",
        ]
        self.predicate = predicate
        self.max_depth = max_depth
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

        for excl in self.exclude_prefixes:
            if abs_file.startswith(excl):
                return False

        if self.include_paths:
            return any(abs_file.startswith(inc) for inc in self.include_paths)
        return True

    def _trace_fn(self, frame: Any, event: str, arg: Any) -> Any:
        filename = frame.f_code.co_filename
        if not self._should_trace(filename):
            return None

        lineno = frame.f_lineno
        func_name = frame.f_code.co_name

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


@contextmanager
def capture(
    title: str = "Trace Session",
    include_paths: list[str] | None = None,
) -> Generator[TraceSession, None, None]:
    """Context manager to trace execution within a code block."""
    tracer = PyTracer(session=TraceSession(title=title), include_paths=include_paths)
    tracer.start()
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
