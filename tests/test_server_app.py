"""Exhaustive tests for pydebug.server.app covering SessionManager, signature extractor, HTTP REST endpoints, QuietThreadingHTTPServer, and error handling."""
from __future__ import annotations

import ast
import json
import queue
import socket
import tempfile
import threading
import time
import urllib.request
from pathlib import Path
import pytest

from pydebug.core.events import TraceEvent, TraceSession
from pydebug.server.app import (
    QuietThreadingHTTPServer,
    SessionManager,
    extract_function_signatures,
    generate_sample_args,
    get_session_manager,
    infer_session_metadata,
    serve_trace,
)


class TestSessionManager:
    def test_add_get_latest_get_by_id(self):
        mgr = SessionManager()
        sess1 = TraceSession(id="s1", title="Session One")
        sess2 = TraceSession(id="s2", title="Session Two")

        mgr.add_session(sess1)
        assert mgr.get_latest().id == "s1"
        assert mgr.get_by_id("s1").title == "Session One"
        assert mgr.get_by_id("unknown") is None

        mgr.add_session(sess2)
        assert mgr.get_latest().id == "s2"
        all_sessions = mgr.get_all()
        assert len(all_sessions) == 2
        # get_all returns newest first
        assert all_sessions[0].id == "s2"
        assert all_sessions[1].id == "s1"

    def test_eviction_when_exceeding_max_sessions(self):
        mgr = SessionManager()
        mgr.MAX_SESSIONS = 3

        for i in range(5):
            mgr.add_session(TraceSession(id=f"sess_{i}"))

        assert len(mgr.sessions) == 3
        # sess_0 and sess_1 should be evicted
        assert mgr.get_by_id("sess_0") is None
        assert mgr.get_by_id("sess_1") is None
        assert mgr.get_by_id("sess_4") is not None

    def test_subscriber_and_dead_queue_cleanup(self):
        mgr = SessionManager()
        q1 = mgr.subscribe()
        q2 = mgr.subscribe()

        sess = TraceSession(id="test_sub")
        mgr.add_session(sess)

        # q1 receives message
        msg = q1.get_nowait()
        assert "new_session" in msg

        # Unsubscribe q1
        mgr.unsubscribe(q1)
        assert q1 not in mgr.subscribers

        # Simulate a broken queue in subscribers list
        class BrokenQueue:
            def put_nowait(self, item):
                raise RuntimeError("Broken queue pipe")

        broken = BrokenQueue()
        mgr.subscribers.append(broken)
        # Adding next session should catch exception and clean up broken subscriber
        mgr.add_session(TraceSession(id="test_sub2"))
        assert broken not in mgr.subscribers


class TestSessionMetadataInference:
    def test_fastapi_endpoint_inference(self):
        # Successful GET
        s1 = TraceSession(title="GET /api/v1/users")
        s1.stats = {"duration_ms": 12.5}
        meta1 = infer_session_metadata(s1)
        assert meta1["tag"] == "FastAPI Endpoint"
        assert meta1["status"] == "200 OK"

        # Failed POST with exception event
        s2 = TraceSession(title="POST /api/v1/orders")
        s2.events.append(TraceEvent(0, 1.0, "exception", 0, 10, "create_order", 1, "raise Error"))
        meta2 = infer_session_metadata(s2)
        assert meta2["tag"] == "FastAPI Endpoint"
        assert meta2["status"] == "500 Error"

    def test_mcp_tool_inference(self):
        s = TraceSession(title="[MCP] claimcare_check_benefits")
        meta = infer_session_metadata(s)
        assert meta["tag"] == "MCP Tool"
        assert meta["status"] == "Success"

    def test_playground_run_inference(self):
        s = TraceSession(title="Live Run: calculate_tax()")
        meta = infer_session_metadata(s)
        assert meta["tag"] == "Playground Run"
        assert meta["status"] == "Success"

    def test_python_script_inference(self):
        s = TraceSession(title="Script: my_worker.py")
        meta = infer_session_metadata(s)
        assert meta["tag"] == "Python Script"
        assert meta["status"] == "Success"


