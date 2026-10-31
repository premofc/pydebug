"""Autonomous MCP Tool Call Interceptor for PyDebug.

Automatically instruments MCPServer, FastMCP, and low-level Server instances
so every MCP tool invocation creates a discrete, standalone TraceSession with:
- Exact tool name and invocation timestamp
- Clean argument introspection (no opaque memory addresses)
- Line-by-line execution, AST sub-expressions, and variable diffs
- Execution duration and return value / exception
- Zero idle-loop overhead between requests
"""
from __future__ import annotations

import asyncio
import functools
import inspect
import json
import logging
import time
import urllib.request
from pathlib import Path
from typing import Any, Callable

from pydebug.core.events import TraceSession
from pydebug.core.tracer import PyTracer, capture_logs, safe_repr

logger = logging.getLogger("pydebug.mcp")


def _sync_session_to_studio(session: TraceSession, port: int) -> None:
    """Posts a completed trace session snapshot to PyDebug Studio."""
    try:
        session.compute_stats()
        # Direct in-process session manager injection if available in same process
        try:
            from pydebug.server.app import get_session_manager
            get_session_manager().add_session(session)
            return
        except Exception:
            pass

        # Otherwise HTTP POST to Studio listener
        data = json.dumps(session.to_dict()).encode("utf-8")
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/sessions",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5.0):
            pass
    except Exception as e:
        logger.debug("Failed to sync MCP tool session to studio: %s", e)


def instrument_mcp_tool(
    fn: Callable[..., Any],
    tool_name: str,
    server_port: int = 8899,
    project_root: str | None = None,
) -> Callable[..., Any]:
    """Wraps an MCP tool function to trace each invocation as an isolated session."""
    is_async = inspect.iscoroutinefunction(fn)
    cwd = project_root or str(Path.cwd().resolve())
    include_paths = [cwd]
    try:
        fn_file = inspect.getfile(fn)
        if fn_file:
            include_paths.append(str(Path(fn_file).parent))
    except Exception:
        pass

    if is_async:
        @functools.wraps(fn)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            sess_title = f"[MCP Tool] {tool_name}"
            session = TraceSession(title=sess_title)
            tracer = PyTracer(session=session, include_paths=include_paths)
            tracer.start()
            start_t = time.time()
            err: Exception | None = None
            ret_val: Any = None
            with capture_logs(session):
                try:
                    ret_val = await fn(*args, **kwargs)
                    return ret_val
                except Exception as e:
                    err = e
                    raise
                finally:
                    tracer.stop()
                    duration_ms = round((time.time() - start_t) * 1000, 2)
                    session.compute_stats()
                    session.stats["duration_ms"] = duration_ms
                    session.stats["tag"] = "MCP Tool"
                    if err:
                        session.stats["has_uncaught_error"] = True
                        session.stats["error_type"] = type(err).__name__
                        session.stats["error_message"] = str(err)
                    _sync_session_to_studio(session, server_port)

        return async_wrapper

    else:
        @functools.wraps(fn)
        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
            sess_title = f"[MCP Tool] {tool_name}"
            session = TraceSession(title=sess_title)
            tracer = PyTracer(session=session, include_paths=include_paths)
            tracer.start()
            start_t = time.time()
            err: Exception | None = None
            ret_val: Any = None
            with capture_logs(session):
                try:
                    ret_val = fn(*args, **kwargs)
                    return ret_val
                except Exception as e:
                    err = e
                    raise
                finally:
                    tracer.stop()
                    duration_ms = round((time.time() - start_t) * 1000, 2)
                    session.compute_stats()
                    session.stats["duration_ms"] = duration_ms
                    session.stats["tag"] = "MCP Tool"
                    if err:
                        session.stats["has_uncaught_error"] = True
                        session.stats["error_type"] = type(err).__name__
                        session.stats["error_message"] = str(err)
                    _sync_session_to_studio(session, server_port)

        return sync_wrapper


_INSTALLED = False


def install_mcp_hooks(server_port: int = 8899) -> bool:
    """Installs automatic instrumentation into MCP SDK classes."""
    global _INSTALLED
    if _INSTALLED:
        return True

    success = False

    # 1. Hook mcp.server.mcpserver.server.MCPServer (or mcp.server.MCPServer)
    try:
        from mcp.server import MCPServer
        orig_tool = getattr(MCPServer, "tool", None)
        if orig_tool and not getattr(orig_tool, "_pydebug_patched", False):
            def patched_mcpserver_tool(self: Any, *args: Any, **kwargs: Any) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
                dec = orig_tool(self, *args, **kwargs)
                def wrap(fn: Callable[..., Any]) -> Callable[..., Any]:
                    tname = kwargs.get("name") or getattr(fn, "__name__", "tool")
                    wrapped_fn = instrument_mcp_tool(fn, tool_name=tname, server_port=server_port)
                    return dec(wrapped_fn)
                return wrap

            patched_mcpserver_tool._pydebug_patched = True  # type: ignore[attr-defined]
            MCPServer.tool = patched_mcpserver_tool  # type: ignore[method-assign]
            success = True
            logger.info("PyDebug auto-hooked mcp.server.MCPServer.tool")
    except ImportError:
        pass

    # 2. Hook mcp.server.fastmcp.FastMCP if present
    try:
        from mcp.server.fastmcp import FastMCP  # type: ignore[import-not-found]
        orig_fmcp_tool = getattr(FastMCP, "tool", None)
        if orig_fmcp_tool and not getattr(orig_fmcp_tool, "_pydebug_patched", False):
            def patched_fastmcp_tool(self: Any, *args: Any, **kwargs: Any) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
                dec = orig_fmcp_tool(self, *args, **kwargs)
                def wrap(fn: Callable[..., Any]) -> Callable[..., Any]:
                    tname = kwargs.get("name") or getattr(fn, "__name__", "tool")
                    wrapped_fn = instrument_mcp_tool(fn, tool_name=tname, server_port=server_port)
                    return dec(wrapped_fn)
                return wrap

            patched_fastmcp_tool._pydebug_patched = True  # type: ignore[attr-defined]
            FastMCP.tool = patched_fastmcp_tool  # type: ignore[method-assign]
            success = True
            logger.info("PyDebug auto-hooked mcp.server.fastmcp.FastMCP.tool")
    except ImportError:
        pass

    # 3. Hook low-level mcp.server.lowlevel.server.Server.call_tool
    try:
        from mcp.server.lowlevel.server import Server
        orig_call_tool = getattr(Server, "call_tool", None)
        if orig_call_tool and not getattr(orig_call_tool, "_pydebug_patched", False):
            def patched_call_tool(self: Any, *args: Any, **kwargs: Any) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
                dec = orig_call_tool(self, *args, **kwargs)
                def wrap(fn: Callable[..., Any]) -> Callable[..., Any]:
                    tname = getattr(fn, "__name__", "tool")
                    wrapped_fn = instrument_mcp_tool(fn, tool_name=tname, server_port=server_port)
                    return dec(wrapped_fn)
                return wrap

            patched_call_tool._pydebug_patched = True  # type: ignore[attr-defined]
            Server.call_tool = patched_call_tool  # type: ignore[method-assign]
            success = True
            logger.info("PyDebug auto-hooked mcp.server.lowlevel.server.Server.call_tool")
    except ImportError:
        pass

    _INSTALLED = success
    return success

