"""FastAPI & Starlette Middleware for PyDebug."""
from __future__ import annotations

import json
import time
import urllib.request
from pathlib import Path
from typing import Any, Callable

from pydebug.core.events import TraceSession
from pydebug.core.tracer import PyTracer
from pydebug.server.app import get_session_manager


class PyDebugMiddleware:
    """Starlette/FastAPI ASGI Middleware to record and visualize API requests.
    
    Captures live requests triggered from Swagger UI, Postman, curl, or MCP clients,
    records line-by-line execution and variables, and streams them in real-time
    to the PyDebug Studio dashboard (default http://127.0.0.1:8899).
    """

    def __init__(
        self,
        app: Any,
        prefix_filter: str | None = None,
        exclude_paths: list[str] | None = None,
        server_port: int = 8899,
        trace_mcp: bool = False,
    ) -> None:
        self.app = app
        self.prefix_filter = prefix_filter
        self.exclude_paths = exclude_paths or [
            "/favicon.ico",
            "/_pydebug",
            "/health",
            "/_health",
            "/metrics",
            "/docs",
            "/redoc",
            "/openapi.json",
        ]
        self.trace_mcp = trace_mcp
        self.server_port = server_port
        self.project_root = str(Path.cwd().resolve())

    async def __call__(self, scope: dict[str, Any], receive: Callable, send: Callable) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        for excl in self.exclude_paths:
            if path.startswith(excl):
                await self.app(scope, receive, send)
                return

        # Bypass tracing on MCP protocol & SSE streaming channels to avoid inspector timeouts
        headers = dict(scope.get("headers", []))
        accept = headers.get(b"accept", b"").decode("latin-1", "ignore")
        if "text/event-stream" in accept or (not self.trace_mcp and path.startswith("/mcp")):
            await self.app(scope, receive, send)
            return

        if self.prefix_filter and not path.startswith(self.prefix_filter):
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET")
        session_title = f"{method} {path}"

        # Setup tracing with project root inclusion
        session = TraceSession(title=session_title)
        tracer = PyTracer(session=session, include_paths=[self.project_root])
        tracer.start()

        start_time = time.time()
        status_code = [200]

        async def wrapped_send(message: dict[str, Any]) -> None:
            if message.get("type") == "http.response.start":
                status_code[0] = message.get("status", 200)
            await send(message)

        try:
            await self.app(scope, receive, wrapped_send)
        finally:
            tracer.stop()
            duration_ms = round((time.time() - start_time) * 1000, 2)
            session.compute_stats()
            session.stats["duration_ms"] = duration_ms
            session.stats["status_code"] = status_code[0]

            # If an MCP tool was executed inside this request, refine title
            for ev in session.events:
                fn_name = getattr(ev, "func", "")
                fpath = (session.files[ev.file_idx] if (0 <= ev.file_idx < len(session.files)) else "").replace("\\", "/")
                if ("mcp_tools/tools" in fpath.lower() or (fn_name.endswith("_tool") and fn_name != "my_tool")):
                    session.title = f"[MCP] {fn_name} ({method} {path})"
                    break

            # 1. Local in-process registration
            mgr = get_session_manager()
            mgr.add_session(session)

            # 2. Remote listener forwarding (if PyDebug Studio is running on server_port)
            self._forward_to_studio(session)

    def _forward_to_studio(self, session: TraceSession) -> None:
        try:
            payload = json.dumps(session.to_dict()).encode("utf-8")
            req = urllib.request.Request(
                f"http://127.0.0.1:{self.server_port}/api/sessions",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=0.8) as resp:
                pass
        except Exception:
            # Studio server might not be running or is on a different port, fail silently
            pass
