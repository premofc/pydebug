"""Exhaustive tests for pydebug.core.events covering all dataclasses, methods, branches, edge cases, and error handling."""
from __future__ import annotations

import json
import tempfile
from pathlib import Path
import pytest

from pydebug.core.events import SubExpression, TraceEvent, TraceSession


class TestSubExpression:
    def test_instantiation_defaults(self):
        expr = SubExpression(
            text="x + 1",
            val="11",
            type_name="int",
            start_col=4,
            end_col=9,
        )
        assert expr.text == "x + 1"
        assert expr.val == "11"
        assert expr.type_name == "int"
        assert expr.start_col == 4
        assert expr.end_col == 9
        assert expr.node_type == "expr"

    def test_custom_node_type(self):
        expr = SubExpression(
            text="a > b",
            val="True",
            type_name="bool",
            start_col=0,
            end_col=5,
            node_type="compare",
        )
        assert expr.node_type == "compare"


class TestTraceEvent:
    def test_trace_event_fields(self):
        ev = TraceEvent(
            seq=0,
            timestamp=12345.67,
            kind="line",
            file_idx=0,
            line=42,
            func="my_func",
            depth=2,
            src="res = a * b",
            vars={"a": "2", "b": "3", "res": "6"},
            vars_diff={"res": {"old": "<unset>", "new": "6"}},
            return_val=None,
            exc_type=None,
            exc_val=None,
            expressions=[{"text": "a * b", "val": "6", "line": 42}],
        )
        assert ev.seq == 0
        assert ev.timestamp == 12345.67
        assert ev.kind == "line"
        assert ev.file_idx == 0
        assert ev.line == 42
        assert ev.func == "my_func"
        assert ev.depth == 2
        assert ev.src == "res = a * b"
        assert ev.vars["res"] == "6"
        assert ev.vars_diff["res"]["new"] == "6"
        assert len(ev.expressions) == 1

    def test_trace_event_exception_and_return(self):
        ev = TraceEvent(
            seq=1,
            timestamp=12346.0,
            kind="exception",
            file_idx=0,
            line=50,
            func="fail_fn",
            depth=1,
            src="raise ValueError('bad input')",
            exc_type="ValueError",
            exc_val="bad input",
        )
        assert ev.kind == "exception"
        assert ev.exc_type == "ValueError"
        assert ev.exc_val == "bad input"
        assert ev.return_val is None

        ret_ev = TraceEvent(
            seq=2,
            timestamp=12347.0,
            kind="return",
            file_idx=0,
            line=55,
            func="ok_fn",
            depth=1,
            src="return 42",
            return_val="42",
        )
        assert ret_ev.kind == "return"
        assert ret_ev.return_val == "42"


