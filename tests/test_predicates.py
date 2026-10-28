"""Exhaustive tests for pydebug.core.predicates covering Q, And, Or, Not, fnmatch, edge cases, and custom filter callbacks."""
from __future__ import annotations

import pytest
from pydebug.core.predicates import And, Not, Or, Predicate, Q, Query


class DummyEvent:
    def __init__(self, kind="line", depth=1, func="test_func", filename="sample.py"):
        self.kind = kind
        self.depth = depth
        self.func = func
        self.filename = filename


class TestPredicatesDsl:
    def test_predicate_base_raises(self):
        base = Predicate()
        with pytest.raises(NotImplementedError):
            base(DummyEvent())

    def test_query_defaults_matches_all(self):
        q = Q()
        ev = DummyEvent()
        assert q(ev) is True

    def test_query_kind_filter(self):
        q_call = Q(kind="call")
        q_line = Q(kind="line")

        ev_call = DummyEvent(kind="call")
        ev_line = DummyEvent(kind="line")

        assert q_call(ev_call) is True
        assert q_call(ev_line) is False
        assert q_line(ev_line) is True
        assert q_line(ev_call) is False

    def test_query_depth_lt_and_depth_lte(self):
        q_lt5 = Q(depth_lt=5)
        assert q_lt5(DummyEvent(depth=4)) is True
        assert q_lt5(DummyEvent(depth=5)) is False
        assert q_lt5(DummyEvent(depth=6)) is False

        q_lte5 = Q(depth_lte=5)
        assert q_lte5(DummyEvent(depth=4)) is True
        assert q_lte5(DummyEvent(depth=5)) is True
        assert q_lte5(DummyEvent(depth=6)) is False

    def test_query_function_fnmatch(self):
        q_wildcard = Q(function="test_*")
        assert q_wildcard(DummyEvent(func="test_run")) is True
        assert q_wildcard(DummyEvent(func="test_calc")) is True
        assert q_wildcard(DummyEvent(func="run_test")) is False

        q_exact = Q(function="calculate_tax")
        assert q_exact(DummyEvent(func="calculate_tax")) is True
        assert q_exact(DummyEvent(func="calculate_discount")) is False

    def test_query_module_fnmatch(self):
        q_mod = Q(module="services")
        assert q_mod(DummyEvent(filename="/app/services/checkout.py")) is True
        assert q_mod(DummyEvent(filename="C:\\code\\services\\repo.py")) is True
        assert q_mod(DummyEvent(filename="/app/models/user.py")) is False

    def test_query_custom_filter_fn(self):
        q_custom = Q(filter_fn=lambda e: getattr(e, "depth", 0) % 2 == 0)
        assert q_custom(DummyEvent(depth=2)) is True
        assert q_custom(DummyEvent(depth=3)) is False

    def test_query_missing_attributes_graceful(self):
        class EmptyEvent:
            pass

        empty = EmptyEvent()
        # Should not crash with missing attributes
        assert Q(kind="line")(empty) is False
        assert Q(function="test_fn")(empty) is False
        assert Q(module="core")(empty) is False
        assert Q(depth_lt=5)(empty) is True  # default depth 0 < 5

    def test_combinator_and(self):
        p1 = Q(kind="call")
        p2 = Q(depth_lt=3)
        combined = p1 & p2

        assert isinstance(combined, And)
        assert combined(DummyEvent(kind="call", depth=2)) is True
        assert combined(DummyEvent(kind="call", depth=4)) is False
        assert combined(DummyEvent(kind="line", depth=2)) is False

    def test_combinator_or(self):
        p1 = Q(kind="call")
        p2 = Q(kind="return")
        combined = p1 | p2

        assert isinstance(combined, Or)
        assert combined(DummyEvent(kind="call")) is True
        assert combined(DummyEvent(kind="return")) is True
        assert combined(DummyEvent(kind="line")) is False

    def test_combinator_not(self):
        p1 = Q(kind="line")
        inverted = ~p1

        assert isinstance(inverted, Not)
        assert inverted(DummyEvent(kind="line")) is False
        assert inverted(DummyEvent(kind="call")) is True

    def test_complex_composite_expression(self):
        # (func matches 'calc*' OR 'compute*') AND depth <= 3 AND NOT kind == 'return'
        expr = (Q(function="calc*") | Q(function="compute*")) & Q(depth_lte=3) & ~Q(kind="return")

        assert expr(DummyEvent(func="calc_sum", depth=2, kind="line")) is True
        assert expr(DummyEvent(func="compute_val", depth=3, kind="call")) is True
        assert expr(DummyEvent(func="calc_sum", depth=4, kind="line")) is False   # depth > 3
        assert expr(DummyEvent(func="compute_val", depth=2, kind="return")) is False # kind is return
        assert expr(DummyEvent(func="other_fn", depth=1, kind="line")) is False   # func mismatch
