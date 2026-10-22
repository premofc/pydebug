import ast
import hashlib
import importlib.util
import json
import mimetypes
import os
import queue
import sys
import threading
import time
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from pydebug.core.events import TraceSession
from pydebug.core.tracer import PyTracer, safe_repr
from pydebug.examples.demo_algorithms import evaluate_claim_rules, compute_risk_score

UI_DIR = Path(__file__).resolve().parents[1] / "ui"
DEFAULT_UI_HTML = UI_DIR / "index.html"
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")

OLLAMA_ENDPOINT = os.environ.get("OLLAMA_BASE_URL", "http://172.30.0.3:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b-instruct")

_AI_EXPLANATION_CACHE: dict[str, dict[str, Any]] = {}


class SessionManager:
    """Thread-safe store for trace sessions and SSE subscriber queues."""

    def __init__(self) -> None:
        self.sessions: dict[str, TraceSession] = {}
        self.subscribers: list[queue.Queue[str]] = []
        self._lock = threading.Lock()

    def add_session(self, session: TraceSession) -> None:
        with self._lock:
            self.sessions[session.id] = session
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
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            params: list[dict[str, Any]] = []
            defaults: list[Any] = [None] * (len(node.args.args) - len(node.args.defaults)) + list(node.args.defaults)
            for arg, default in zip(node.args.args, defaults):
                default_val = ast.unparse(default) if default else None
                annotation = ast.unparse(arg.annotation) if arg.annotation else None
                params.append({
                    "name": arg.arg,
                    "annotation": annotation,
                    "default": default_val,
                })
            doc = ast.get_docstring(node) or ""
            funcs.append({
                "name": node.name,
                "line": node.lineno,
                "params": params,
                "docstring": doc.strip(),
                "file_path": str(p),
            })
    return funcs


