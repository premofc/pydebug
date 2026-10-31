"""PyDebug: Next-Gen 3D Visual Python Debugger.

Combines Hunter's high-performance non-invasive execution tracing with
Birdseye's expression-level AST introspection and a real-time 3D WebGL UI.
"""
from __future__ import annotations

from pydebug.core.events import TraceEvent, TraceSession, SubExpression
from pydebug.core.tracer import PyTracer, trace, spy, capture
from pydebug.core.ast_spy import inspect_expressions
from pydebug.core.predicates import Predicate, Query, Q
from pydebug.server.app import serve_trace, launch_viewer

__version__ = "0.1.8"
__all__ = [
    "PyTracer",
    "TraceEvent",
    "TraceSession",
    "SubExpression",
    "Predicate",
    "Query",
    "Q",
    "trace",
    "spy",
    "capture",
    "inspect_expressions",
    "serve_trace",
    "launch_viewer",
]


def enable(server_port: int = 8899, auto_trace_scripts: bool = False) -> None:
    """Activates PyDebug integration safely without intercepting MCP or test runners.
    
    1. Attaches PyDebugMiddleware to Starlette/FastAPI applications (bypassing /mcp and SSE streams).
    2. Only starts standalone script tracer if auto_trace_scripts=True.
    """
    import sys
    from pathlib import Path
    
    # Auto-patch Starlette / FastAPI for live API requests
    try:
        from starlette.applications import Starlette
        from pydebug.integrations.fastapi import PyDebugMiddleware

        orig_build = Starlette.build_middleware_stack

        def patched_build(self):
            has_mw = any(
                getattr(m, "cls", None) is PyDebugMiddleware or m is PyDebugMiddleware
                for m in self.user_middleware
            )
            if not has_mw:
                self.add_middleware(PyDebugMiddleware, server_port=server_port)
            return orig_build(self)

        Starlette.build_middleware_stack = patched_build
    except ImportError:
        pass

    # Only trace standalone script execution if explicitly requested
    if auto_trace_scripts:
        import atexit
        cwd = str(Path.cwd().resolve())
        tracer = PyTracer(include_paths=[cwd])
        tracer.start()

        def _on_exit() -> None:
            try:
                sess = tracer.stop()
                if not sess.events:
                    return
                sess.title = f"Script: {Path(sys.argv[0]).name if sys.argv else 'Python'}"
                sess.compute_stats()
                import json
                import urllib.request
                payload = json.dumps(sess.to_dict()).encode("utf-8")
                req = urllib.request.Request(
                    f"http://127.0.0.1:{server_port}/api/sessions",
                    data=payload,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=1.0):
                    pass
            except Exception:
                pass

        atexit.register(_on_exit)