class TestTraceSession:
    def test_default_initialization(self):
        session = TraceSession()
        assert len(session.id) == 8
        assert session.title == "PyDebug Session"
        assert isinstance(session.created_at, str)
        assert session.files == []
        assert session.file_sources == {}
        assert session.events == []
        assert session.stats == {}

    def test_register_file_new_and_cached(self, tmp_path):
        dummy_file = tmp_path / "sample.py"
        dummy_file.write_text("x = 10\ny = 20\n", encoding="utf-8")

        session = TraceSession()
        # First registration -> reads file and caches source
        idx1 = session.register_file(str(dummy_file))
        assert idx1 == 0
        assert len(session.files) == 1
        assert session.file_sources[0] == ["x = 10", "y = 20"]

        # Second registration of identical path -> returns cached index without re-reading
        idx2 = session.register_file(str(dummy_file))
        assert idx2 == 0
        assert len(session.files) == 1

    def test_register_file_non_existent(self):
        session = TraceSession()
        ghost_path = "C:/non_existent_folder_abc_123/ghost.py"
        idx = session.register_file(ghost_path)
        assert idx == 0
        assert len(session.files) == 1
        # Upon read failure, file_sources[idx] is recorded as empty list []
        assert session.file_sources[idx] == []

    def test_record_event_variable_diffs(self, tmp_path):
        f = tmp_path / "calc.py"
        f.write_text("def run():\n  pass\n", encoding="utf-8")
        session = TraceSession(title="Diff Test")

        # Step 1: initial local var 'a' is recorded as unset -> new
        ev1 = session.record_event(
            kind="line",
            filename=str(f),
            lineno=1,
            func="run",
            depth=1,
            source="a = 1",
            locals_dict={"a": "1"},
            timestamp=1.0,
        )
        assert "a" in ev1.vars_diff
        assert ev1.vars_diff["a"]["old"] == "<unset>"
        assert ev1.vars_diff["a"]["new"] == "1"

        # Step 2: 'a' changes from 1 to 2, 'b' is newly introduced
        ev2 = session.record_event(
            kind="line",
            filename=str(f),
            lineno=2,
            func="run",
            depth=1,
            source="a = 2; b = 10",
            locals_dict={"a": "2", "b": "10"},
            timestamp=2.0,
        )
        assert ev2.vars_diff["a"] == {"old": "1", "new": "2"}
        assert ev2.vars_diff["b"] == {"old": "<unset>", "new": "10"}

        # Step 3: 'a' and 'b' remain identical -> no diffs recorded for them!
        ev3 = session.record_event(
            kind="line",
            filename=str(f),
            lineno=3,
            func="run",
            depth=1,
            source="print(a, b)",
            locals_dict={"a": "2", "b": "10"},
            timestamp=3.0,
        )
        assert ev3.vars_diff == {}

        # Step 4: Different function 'other_func' has its own scoped local tracking
        ev4 = session.record_event(
            kind="line",
            filename=str(f),
            lineno=10,
            func="other_func",
            depth=2,
            source="a = 99",
            locals_dict={"a": "99"},
            timestamp=4.0,
        )
        # Even though 'a' was 2 in 'run', in 'other_func' it is <unset> -> 99
        assert ev4.vars_diff["a"] == {"old": "<unset>", "new": "99"}

    def test_record_event_optional_fields(self, tmp_path):
        f = tmp_path / "edge.py"
        f.write_text("pass\n", encoding="utf-8")
        session = TraceSession()

        ev = session.record_event(
            kind="exception",
            filename=str(f),
            lineno=5,
            func="err",
            depth=3,
            source="  raise ZeroDivisionError('div 0')  ",
            locals_dict={"x": "0"},
            timestamp=10.0,
            return_val=None,
            exc_type="ZeroDivisionError",
            exc_val="div 0",
            expressions=[{"text": "1 / 0", "val": "ZeroDivisionError"}],
        )
        assert ev.src == "raise ZeroDivisionError('div 0')"
        assert ev.exc_type == "ZeroDivisionError"
        assert ev.exc_val == "div 0"
        assert len(ev.expressions) == 1

    def test_compute_stats_empty(self):
        session = TraceSession()
        session.compute_stats()
        assert session.stats["total_events"] == 0
        assert session.stats["files_count"] == 0
        assert session.stats["calls_count"] == 0
        assert session.stats["returns_count"] == 0
        assert session.stats["exceptions_count"] == 0
        assert session.stats["max_depth"] == 0
        assert session.stats["duration_ms"] == 0.0

    def test_compute_stats_single_event(self, tmp_path):
        f = tmp_path / "single.py"
        f.write_text("x = 1\n", encoding="utf-8")
        session = TraceSession()
        session.record_event("line", str(f), 1, "m", 1, "x = 1", {"x": "1"}, 100.0)
        session.compute_stats()
        assert session.stats["total_events"] == 1
        assert session.stats["duration_ms"] == 0.0
        assert session.stats["max_depth"] == 1

    def test_compute_stats_multiple_events(self, tmp_path):
        f = tmp_path / "multi.py"
        f.write_text("def f():\n  pass\n", encoding="utf-8")
        session = TraceSession()
        session.record_event("call", str(f), 1, "f", 1, "def f():", {}, 10.0)
        session.record_event("line", str(f), 2, "f", 2, "pass", {}, 10.05)
        session.record_event("exception", str(f), 2, "f", 2, "pass", {}, 10.07, exc_type="RuntimeError")
        session.record_event("return", str(f), 2, "f", 1, "return", {}, 10.10, return_val="None")

        session.compute_stats()
        assert session.stats["total_events"] == 4
        assert session.stats["calls_count"] == 1
        assert session.stats["returns_count"] == 1
        assert session.stats["exceptions_count"] == 1
        assert session.stats["max_depth"] == 2
        assert session.stats["duration_ms"] == pytest.approx(100.0, rel=1e-2)

    def test_from_dict_and_to_dict_roundtrip(self, tmp_path):
        f = tmp_path / "mod.py"
        f.write_text("v = 42\n", encoding="utf-8")

        session = TraceSession(title="Roundtrip Session")
        session.record_event("line", str(f), 1, "top", 0, "v = 42", {"v": "42"}, 50.0)
        session.compute_stats()

        data = session.to_dict()
        assert data["title"] == "Roundtrip Session"
        assert len(data["events"]) == 1
        assert "v" in data["events"][0]["vars"]

        # Restore from dict
        restored = TraceSession.from_dict(data)
        assert restored.title == "Roundtrip Session"
        assert len(restored.events) == 1
        assert isinstance(restored.events[0], TraceEvent)
        assert restored.events[0].vars["v"] == "42"
        assert restored.file_sources[0] == ["v = 42"]

    def test_from_dict_with_invalid_file_source_keys_and_raw_events(self):
        # Edge case: file_sources containing non-integer keys and raw TraceEvent objects
        raw_ev = TraceEvent(0, 1.0, "line", 0, 1, "fn", 0, "x = 1")
        data = {
            "id": "custom99",
            "title": "Custom Title",
            "file_sources": {
                "0": ["line 1"],
                "invalid_non_int": ["ignored line"],
            },
            "events": [raw_ev],
        }
        session = TraceSession.from_dict(data)
        assert session.id == "custom99"
        assert session.title == "Custom Title"
        assert 0 in session.file_sources
        assert "invalid_non_int" not in session.file_sources
        assert len(session.events) == 1
        assert session.events[0].func == "fn"

    def test_to_json_serialization(self, tmp_path):
        f = tmp_path / "json_test.py"
        f.write_text("val = 'hello'\n", encoding="utf-8")
        session = TraceSession()
        session.record_event("line", str(f), 1, "main", 0, "val = 'hello'", {"val": "'hello'"}, 1.0)
        
        json_str = session.to_json(indent=2)
        assert isinstance(json_str, str)
        parsed = json.loads(json_str)
        assert parsed["title"] == "PyDebug Session"
        assert len(parsed["events"]) == 1
        assert parsed["stats"]["total_events"] == 1