class TestSampleArgsGeneration:
    def test_type_annotations_sample_generation(self):
        params = [
            {"name": "count", "annotation": "int", "default": None},
            {"name": "ratio", "annotation": "float", "default": None},
            {"name": "is_active", "annotation": "bool", "default": None},
            {"name": "tags", "annotation": "list[str]", "default": None},
            {"name": "payload", "annotation": "dict", "default": None},
            {"name": "policy_id", "annotation": "str", "default": None},
            {"name": "title", "annotation": "str", "default": None},
            {"name": "disease", "annotation": "str", "default": None},
            {"name": "default_arg", "annotation": "str", "default": "'custom_default'"},
        ]
        valid, invalid = generate_sample_args("test_fn", params)

        assert valid["count"] == 10
        assert valid["ratio"] == 25.5
        assert valid["is_active"] is True
        assert valid["tags"] == ["item_1", "item_2"]
        assert valid["payload"] == {"key": "value"}
        assert valid["policy_id"] == "REC-001"
        assert valid["title"] == "Sample Name"
        assert valid["disease"] == "Fracture"
        assert valid["default_arg"] == "custom_default"

        # Verify invalid parameters designed for testing exception flows
        assert isinstance(invalid["count"], str)
        assert isinstance(invalid["ratio"], str)
        assert invalid["tags"] == 12345
        assert isinstance(invalid["is_active"], list)


class TestFunctionSignatureExtraction:
    def test_extract_signatures_non_existent(self):
        funcs = extract_function_signatures("C:/non_existent_path_xyz.py")
        assert funcs == []

    def test_extract_signatures_syntax_error(self, tmp_path):
        bad_file = tmp_path / "bad.py"
        bad_file.write_text("def broken(: syntax error", encoding="utf-8")
        funcs = extract_function_signatures(str(bad_file))
        assert funcs == []

    def test_extract_signatures_sync_async_and_class_methods(self, tmp_path):
        code = '''
"""Module docstring."""

def regular_func(x: int, y: int = 5) -> int:
    """Calculates sum."""
    return x + y

async def async_fetch(url: str):
    """Fetches a URL."""
    pass

def _private_func():
    pass

class OrderService:
    def __init__(self):
        pass

    def process_order(self, order_id: str):
        """Processes the order."""
        pass
'''
        py_file = tmp_path / "test_module.py"
        py_file.write_text(code, encoding="utf-8")

        funcs = extract_function_signatures(str(py_file))
        func_names = [f["name"] for f in funcs]

        # Top-level functions
        assert "regular_func" in func_names
        assert "async_fetch" in func_names
        assert "_private_func" not in func_names  # private skipped

        # Class methods
        assert "OrderService.process_order" in func_names
        assert "OrderService.__init__" not in func_names  # init skipped

        # Parameter checks
        reg = next(f for f in funcs if f["name"] == "regular_func")
        assert reg["is_async"] is False
        assert reg["docstring"] == "Calculates sum."
        assert len(reg["params"]) == 2
        assert reg["params"][0]["name"] == "x"
        assert reg["params"][1]["default"] == "5"

        async_f = next(f for f in funcs if f["name"] == "async_fetch")
        assert async_f["is_async"] is True


@pytest.fixture(scope="module")
def app_server_url():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
    sock.close()

    server = serve_trace(session=None, port=port, auto_open=False, block=False)
    time.sleep(0.4)
    yield f"http://127.0.0.1:{port}"
    try:
        server.server_close()
    except Exception:
        pass


