"""Exhaustive tests for pydebug.core.ast_spy covering AST sub-expression rewriting, thread-local storage, detailed value metadata, and edge cases."""
from __future__ import annotations

import ast
import pytest

from pydebug.core.ast_spy import (
    ExpressionTransformer,
    _detailed_value_repr,
    _get_active_expressions,
    _spy_eval,
    clear_active_expressions,
    inspect_expressions,
)


class TestDetailedValueRepr:
    def test_primitives(self):
        m_int = _detailed_value_repr(42)
        assert m_int["val"] == "42"
        assert m_int["type"] == "int"
        assert m_int["is_container"] is False

        m_str = _detailed_value_repr("hello")
        assert m_str["val"] == "'hello'"
        assert m_str["type"] == "str"

    def test_containers_list_tuple_set(self):
        sample_list = [1, 2, 3, "a", "b"]
        m_list = _detailed_value_repr(sample_list)
        assert m_list["is_container"] is True
        assert m_list["length"] == 5
        assert len(m_list["items_preview"]) == 5

        sample_set = {10, 20}
        m_set = _detailed_value_repr(sample_set)
        assert m_set["is_container"] is True
        assert m_set["length"] == 2

    def test_dict_container(self):
        sample_dict = {"name": "Alice", "score": 98.5}
        m_dict = _detailed_value_repr(sample_dict)
        assert m_dict["is_container"] is True
        assert m_dict["length"] == 2
        assert "name" in m_dict["keys"]
        assert "score" in m_dict["keys"]
        assert "name" in m_dict["items_preview"]

    def test_unprintable_object_handling(self):
        class BrokenRepr:
            def __repr__(self):
                raise RuntimeError("Cannot represent this object")

        broken = BrokenRepr()
        m_broken = _detailed_value_repr(broken)
        assert m_broken["val"] == "<unprintable>"
        assert m_broken["type"] == "BrokenRepr"

    def test_long_value_truncation(self):
        long_str = "x" * 200
        m_long = _detailed_value_repr(long_str)
        assert len(m_long["val"]) <= 120
        assert m_long["val"].endswith("...")


class TestSpyEvalAndThreadStorage:
    def test_spy_eval_records_and_returns_val(self):
        clear_active_expressions()
        val = 100
        returned = _spy_eval(
            val=val,
            expr_src="x * 10",
            lineno=12,
            col_start=4,
            col_end=10,
            node_type="bin_op",
        )
        assert returned == 100
        active = _get_active_expressions()
        assert len(active) == 1
        assert active[0]["text"] == "x * 10"
        assert active[0]["val"] == "100"
        assert active[0]["line"] == 12
        assert active[0]["node_type"] == "bin_op"

    def test_clear_active_expressions(self):
        clear_active_expressions()
        _spy_eval(1, "a", 1, 0, 1, "expr")
        assert len(_get_active_expressions()) == 1
        prev = clear_active_expressions()
        assert len(prev) == 1
        assert len(_get_active_expressions()) == 0


class TestExpressionTransformer:
    def test_extract_source_fallback(self):
        transformer = ExpressionTransformer([])
        node = ast.Constant(value=42)
        # Without source lines, extracts class name safely
        src = transformer._extract_source(node)
        assert src in ("Constant", "int")

    def test_wrap_node_avoids_double_wrapping(self):
        transformer = ExpressionTransformer(["x + 1"])
        call_node = ast.Call(
            func=ast.Name(id="_spy_eval", ctx=ast.Load()),
            args=[ast.Constant(value=1)],
            keywords=[],
        )
        # Calling wrap on an already wrapped _spy_eval returns the node as is
        wrapped = transformer._wrap_node(call_node, "call")
        assert wrapped is call_node

    def test_subscript_store_not_wrapped(self):
        # In `d['key'] = val`, the subscript is Store context and must not be wrapped
        source = "d['k'] = 10"
        tree = ast.parse(source)
        transformer = ExpressionTransformer(source.splitlines())
        new_tree = transformer.visit(tree)
        # The assign target must remain a Subscript, not an ast.Call to _spy_eval
        assign_node = new_tree.body[0]
        assert isinstance(assign_node.targets[0], ast.Subscript)

    def test_attribute_dunder_not_wrapped(self):
        source = "x = obj.__class__"
        tree = ast.parse(source)
        transformer = ExpressionTransformer(source.splitlines())
        new_tree = transformer.visit(tree)
        # __class__ should not be wrapped into _spy_eval
        assign_node = new_tree.body[0]
        assert isinstance(assign_node.value, ast.Attribute)


class TestInspectExpressionsDecorator:
    def test_inspect_expressions_sync_execution(self):
        clear_active_expressions()

        @inspect_expressions
        def math_pipeline(a, b):
            sum_val = a + b
            mult_val = sum_val * 2
            is_large = mult_val > 20
            return is_large, mult_val

        res, val = math_pipeline(8, 4)
        assert res is True
        assert val == 24

        exprs = clear_active_expressions()
        assert len(exprs) > 0
        texts = [e["text"] for e in exprs]
        assert any("a + b" in t for t in texts)
        assert any("sum_val * 2" in t for t in texts)
        assert any("mult_val > 20" in t for t in texts)

    def test_inspect_expressions_with_compound_subscripts_and_attributes(self):
        clear_active_expressions()

        class Box:
            def __init__(self, items):
                self.items = items

        @inspect_expressions
        def inspect_box(box, idx):
            return box.items[idx] * 3

        box = Box([10, 20, 30])
        res = inspect_box(box, 1)
        assert res == 60

        exprs = clear_active_expressions()
        assert len(exprs) > 0
        types = [e["node_type"] for e in exprs]
        assert "attribute" in types or "subscript" in types or "bin_op" in types

    def test_inspect_expressions_builtin_fallback(self):
        # Inspecting a builtin like `len` has no source code; it should return original fn gracefully
        wrapped = inspect_expressions(len)
        assert wrapped is len
        assert wrapped([1, 2, 3]) == 3