def call_ollama_explanation(
    func: str,
    line: int,
    src: str,
    vars_dict: dict[str, str],
    diffs_dict: dict[str, Any],
    expressions: list[dict[str, Any]],
    prompt_type: str = "explain",
) -> dict[str, str]:
    cache_key = hashlib.md5(
        f"{func}:{line}:{src}:{sorted(vars_dict.items())}:{prompt_type}".encode()
    ).hexdigest()

    if cache_key in _AI_EXPLANATION_CACHE:
        res = dict(_AI_EXPLANATION_CACHE[cache_key])
        res["cached"] = True
        return res

    expr_summary = ", ".join(f"{e.get('text')} = {e.get('val')}" for e in expressions[:5])
    diff_summary = ", ".join(
        f"{k}: {v.get('old')} -> {v.get('new')}" for k, v in diffs_dict.items()
    )

    prompt = f"""You are an expert Python debugger and execution engine assistant.
Function: {func}()
Current Line {line}: {src}
Active variables in scope: {json.dumps(vars_dict)}
Line variable mutations: {diff_summary or 'None'}
Evaluated AST sub-expressions: {expr_summary or 'None'}

In 2 clear, concise sentences:
1. Explain what this line does right now with these exact runtime variable values and what branch was taken.
2. Give one practical tip, edge case, or code alteration suggestion.

Respond ONLY with valid JSON having the keys 'explanation' and 'suggestion'."""

    payload = json.dumps({
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.2, "num_predict": 140},
    }).encode("utf-8")

    try:
        req = urllib.request.Request(
            f"{OLLAMA_ENDPOINT}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=12) as response:
            raw = json.loads(response.read().decode("utf-8"))
            parsed_resp = json.loads(raw.get("response", "{}"))
            result = {
                "explanation": parsed_resp.get("explanation", f"Executed line {line}: {src}"),
                "suggestion": parsed_resp.get("suggestion", "Verify variable bounds and edge conditions."),
                "cached": False,
            }
            _AI_EXPLANATION_CACHE[cache_key] = result
            return result
    except Exception as exc:
        fallback = {
            "explanation": f"Line {line} in {func}() evaluated with variables {list(vars_dict.keys())[:4]}.",
            "suggestion": f"Ollama connection note: {exc}",
            "cached": False,
        }
        return fallback


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
        mgr = get_session_manager()
        with mgr._lock:
            items = [infer_session_metadata(s) for s in reversed(list(mgr.sessions.values()))]
        body = json.dumps(items).encode("utf-8")
        self._send_json(200, body)

    def _serve_session(self, sess_id: str | None) -> None:
        mgr = get_session_manager()
        sess = mgr.get_by_id(sess_id) if sess_id else mgr.get_latest()
        if not sess:
            self.send_error(404, "Session not found")
            return
        body = sess.to_json().encode("utf-8")
        self._send_json(200, body)

    def _serve_functions(self) -> None:
        mgr = get_session_manager()
        sess = mgr.get_latest()
        files = sess.files if sess else []

        discovered: list[dict[str, Any]] = []
        for f in files:
            funcs = extract_function_signatures(f)
            discovered.extend(funcs)

        body = json.dumps(discovered).encode("utf-8")
        self._send_json(200, body)

    def _handle_execute_function(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))

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

            spec = importlib.util.spec_from_file_location("user_live_run", str(p))
            if not spec or not spec.loader:
                self._send_json(500, json.dumps({"error": "Cannot load module spec"}).encode())
                return
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)

            target_func = getattr(mod, func_name, None)
            if not target_func or not callable(target_func):
                self._send_json(404, json.dumps({"error": f"Function {func_name} not found or not callable"}).encode())
                return

            session = TraceSession(title=f"Live Run: {func_name}()")
            tracer = PyTracer(session=session, include_paths=[str(p)])
            tracer.start()

            ret_val = None
            error_msg = None
            try:
                ret_val = target_func(**kwargs)
            except Exception as exc:
                error_msg = str(exc)
            finally:
                tracer.stop()

            get_session_manager().add_session(session)

            resp_data = {
                "success": error_msg is None,
                "session": session.to_dict(),
                "return_val": safe_repr(ret_val),
                "error": error_msg,
            }
            self._send_json(200, json.dumps(resp_data).encode("utf-8"))

        except Exception as e:
            self._send_json(500, json.dumps({"error": str(e)}).encode("utf-8"))

    def _handle_simulate_request(self) -> None:
        """Simulates an incoming live API endpoint or MCP tool call with complete line-by-line tracing."""
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}
            scenario = payload.get("scenario", "api_claim")

            if scenario == "api_checkout":
                title = "POST /api/v1/checkout/calculate"
                session = TraceSession(title=title)
                tracer = PyTracer(session=session)
                tracer.start()
                try:
                    # Execute checkout logic
                    items = [
                        {"name": "Mechanical Keyboard RGB", "price": 110.0, "qty": 1},
                        {"name": "Wrist Rest Foam", "price": 20.0, "qty": 1},
                    ]
                    subtotal = sum(i["price"] * i["qty"] for i in items)
                    discount = subtotal * 0.20
                    tax = (subtotal - discount) * 0.08
                    final_amt = round(subtotal - discount + tax, 2)
                finally:
                    tracer.stop()
            elif scenario == "mcp_tool":
                title = "MCP Tool: claimcare_verify_waiting_period"
                session = TraceSession(title=title)
                tracer = PyTracer(session=session)
                tracer.start()
                try:
                    disease_name = "Cataract"
                    waiting_period_months = 24
                    policy_age_months = 36
                    is_covered = policy_age_months >= waiting_period_months
                    status = "COVERED" if is_covered else "WAITING_PERIOD_ACTIVE"
                finally:
                    tracer.stop()
            else:
                title = "POST /api/claims/adjudicate"
                session = TraceSession(title=title)
                tracer = PyTracer(session=session)
                tracer.start()
                try:
                    risk = compute_risk_score(age=45, bmi=28.4, smoker=False)
                    res = evaluate_claim_rules(claim_id="CLM-902", amount=4800.0, risk_score=risk)
                finally:
                    tracer.stop()

            get_session_manager().add_session(session)
            resp = {
                "success": True,
                "session": session.to_dict(),
                "summary": infer_session_metadata(session),
            }
            self._send_json(200, json.dumps(resp).encode("utf-8"))
        except Exception as e:
            self._send_json(500, json.dumps({"error": str(e)}).encode("utf-8"))

    def _handle_add_session(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            data = json.loads(raw.decode("utf-8"))
            session = TraceSession.from_dict(data)
            get_session_manager().add_session(session)
            resp = json.dumps({"ok": True, "id": session.id, "title": session.title}).encode("utf-8")
            self._send_json(200, resp)
        except Exception as e:
            err = json.dumps({"error": str(e)}).encode("utf-8")
            self._send_json(400, err)

    def _handle_ai_explain_line(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))

            func = payload.get("func", "unknown")
            line = payload.get("line", 0)
            src = payload.get("src", "")
            vars_dict = payload.get("vars", {})
            diffs_dict = payload.get("vars_diff", {})
            expressions = payload.get("expressions", [])
            prompt_type = payload.get("prompt_type", "explain")

            result = call_ollama_explanation(
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

    server = ThreadingHTTPServer(("0.0.0.0", port), PyDebugHandler)
    url = f"http://127.0.0.1:{port}"
    print(f"\n[PyDebug] Live Studio online: {url}")
    print(f"[PyDebug] AI Live Suggestions: connected to Ollama ({OLLAMA_MODEL}) at {OLLAMA_ENDPOINT}")

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
            print("\n[PyDebug] Server stopped.")
    else:
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
    return server


launch_viewer = serve_trace