class TestHttpServerEndpoints:
    def test_api_health(self, app_server_url):
        req = urllib.request.Request(f"{app_server_url}/api/health")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["status"] == "ok"
            assert data["service"] == "pydebug"

    def test_api_sessions_get_and_post(self, app_server_url):
        # Post a new session
        sess = TraceSession(id="custom_sess_1", title="Custom Live Trace")
        payload = json.dumps(sess.to_dict()).encode()
        post_req = urllib.request.Request(
            f"{app_server_url}/api/sessions",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(post_req, timeout=3.0) as resp:
            assert resp.status == 200
            res = json.loads(resp.read().decode())
            assert res["ok"] is True
            assert res["id"] == "custom_sess_1"

        # Get sessions list
        get_req = urllib.request.Request(f"{app_server_url}/api/sessions")
        with urllib.request.urlopen(get_req, timeout=3.0) as resp:
            assert resp.status == 200
            sessions_list = json.loads(resp.read().decode())
            assert any(s["id"] == "custom_sess_1" for s in sessions_list)

        # Get specific session by ID
        item_req = urllib.request.Request(f"{app_server_url}/api/session?id=custom_sess_1")
        with urllib.request.urlopen(item_req, timeout=3.0) as resp:
            assert resp.status == 200
            detail = json.loads(resp.read().decode())
            assert detail["id"] == "custom_sess_1"
            assert detail["title"] == "Custom Live Trace"

    def test_api_execute_function_validation(self, app_server_url):
        # Missing parameters -> 400
        req = urllib.request.Request(
            f"{app_server_url}/api/execute-function",
            data=json.dumps({}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(req, timeout=3.0)
        assert exc_info.value.code == 400

        # Non-existent file -> 404
        req_missing = urllib.request.Request(
            f"{app_server_url}/api/execute-function",
            data=json.dumps({"file_path": "C:/not_existing_file_xyz.py", "function_name": "calc"}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(req_missing, timeout=3.0)
        assert exc_info.value.code == 404

    def test_api_execute_function_sync_success_and_exception(self, app_server_url, tmp_path):
        target_py = tmp_path / "sandbox_demo.py"
        target_py.write_text(
            "def add(a, b):\n    return a + b\n\ndef crash():\n    x = 10\n    return x / 0\n",
            encoding="utf-8"
        )

        # 1. Successful execution
        req_ok = urllib.request.Request(
            f"{app_server_url}/api/execute-function",
            data=json.dumps({
                "file_path": str(target_py),
                "function_name": "add",
                "args": {"a": 7, "b": 3},
            }).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req_ok, timeout=5.0) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["success"] is True
            assert data["return_val"] == "10"
            assert data["error"] is None

        # 2. Crash execution captures error line, traceback, and session
        req_crash = urllib.request.Request(
            f"{app_server_url}/api/execute-function",
            data=json.dumps({
                "file_path": str(target_py),
                "function_name": "crash",
                "args": {},
            }).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req_crash, timeout=5.0) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["success"] is False
            assert data["error_type"] == "ZeroDivisionError"
            assert data["error_line"] is not None

    def test_api_simulate_request(self, app_server_url):
        req = urllib.request.Request(
            f"{app_server_url}/api/simulate-request",
            data=json.dumps({"scenario": "mcp_tool"}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["success"] is True
            assert "session" in data
            assert data["session"]["stats"]["total_events"] > 0

    def test_parse_invocation_args(self):
        from pydebug.server.app import PyDebugHandler

        # 1. Dict with numbers, booleans, None
        pos, kw = PyDebugHandler._parse_invocation_args(args={"amount": "1000", "active": "True", "tag": "None"})
        assert pos == []
        assert kw["amount"] == 1000
        assert kw["active"] is True
        assert kw["tag"] is None

        # 2. Positional list
        pos, kw = PyDebugHandler._parse_invocation_args(call_args=["5", "'cataract'"])
        assert pos == [5, "cataract"]

        # 3. Call expression: full call
        pos, kw = PyDebugHandler._parse_invocation_args(call_expr="validate_policy_id(5, category='cataract')")
        assert pos == [5]
        assert kw["category"] == "cataract"

        # 4. Call expression: raw args inside parens
        pos, kw = PyDebugHandler._parse_invocation_args(call_expr="10, rate=0.15")
        assert pos == [10]
        assert kw["rate"] == 0.15

    def test_api_execute_function_with_call_expr(self, app_server_url, tmp_path):
        target_py = tmp_path / "sandbox_demo_expr.py"
        target_py.write_text(
            "def multiply(x, factor=2):\n    return x * factor\n",
            encoding="utf-8"
        )

        req = urllib.request.Request(
            f"{app_server_url}/api/execute-function",
            data=json.dumps({
                "file_path": str(target_py),
                "function_name": "multiply",
                "call_expr": "multiply(7, factor=3)",
            }).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode())
            assert data["success"] is True
            assert data["return_val"] == "21"
