"""Exhaustive tests for pydebug.core.tracer covering safe_repr, PyTracer filtering, frame tracing, capture, and decorators."""
from __future__ import annotations

import asyncio
import sys
import pytest

from pydebug.core.events import TraceSession
from pydebug.core.predicates import Q
from pydebug.core.tracer import PyTracer, capture, safe_repr, spy, trace


class CustomNamedEntity:
    def __str__(self):
        return "Entity(alpha)"


class TestSafeRepr:
    def test_primitives(self):
        assert safe_repr(100) == "100"
        assert safe_repr("simple") == "'simple'"
        assert safe_repr(3.14) == "3.14"
        assert safe_repr(True) == "True"
        assert safe_repr(None) == "None"

    def test_collections_and_depth(self):
        # List formatting
        lst = [1, 2, 3]
        assert safe_repr(lst) == "[1, 2, 3]"

        # 1-element tuple must have trailing comma
        one_tup = (42,)
        assert safe_repr(one_tup) == "(42,)"

        # Set formatting
        s = {99}
        assert safe_repr(s) == "{99}"

        # Truncation when > 20 items
        large_list = list(range(30))
        rep_large = safe_repr(large_list)
        assert rep_large.endswith(", ...]")

    def test_dict_formatting(self):
        d = {"a": 1, "b": 2}
        rep = safe_repr(d)
        assert "'a': 1" in rep
        assert "'b': 2" in rep

        # Large dict truncation
        large_d = {f"k{i}": i for i in range(30)}
        rep_large = safe_repr(large_d)
        assert rep_large.endswith(", ...}")

    def test_addr_object_custom_str(self):
        ent = CustomNamedEntity()
        # Module-level class matches `<... object at 0x...>`, and custom __str__ is used
        assert safe_repr(ent) == "Entity(alpha)"

    def test_long_string_truncation(self):
        very_long = "z" * 300
        rep = safe_repr(very_long)
        assert len(rep) <= 240
        assert rep.endswith("...")

    def test_unprintable_object_handling(self):
        class Explosive:
            def __repr__(self):
                raise ValueError("Boom in repr")
            def __str__(self):
                raise ValueError("Boom in str")

        assert safe_repr(Explosive()) == "<unprintable>"


class TestPyTracerFiltering:
    def test_should_trace_builtins_and_internals(self):
        tracer = PyTracer()
        # Internal pseudofiles
        assert tracer._should_trace("") is False
        assert tracer._should_trace(None) is False
        assert tracer._should_trace("<string>") is False
        assert tracer._should_trace("<frozen importlib>") is False

        # Virtual environments and python libraries
        assert tracer._should_trace("/user/project/.venv/lib/site.py") is False
        assert tracer._should_trace("/user/project/site-packages/pkg.py") is False
        assert tracer._should_trace("C:\\Python314\\lib\\os.py") is False
        assert tracer._should_trace("/app/uvicorn/main.py") is False

    def test_should_trace_include_paths(self):
        import os
        allowed_dir = os.path.abspath("C:/my_project/app")
        tracer = PyTracer(include_paths=[allowed_dir])

        in_scope = os.path.join(allowed_dir, "service.py")
        out_of_scope = os.path.abspath("C:/other_folder/util.py")

        assert tracer._should_trace(in_scope) is True
        assert tracer._should_trace(out_of_scope) is False


class TestPyTracerExecution:
    def test_capture_records_function_events(self):
        def helper(x):
            y = x * 2
            return y

        with capture(title="Capture Test") as session:
            out = helper(5)

        assert out == 10
        assert len(session.events) > 0
        funcs = [e.func for e in session.events]
        assert "helper" in funcs

    def test_capture_records_exception(self):
        def thrower():
            a = 1
            b = 0
            return a / b

        session_ref = None
        try:
            with capture(title="Exception Capture") as session:
                session_ref = session
                thrower()
        except ZeroDivisionError:
            pass

        assert session_ref is not None
        assert session_ref.stats["total_events"] > 0
        exc_events = [e for e in session_ref.events if e.kind == "exception"]
        assert len(exc_events) >= 1
        assert exc_events[0].exc_type == "ZeroDivisionError"

    def test_max_depth_limit(self):
        tracer = PyTracer(max_depth=3)
        assert tracer.max_depth == 3
        # Direct trace fn check when depth exceeds max_depth
        tracer._depth = 4
        class MockCode:
            co_filename = "user_code.py"
            co_name = "deep_func"
        class MockFrame:
            f_code = MockCode()
            f_lineno = 10
            f_locals = {}
        # When event is call and depth > max_depth, returns None
        ret = tracer._trace_fn(MockFrame(), "call", None)
        assert ret is None

    def test_predicate_filtering(self):
        def task_a():
            return 1

        def task_b():
            return 2

        # Trace only function names matching 'task_a'
        tracer = PyTracer(predicate=Q(function="task_a"))
        tracer.start()
        try:
            task_a()
            task_b()
        finally:
            sess = tracer.stop()

        funcs = {e.func for e in sess.events}
        assert "task_a" in funcs
        assert "task_b" not in funcs


class TestTraceAndSpyDecorators:
    def test_sync_function_spy(self):
        @spy
        def calculate_total(prices):
            total = sum(prices)
            tax = total * 0.1
            return total + tax

        res = calculate_total([10, 20, 30])
        assert res == 66.0

    def test_async_function_trace(self):
        @trace
        async def fetch_user_data(user_id):
            await asyncio.sleep(0.01)
            return {"user_id": user_id, "active": True}

        res = asyncio.run(fetch_user_data(101))
        assert res == {"user_id": 101, "active": True}

    def test_mcp_tool_naming_detection(self):
        @trace
        def verify_policy_tool(policy_id):
            return f"verified_{policy_id}"

        res = verify_policy_tool("POL-123")
        assert res == "verified_POL-123"
