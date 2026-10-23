"""Unit tests for the PyDebug engine, AST inspector, and event model."""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Add pydebug directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from pydebug.core.events import TraceSession, TraceEvent
from pydebug.core.tracer import PyTracer, capture, spy
from pydebug.core.ast_spy import inspect_expressions


def test_session_event_recording():
    session = TraceSession(title="Unit Test Session")
    ev = session.record_event(
        kind="line",
        filename="test.py",
        lineno=10,
        func="test_fn",
        depth=1,
        source="x = 42",
        locals_dict={"x": "42"},
        timestamp=100.0,
    )
    assert ev.kind == "line"
    assert ev.line == 10
    assert ev.vars["x"] == "42"
    assert "x" in ev.vars_diff
    assert ev.vars_diff["x"]["new"] == "42"

    session.compute_stats()
    assert session.stats["total_events"] == 1
    assert session.stats["files_count"] == 1


def test_tracer_capture_context_manager():
    def dummy_calc(a, b):
        res = a + b
        return res * 2

    with capture(title="Calc Test") as session:
        output = dummy_calc(3, 4)

    assert output == 14
    assert len(session.events) > 0
    funcs = [e.func for e in session.events]
    assert "dummy_calc" in funcs


def test_ast_sub_expression_spy():
    @inspect_expressions
    def compute_compound(x, y):
        items = [x, y, x + y]
        return (items[0] + 2) * (items[1] - 1)

    result = compute_compound(5, 3)
    assert result == 14  # Semantics completely preserved


def test_hunter_q_predicates():
    from pydebug.core.predicates import Q, And

    pred = Q(function="my_fn", depth_lt=5)
    class DummyEvent:
        func = "my_fn"
        depth = 3
    assert pred(DummyEvent()) is True

    class DeepEvent:
        func = "my_fn"
        depth = 6
    assert pred(DeepEvent()) is False


def test_session_json_serialization():
    session = TraceSession(title="JSON Test")
    session.record_event(
        kind="call",
        filename="dummy.py",
        lineno=1,
        func="main",
        depth=1,
        source="def main():",
        locals_dict={},
        timestamp=1.0,
    )
    data = session.to_dict()
    assert data["title"] == "JSON Test"
    assert len(data["events"]) == 1
    encoded = session.to_json()
    assert "JSON Test" in encoded


def test_ai_manager_config_presets():
    from pydebug.server.ai import AIManager, DEFAULT_PRESETS

    mgr = AIManager()
    assert "ollama" in DEFAULT_PRESETS
    assert "openai" in DEFAULT_PRESETS
    assert "deepseek" in DEFAULT_PRESETS
    assert "custom" in DEFAULT_PRESETS

    # Verify public dict masking
    mgr.save_config(provider="openai", base_url="https://api.openai.com/v1", model="gpt-4o", api_key="sk-test-secret-12345")
    pub = mgr.config.to_public_dict()
    assert pub["provider"] == "openai"
    assert pub["has_api_key"] is True
    assert "sk-test-secret-12345" not in pub["api_key_masked"]
    assert pub["api_key_masked"].startswith("sk-t")


def test_ai_manager_explanation_graceful_fallback():
    from pydebug.server.ai import AIManager

    mgr = AIManager()
    mgr.save_config(provider="ollama", base_url="http://127.0.0.1:99999", model="nonexistent:model")
    result = mgr.explain_line(
        func="my_test_fn",
        line=12,
        src="total = price * 1.2",
        vars_dict={"price": "100"},
        diffs_dict={},
        expressions=[{"text": "price * 1.2", "val": "120.0"}],
    )
    assert "explanation" in result
    assert "suggestion" in result
    assert result["provider"] == "ollama"
