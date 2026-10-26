import asyncio
import inspect
import ast
import importlib.util
import json
import logging
import mimetypes
import os
import queue
import sys
import threading
import time
import traceback
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from pydebug.core.events import TraceSession
from pydebug.core.tracer import PyTracer, safe_repr
from pydebug.server.ai import get_ai_manager

logger = logging.getLogger("pydebug")

UI_DIR = Path(__file__).resolve().parents[1] / "ui"

EXCLUDE_DIRS = {
    ".venv", "venv", "env", ".git", "__pycache__", "node_modules",
    "site-packages", "build", "dist", ".pytest_cache", ".idea", ".vscode",
    "pydebug.egg-info", "pydebug_studio.egg-info", "pydebug.egg-info",
}

# The pydebug package's own source files are internal tooling, not user code.
_PYDEBUG_PKG_DIR = Path(__file__).resolve().parents[1]


def scan_project_python_files() -> list[Path]:
    """Recursively scans the current workspace for user project Python files."""
    cwd = Path.cwd().resolve()
    pkg_dir = Path(_PYDEBUG_PKG_DIR).resolve()
    py_files: list[Path] = []
    for root, dirs, files in os.walk(cwd):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith(".")]
        for f in files:
            if f.endswith(".py") and not f.startswith("."):
                pf = (Path(root) / f).resolve()
                # Skip pydebug's own internal files
                if pkg_dir == pf or pkg_dir in pf.parents:
                    continue
                py_files.append(pf)
                if len(py_files) >= 200:
                    return py_files
    return py_files


class QuietThreadingHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request: Any, client_address: Any) -> None:
        exc_type, _, _ = sys.exc_info()
        if exc_type in (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            return
        super().handle_error(request, client_address)

DEFAULT_UI_HTML = UI_DIR / "index.html"
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")

# Dynamic AI configuration managed by pydebug.server.ai.AIManager


class SessionManager:
    """Thread-safe store for trace sessions and SSE subscriber queues."""

    # Keeps memory bounded: each traced session can be worth megabytes.
    MAX_SESSIONS = 200

    def __init__(self) -> None:
        self.sessions: dict[str, TraceSession] = {}
        self.subscribers: list[queue.Queue[str]] = []
        self._lock = threading.Lock()

    def add_session(self, session: TraceSession) -> None:
        with self._lock:
            self.sessions[session.id] = session
            # Evict oldest sessions beyond the retention cap.
            if len(self.sessions) > self.MAX_SESSIONS:
                oldest = next(iter(self.sessions))
                del self.sessions[oldest]
                logger.info("Evicted oldest session %s to stay under the %d-session cap", oldest, self.MAX_SESSIONS)
            payload = json.dumps({"type": "new_session", "session": session.to_dict()})
            # Notify SSE subscribers
            dead = []
            for q in self.subscribers:
                try:
                    q.put_nowait(payload)
                except Exception:
                    dead.append(q)
            for d in dead:
                self.subscribers.remove(d)

    def get_latest(self) -> TraceSession | None:
        with self._lock:
            if not self.sessions:
                return None
            return list(self.sessions.values())[-1]

    def get_by_id(self, sess_id: str) -> TraceSession | None:
        with self._lock:
            return self.sessions.get(sess_id)

    def get_all(self) -> list[TraceSession]:
        """Returns all sessions, newest first."""
        with self._lock:
            return list(reversed(list(self.sessions.values())))

    def subscribe(self) -> queue.Queue[str]:
        q: queue.Queue[str] = queue.Queue(maxsize=100)
        with self._lock:
            self.subscribers.append(q)
        return q

    def unsubscribe(self, q: queue.Queue[str]) -> None:
        with self._lock:
            if q in self.subscribers:
                self.subscribers.remove(q)


_GLOBAL_MANAGER = SessionManager()


def get_session_manager() -> SessionManager:
    return _GLOBAL_MANAGER


def infer_session_metadata(session: TraceSession) -> dict[str, Any]:
    """Infers category tag, status code, and target function for dashboard display."""
    title = session.title or "Untitled Session"
    first_func = session.events[0].func if session.events else "main"

    # Check if the execution ended with an unhandled exception
    has_uncaught_error = bool(session.events and session.events[-1].kind == "exception")

    if any(title.startswith(m) for m in ("GET ", "POST ", "PUT ", "DELETE ", "PATCH ")):
        tag = "FastAPI Endpoint"
        status = "500 Error" if has_uncaught_error else "200 OK"
    elif title.startswith("MCP:") or title.startswith("MCP Tool:") or title.startswith("[MCP]"):
        tag = "MCP Tool"
        status = "Error" if has_uncaught_error else "Success"
    elif "Live Run:" in title or "Live Test:" in title:
        tag = "Playground Run"
        status = "Error" if has_uncaught_error else "Success"
    else:
        tag = "Python Script"
        status = "Error" if has_uncaught_error else "Success"

    return {
        "id": session.id,
        "title": title,
        "created_at": session.created_at,
        "tag": tag,
        "status": status,
        "first_func": first_func,
        "stats": session.stats,
    }


def generate_sample_args(func_name: str, params: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Dynamically infers realistic valid and invalid arguments for any project function."""
    valid: dict[str, Any] = {}
    invalid: dict[str, Any] = {}

    for p in params:
        name = p["name"]
        ann = (p.get("annotation") or "").lower()
        default = p.get("default")

        if default and default != "None":
            try:
                valid[name] = default.strip("'\"")
            except Exception:
                valid[name] = default
        elif "int" in ann:
            valid[name] = 10
        elif "float" in ann:
            valid[name] = 25.5
        elif "bool" in ann:
            valid[name] = True
        elif "list" in ann:
            valid[name] = ["item_1", "item_2"]
        elif "dict" in ann:
            valid[name] = {"key": "value"}
        elif any(k in name.lower() for k in ("id", "code", "key")):
            valid[name] = "REC-001"
        elif any(k in name.lower() for k in ("name", "title")):
            valid[name] = "Sample Name"
        elif any(k in name.lower() for k in ("query", "term", "disease", "procedure")):
            valid[name] = "Fracture"
        else:
            valid[name] = "sample_value"

        # Generate invalid argument specifically designed to trigger an exception
        if "int" in ann:
            invalid[name] = "invalid_string_for_int"
        elif "float" in ann:
            invalid[name] = "invalid_string_for_float"
        elif "list" in ann:
            invalid[name] = 12345
        elif "dict" in ann:
            invalid[name] = "invalid_not_dict"
        elif "bool" in ann:
            invalid[name] = [1, 2, 3]
        else:
            invalid[name] = None

    return valid, invalid


def extract_function_signatures(file_path: str) -> list[dict[str, Any]]:
    p = Path(file_path).resolve()
    if not p.exists():
        return []

    try:
        code = p.read_text(encoding="utf-8")
        tree = ast.parse(code)
    except Exception:
        return []

    funcs: list[dict[str, Any]] = []

    # Iterate top-level nodes in tree.body only — prevents capturing inner closures/callbacks like `on_chunk`
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.name.startswith("_") or node.name == "run_demo":
                continue
            params: list[dict[str, Any]] = []
            defaults: list[Any] = [None] * (len(node.args.args) - len(node.args.defaults)) + list(node.args.defaults)
            for arg, default in zip(node.args.args, defaults):
                if arg.arg in ("self", "cls"):
                    continue
                default_val = ast.unparse(default) if default else None
                annotation = ast.unparse(arg.annotation) if arg.annotation else None
                params.append({
                    "name": arg.arg,
                    "annotation": annotation,
                    "default": default_val,
                })
            doc = ast.get_docstring(node) or ""
            sample_valid, sample_invalid = generate_sample_args(node.name, params)
            funcs.append({
                "name": node.name,
                "line": node.lineno,
                "params": params,
                "docstring": doc.strip(),
                "file_path": str(p),
                "is_async": isinstance(node, ast.AsyncFunctionDef),
                "sample_valid": sample_valid,
                "sample_invalid": sample_invalid,
            })
        elif isinstance(node, ast.ClassDef):
            if node.name.startswith("_"):
                continue
            for sub in node.body:
                if isinstance(sub, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    if sub.name.startswith("_"):
                        continue
                    params = []
                    defaults = [None] * (len(sub.args.args) - len(sub.args.defaults)) + list(sub.args.defaults)
                    for arg, default in zip(sub.args.args, defaults):
                        if arg.arg in ("self", "cls"):
                            continue
                        default_val = ast.unparse(default) if default else None
                        annotation = ast.unparse(arg.annotation) if arg.annotation else None
                        params.append({
                            "name": arg.arg,
                            "annotation": annotation,
                            "default": default_val,
                        })
                    doc = ast.get_docstring(sub) or ""
                    full_name = f"{node.name}.{sub.name}"
                    sample_valid, sample_invalid = generate_sample_args(sub.name, params)
                    funcs.append({
                        "name": full_name,
                        "line": sub.lineno,
                        "params": params,
                        "docstring": doc.strip(),
                        "file_path": str(p),
                        "is_async": isinstance(sub, ast.AsyncFunctionDef),
                        "sample_valid": sample_valid,
                        "sample_invalid": sample_invalid,
                    })
    return funcs


class PyDebugHandler(BaseHTTPRequestHandler):
    """HTTP Request Handler serving PyDebug Studio, REST endpoints, and Ollama AI."""

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        pass

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path in ("/", "/index.html"):
            self._serve_ui()
        elif path == "/api/sessions":
            self._serve_sessions_list()
        elif path == "/api/session":
            query = urllib.parse.parse_qs(parsed.query)
            sess_id = query.get("id", [None])[0]
            self._serve_session(sess_id)
        elif path == "/api/functions":
            self._serve_functions()
        elif path == "/api/stream":
            self._serve_sse_stream()
        elif path == "/api/ai/config":
            self._serve_ai_config()
        elif path == "/api/ai/models":
            query = urllib.parse.parse_qs(parsed.query)
            prov = query.get("provider", [None])[0]
            base_url = query.get("base_url", [None])[0]
            self._serve_ai_models(prov, base_url)
        elif path == "/api/health":
            self._send_json(200, json.dumps({"status": "ok", "service": "pydebug"}).encode("utf-8"))
        elif self._try_serve_static(path):
            return
        else:
            self.send_error(404, "Not Found")

    def do_POST(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/sessions":
            self._handle_add_session()
        elif path == "/api/execute-function":
            self._handle_execute_function()
        elif path == "/api/simulate-request":
            self._handle_simulate_request()
        elif path == "/api/ai/config":
            self._handle_save_ai_config()
        elif path == "/api/ai/test-connection":
            self._handle_test_ai_connection()
        elif path == "/api/ai/explain-line":
            self._handle_ai_explain_line()
        else:
            self.send_error(404, "Unknown POST endpoint")

    def _try_serve_static(self, path: str) -> bool:
        clean = path.lstrip("/")
        target = (UI_DIR / clean).resolve()
        try:
            target.relative_to(UI_DIR.resolve())
        except ValueError:
            return False

        if target.is_file():
            mime, _ = mimetypes.guess_type(str(target))
            if not mime:
                mime = "application/octet-stream"
            content = target.read_bytes()
            self.send_response(200)
            self.send_header(
                "Content-Type",
                f"{mime}; charset=utf-8" if "text" in mime or "javascript" in mime else mime,
            )
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "public, max-age=3600")
            self.end_headers()
            self.wfile.write(content)
            return True
        return False

    def _serve_ui(self) -> None:
        if not DEFAULT_UI_HTML.exists():
            body = b"<h1>PyDebug: UI build in progress</h1>"
        else:
            body = DEFAULT_UI_HTML.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def _serve_sessions_list(self) -> None:
        """Returns rich metadata for all recorded API endpoints, tools, and scripts."""
        items = [infer_session_metadata(s) for s in get_session_manager().get_all()]
        self._send_json(200, json.dumps(items).encode("utf-8"))

    def _serve_session(self, sess_id: str | None) -> None:
        mgr = get_session_manager()
        sess = mgr.get_by_id(sess_id) if sess_id else mgr.get_latest()
        if not sess:
            # No session yet is a normal empty state for a fresh viewer, not an error.
            self._send_json(200, json.dumps({"events": []}).encode("utf-8"))
            return
        body = sess.to_json().encode("utf-8")
        self._send_json(200, body)

    # Workspace function discovery is expensive (recursive scan + signature
    # parsing of up to 200 files). Dashboard loads request it on every visit,
    # so results are cached briefly.
    FUNCTIONS_CACHE_TTL = 10.0
    _functions_cache: tuple[float, bytes] | None = None

    def _serve_functions(self) -> None:
        cls = type(self)
        if cls._functions_cache is not None:
            fetched_at, body = cls._functions_cache
            if time.time() - fetched_at < cls.FUNCTIONS_CACHE_TTL:
                self._send_json(200, body)
                return

        sess = get_session_manager().get_latest()
        user_files: list[str] = []

        def add_file(path: str) -> None:
            """Adds a user file to the discovery list; skips tests and pydebug internals."""
            p = Path(path)
            name = p.name.lower()
            parent = p.parent.name.lower()
            is_test = (
                name.startswith("test_") or name.endswith("_test.py") or name == "tests.py"
                or parent in ("tests", "test")
            )
            is_internal = (
                p == _PYDEBUG_PKG_DIR or _PYDEBUG_PKG_DIR in p.parents
                or name == "scenarios.py"  # simulator demo logic
            )
            if not is_test and not is_internal and path not in user_files:
                user_files.append(path)

        # Functions actually executed in live traces come first
        if sess and sess.files:
            for f in sess.files:
                add_file(f)

        # Plus everything discoverable in the current workspace
        for pf in scan_project_python_files():
            add_file(str(pf))

        discovered: list[dict[str, Any]] = []
        seen = set()
        for f in user_files:
            funcs = extract_function_signatures(f)
            for fn in funcs:
                key = (fn["file_path"], fn["name"])
                if key not in seen:
                    seen.add(key)
                    discovered.append(fn)

        body = json.dumps(discovered).encode("utf-8")
        cls._functions_cache = (time.time(), body)
        self._send_json(200, body)

    def _read_json_body(self) -> dict[str, Any]:
        """Reads and parses the JSON request body (empty dict when no body)."""
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _handle_execute_function(self) -> None:
        payload = {}
        try:
            payload = self._read_json_body()
            file_path = payload.get("file_path")
            func_name = payload.get("function_name")
            kwargs = payload.get("args", {})

            if not file_path or not func_name:
                self._send_json(400, json.dumps({"error": "file_path and function_name are required"}).encode())
                return

            p = Path(file_path).resolve()
            if not p.exists():
                self._send_json(404, json.dumps({"error": f"File {file_path} not found"}).encode())
                return

            # Ensure workspace root is in sys.path so package relative imports succeed
            cwd = Path.cwd().resolve()
            if str(cwd) not in sys.path:
                sys.path.insert(0, str(cwd))

            # Compute module name relative to cwd (e.g. server.mcp_tools.services.copay)
            try:
                rel = p.relative_to(cwd)
                parts = list(rel.parts)
                if parts[-1].endswith(".py"):
                    parts[-1] = parts[-1][:-3]
                if parts[-1] == "__init__":
                    parts.pop()
                mod_name = ".".join(parts)
            except ValueError:
                mod_name = p.stem

            mod = None
            try:
                mod = importlib.import_module(mod_name)
                mod = importlib.reload(mod)
            except Exception as import_err:
                logger.warning("Direct import of %s failed (%s), trying spec loader with package...", mod_name, import_err)
                parent_pkg = mod_name.rsplit(".", 1)[0] if "." in mod_name else ""
                spec = importlib.util.spec_from_file_location(mod_name, str(p), submodule_search_locations=[str(p.parent)])
                if spec and spec.loader:
                    mod = importlib.util.module_from_spec(spec)
                    mod.__package__ = parent_pkg
                    sys.modules[mod_name] = mod
                    spec.loader.exec_module(mod)
                else:
                    raise

            target_func = None
            if "." in func_name:
                cls_name, m_name = func_name.split(".", 1)
                cls_obj = getattr(mod, cls_name, None)
                if cls_obj:
                    try:
                        inst = cls_obj()
                        target_func = getattr(inst, m_name, None)
                    except Exception:
                        target_func = getattr(cls_obj, m_name, None)
            else:
                target_func = getattr(mod, func_name, None)

            if not target_func or not callable(target_func):
                empty_sess = TraceSession(title=f"Lookup Failed: {func_name}")
                self._send_json(200, json.dumps({
                    "success": False,
                    "error": f"Function {func_name} not found or not callable in {p.name}",
                    "error_type": "LookupError",
                    "error_message": f"Function {func_name} could not be resolved as a callable object.",
                    "session": empty_sess.to_dict(),
                }).encode("utf-8"))
                return

            session = TraceSession(title=f"Live Run: {func_name}()")
            # Include all project directories so the tracer follows execution into services/repos
            include_paths = [str(cwd), str(p.parent), str(p)]
            tracer = PyTracer(session=session, include_paths=include_paths)
            tracer.start()

            ret_val = None
            error_type = None
            error_msg = None
            error_tb = None
            exc_line = None
            exc_file = None

            try:
                call_kwargs = kwargs if isinstance(kwargs, dict) else {}
                if inspect.iscoroutinefunction(target_func):
                    ret_val = asyncio.run(target_func(**call_kwargs))
                else:
                    ret_val = target_func(**call_kwargs)
                    if inspect.iscoroutine(ret_val):
                        ret_val = asyncio.run(ret_val)
            except Exception as exc:
                error_type = type(exc).__name__
                error_msg = str(exc) or error_type
                error_tb = traceback.format_exc()
                tb = exc.__traceback__
                while tb and tb.tb_next:
                    tb = tb.tb_next
                if tb:
                    exc_line = tb.tb_lineno
                    exc_file = tb.tb_frame.f_code.co_filename
            finally:
                tracer.stop()
                session.compute_stats()

            if error_msg:
                session.stats["has_uncaught_error"] = True
                session.stats["error_type"] = error_type
                session.stats["error_message"] = error_msg
                if exc_line is not None:
                    session.stats["error_line"] = exc_line
                if exc_file is not None:
                    session.stats["error_file"] = exc_file

            get_session_manager().add_session(session)

            resp_data = {
                "success": error_msg is None,
                "session": session.to_dict(),
                "return_val": safe_repr(ret_val),
                "error": f"{error_type}: {error_msg}" if error_type else None,
                "error_type": error_type,
                "error_message": error_msg,
                "error_traceback": error_tb,
                "error_file": exc_file,
                "error_line": exc_line,
            }
            self._send_json(200, json.dumps(resp_data).encode("utf-8"))

        except Exception as e:
            logger.exception("Function execution failed")
            err_tb = traceback.format_exc()
            fallback_sess = TraceSession(title=f"Execution Failed: {payload.get('function_name', 'run')}")
            self._send_json(200, json.dumps({
                "success": False,
                "error": str(e),
                "error_type": type(e).__name__,
                "error_message": str(e),
                "error_traceback": err_tb,
                "session": fallback_sess.to_dict(),
            }).encode("utf-8"))

    def _handle_simulate_request(self) -> None:
        """Simulates an incoming live API endpoint or MCP tool call with complete line-by-line tracing."""
        # Each scenario maps to a title and a traceable business-logic function
        # (kept in examples/ so the tracer records them — server/ is excluded).
        from pydebug.examples import scenarios

        scenarios_map: dict[str, tuple[str, Callable[[], object]]] = {
            "api_checkout": ("POST /api/v1/checkout/calculate", scenarios.simulate_checkout_calculation),
            "mcp_tool": ("MCP Tool: claimcare_verify_waiting_period", scenarios.simulate_waiting_period_check),
        }
        try:
            payload = self._read_json_body()
            title, runner = scenarios_map.get(
                payload.get("scenario", "api_claim"),
                ("POST /api/claims/adjudicate", scenarios.simulate_claim_adjudication),
            )

            session = TraceSession(title=title)
            tracer = PyTracer(session=session, include_paths=[str(Path(scenarios.__file__).parent)])
            tracer.start()
            try:
                runner()
            finally:
                tracer.stop()

            get_session_manager().add_session(session)
            resp = {"success": True, "session": session.to_dict(), "summary": infer_session_metadata(session)}
            self._send_json(200, json.dumps(resp).encode("utf-8"))
        except Exception as e:
            logger.exception("Simulation failed")
            self._send_json(500, json.dumps({"error": str(e)}).encode("utf-8"))

    def _handle_add_session(self) -> None:
        try:
            data = self._read_json_body()
            session = TraceSession.from_dict(data)
            get_session_manager().add_session(session)
            resp = json.dumps({"ok": True, "id": session.id, "title": session.title}).encode("utf-8")
            self._send_json(200, resp)
        except Exception as e:
            logger.exception("Invalid session payload")
            self._send_json(400, json.dumps({"error": str(e)}).encode("utf-8"))

    def _serve_ai_config(self) -> None:
        mgr = get_ai_manager()
        body = json.dumps(mgr.config.to_public_dict()).encode("utf-8")
        self._send_json(200, body)

    def _serve_ai_models(self, provider: str | None, base_url: str | None) -> None:
        mgr = get_ai_manager()
        models = mgr.fetch_models(provider=provider, base_url=base_url)
        body = json.dumps({"models": models}).encode("utf-8")
        self._send_json(200, body)

    def _handle_save_ai_config(self) -> None:
        try:
            payload = self._read_json_body()
            mgr = get_ai_manager()
            updated = mgr.save_config(
                provider=payload.get("provider", "ollama"),
                base_url=payload.get("base_url", "http://127.0.0.1:11434"),
                model=payload.get("model", "qwen2.5:7b-instruct"),
                api_key=payload.get("api_key"),
                temperature=float(payload.get("temperature", 0.2)),
            )
            self._send_json(200, json.dumps({"ok": True, "config": updated.to_public_dict()}).encode("utf-8"))
        except Exception as e:
            logger.exception("Saving AI config failed")
            self._send_json(400, json.dumps({"error": str(e)}).encode("utf-8"))

    def _handle_test_ai_connection(self) -> None:
        try:
            payload = self._read_json_body()
            mgr = get_ai_manager()
            res = mgr.test_connection(
                provider=payload.get("provider"),
                base_url=payload.get("base_url"),
                model=payload.get("model"),
                api_key=payload.get("api_key"),
            )
            status_code = 200 if res.get("success") else 400
            self._send_json(status_code, json.dumps(res).encode("utf-8"))
        except Exception as e:
            logger.exception("AI connection test failed")
            self._send_json(500, json.dumps({"success": False, "message": str(e)}).encode("utf-8"))

    def _handle_ai_explain_line(self) -> None:
        try:
            payload = self._read_json_body()
            func = payload.get("func", "unknown")
            line = payload.get("line", 0)
            src = payload.get("src", "")
            vars_dict = payload.get("vars", {})
            diffs_dict = payload.get("vars_diff", {})
            expressions = payload.get("expressions", [])
            prompt_type = payload.get("prompt_type", "explain")

            mgr = get_ai_manager()
            result = mgr.explain_line(
                func=func,
                line=line,
                src=src,
                vars_dict=vars_dict,
                diffs_dict=diffs_dict,
                expressions=expressions,
                prompt_type=prompt_type,
            )
            self._send_json(200, json.dumps(result).encode("utf-8"))
        except Exception as e:
            logger.exception("AI explanation failed")
            self._send_json(500, json.dumps({"error": str(e)}).encode("utf-8"))

    def _serve_sse_stream(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        mgr = get_session_manager()
        q = mgr.subscribe()
        try:
            self.wfile.write(b": keepalive\n\n")
            self.wfile.flush()
            while True:
                try:
                    msg = q.get(timeout=15.0)
                    chunk = f"data: {msg}\n\n".encode("utf-8")
                    self.wfile.write(chunk)
                    self.wfile.flush()
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass
        finally:
            mgr.unsubscribe(q)

    def _send_json(self, status: int, body: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)


def serve_trace(
    session: TraceSession | None = None,
    port: int = 8899,
    auto_open: bool = True,
    block: bool = True,
) -> ThreadingHTTPServer:
    if session:
        get_session_manager().add_session(session)

    if not logging.getLogger().handlers:
        logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(name)s: %(message)s")

    server = QuietThreadingHTTPServer(("0.0.0.0", port), PyDebugHandler)
    url = f"http://127.0.0.1:{port}"
    logger.info("Live Studio online: %s", url)
    ai = get_ai_manager()
    logger.info("AI Co-Pilot: Provider=%s, Model=%s (%s)", ai.config.provider.upper(), ai.config.model, ai.config.base_url)

    if auto_open:
        try:
            webbrowser.open(url)
        except Exception:
            pass

    if block:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            server.server_close()
            logger.info("Server stopped.")
    else:
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
    return server


launch_viewer = serve_trace
