"""Exhaustive tests for pydebug.integrations.fastapi covering ASGI middleware, scope filtering, header inspection, status code capture, and studio forwarding."""
from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch
import pytest

from pydebug.core.events import TraceSession
from pydebug.integrations.fastapi import PyDebugMiddleware


class TestPyDebugMiddleware:
    def test_non_http_scope_passthrough(self):
        called = False

        async def dummy_app(scope, receive, send):
            nonlocal called
            called = True

        middleware = PyDebugMiddleware(dummy_app)
        # Lifespan or websocket scope
        asyncio.run(middleware({"type": "lifespan"}, None, None))
        assert called is True

    def test_excluded_paths_passthrough(self):
        called = False

        async def dummy_app(scope, receive, send):
            nonlocal called
            called = True

        middleware = PyDebugMiddleware(dummy_app)
        for path in ["/favicon.ico", "/health", "/metrics", "/docs", "/openapi.json"]:
            called = False
            asyncio.run(middleware({"type": "http", "path": path}, None, None))
            assert called is True

    def test_mcp_and_sse_header_passthrough(self):
        called = False

        async def dummy_app(scope, receive, send):
            nonlocal called
            called = True

        middleware = PyDebugMiddleware(dummy_app, trace_mcp=False)

        # SSE accept header bypasses
        headers = [(b"accept", b"text/event-stream")]
        asyncio.run(middleware({"type": "http", "path": "/stream", "headers": headers}, None, None))
        assert called is True

        # /mcp path bypasses when trace_mcp=False
        called = False
        asyncio.run(middleware({"type": "http", "path": "/mcp", "headers": []}, None, None))
        assert called is True

    def test_prefix_filter_passthrough(self):
        called = False

        async def dummy_app(scope, receive, send):
            nonlocal called
            called = True

        middleware = PyDebugMiddleware(dummy_app, prefix_filter="/api/v1")
        # Path not starting with /api/v1 passes through without tracing
        asyncio.run(middleware({"type": "http", "path": "/legacy/order", "headers": []}, None, None))
        assert called is True

    def test_traced_http_request_execution(self):
        async def dummy_app(scope, receive, send):
            await send({"type": "http.response.start", "status": 201})
            await send({"type": "http.response.body", "body": b'{"created": true}'})

        messages_sent = []
        async def mock_send(msg):
            messages_sent.append(msg)

        middleware = PyDebugMiddleware(dummy_app)
        scope = {
            "type": "http",
            "method": "POST",
            "path": "/api/users",
            "headers": [],
        }

        with patch.object(middleware, "_forward_to_studio") as mock_forward:
            asyncio.run(middleware(scope, None, mock_send))
            assert len(messages_sent) == 2
            assert messages_sent[0]["status"] == 201
            assert mock_forward.called

    def test_forward_to_studio_silent_on_connection_error(self):
        middleware = PyDebugMiddleware(None, server_port=99999)
        sess = TraceSession(title="Forward Test")
        # Calling forward to an invalid port should catch exception silently without raising
        middleware._forward_to_studio(sess)
