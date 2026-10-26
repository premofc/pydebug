"""AST Expression Spy for PyDebug (Birdseye-style sub-expression introspection).

Rewrites AST nodes of functions to wrap sub-expressions in evaluation spies,
capturing the real-time value of every binary operation, comparison, call,
attribute lookup, and subscript with exact character column spans.
"""
from __future__ import annotations

import ast
import functools
import inspect
import sys
import threading
from typing import Any, Callable

# Thread-local storage for captured expression events
_SPY_STORAGE = threading.local()


def _get_active_expressions() -> list[dict[str, Any]]:
    if not hasattr(_SPY_STORAGE, "expressions"):
        _SPY_STORAGE.expressions = []
    return _SPY_STORAGE.expressions


def clear_active_expressions() -> list[dict[str, Any]]:
    prev = list(_get_active_expressions())
    _SPY_STORAGE.expressions = []
    return prev


def _detailed_value_repr(val: Any) -> dict[str, Any]:
    """Extracts rich value metadata for Birdseye deep exploration."""
    t_name = type(val).__name__
    try:
        r = repr(val)
        short_val = r if len(r) <= 120 else r[:117] + "..."
    except Exception:
        short_val = "<unprintable>"

    meta: dict[str, Any] = {
        "val": short_val,
        "type": t_name,
        "is_container": isinstance(val, (list, tuple, dict, set)),
    }

    if isinstance(val, (list, tuple, set)):
        meta["length"] = len(val)
        try:
            meta["items_preview"] = [repr(x)[:60] for x in list(val)[:15]]
        except Exception:
            pass
    elif isinstance(val, dict):
        meta["length"] = len(val)
        try:
            meta["keys"] = [str(k) for k in list(val.keys())[:15]]
            meta["items_preview"] = {str(k)[:30]: repr(v)[:60] for k, v in list(val.items())[:10]}
        except Exception:
            pass

    return meta


def _spy_eval(val: Any, expr_src: str, lineno: int, col_start: int, col_end: int, node_type: str) -> Any:
    """Invoked at runtime whenever a wrapped AST expression executes."""
    try:
        exprs = _get_active_expressions()
        meta = _detailed_value_repr(val)
        exprs.append({
            "text": expr_src,
            "val": meta["val"],
            "type": meta["type"],
            "type_name": meta["type"],
            "line": lineno,
            "col_start": col_start,
            "col_end": col_end,
            "start_col": col_start,
            "end_col": col_end,
            "node_type": node_type,
            "is_container": meta.get("is_container", False),
            "length": meta.get("length"),
            "items_preview": meta.get("items_preview"),
        })
    except Exception:
        pass
    return val


class ExpressionTransformer(ast.NodeTransformer):
    """Walks the AST and wraps sub-expressions in `_spy_eval(...)` calls."""

    def __init__(self, source_lines: list[str], lineno_offset: int = 0) -> None:
        super().__init__()
        self.source_lines = source_lines
        # Added to recorded line numbers so they match the real source file.
        self.lineno_offset = lineno_offset

    def _extract_source(self, node: ast.AST) -> str:
        try:
            if hasattr(ast, "get_source_segment") and self.source_lines:
                full_src = "\n".join(self.source_lines)
                seg = ast.get_source_segment(full_src, node)
                if seg:
                    return seg
        except Exception:
            pass
        return getattr(node, "__class__", type(node)).__name__

    def _wrap_node(self, node: ast.AST, node_type: str) -> ast.AST:
        # Don't re-wrap or wrap already wrapped call nodes
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "_spy_eval":
            return node

        lineno = getattr(node, "lineno", 0) + self.lineno_offset
        col_start = getattr(node, "col_offset", 0)
        col_end = getattr(node, "end_col_offset", col_start + 10)
        src_text = self._extract_source(node)

        wrapped = ast.Call(
            func=ast.Name(id="_spy_eval", ctx=ast.Load()),
            args=[
                node,
                ast.Constant(value=src_text),
                ast.Constant(value=lineno),
                ast.Constant(value=col_start),
                ast.Constant(value=col_end),
                ast.Constant(value=node_type),
            ],
            keywords=[],
        )
        # Give every constructed node a real location. Bare nodes would be
        # stamped with the line-offset value by ast.increment_lineno later
        # (it fills missing linenos with 0 + n), producing phantom line events.
        ast.copy_location(wrapped, node)
        ast.copy_location(wrapped.func, node)
        for meta_arg in wrapped.args[1:]:
            ast.copy_location(meta_arg, node)
        return wrapped

    def visit_BinOp(self, node: ast.BinOp) -> ast.AST:
        self.generic_visit(node)
        return self._wrap_node(node, "bin_op")

    def visit_Compare(self, node: ast.Compare) -> ast.AST:
        self.generic_visit(node)
        return self._wrap_node(node, "compare")

    def visit_UnaryOp(self, node: ast.UnaryOp) -> ast.AST:
        self.generic_visit(node)
        return self._wrap_node(node, "unary_op")

    def visit_Subscript(self, node: ast.Subscript) -> ast.AST:
        self.generic_visit(node)
        if isinstance(node.ctx, ast.Load):
            return self._wrap_node(node, "subscript")
        return node

    def visit_Attribute(self, node: ast.Attribute) -> ast.AST:
        self.generic_visit(node)
        if isinstance(node.ctx, ast.Load) and not node.attr.startswith("__"):
            return self._wrap_node(node, "attribute")
        return node

    def visit_Call(self, node: ast.Call) -> ast.AST:
        self.generic_visit(node)
        if isinstance(node.func, ast.Name) and node.func.id in ("_spy_eval", "spy", "trace"):
            return node
        return self._wrap_node(node, "call")


def inspect_expressions(fn: Callable[..., Any]) -> Callable[..., Any]:
    """Decorator that rewrites a function's AST to spy on all sub-expressions."""
    try:
        src = inspect.getsource(fn)
        lines = src.splitlines()
        fn_node = next(n for n in ast.parse(src).body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)))

        # Cut the decorator lines out of the snippet. Compilation must not
        # re-execute them: the decorator would call inspect_expressions again
        # on the transformed function, wrapping it beyond recognition.
        num_dec_lines = getattr(fn_node, "lineno", 1) - 1
        body_lines = lines[num_dec_lines:]
        body_src = "\n".join(body_lines)

        # Since Python 3.8, co_firstlineno points at the first decorator, so
        # the real `def` line is that plus the decorator lines we removed.
        # Shift every AST line number onto the real file coordinates so both
        # the compiled code object and captured expressions report real lines.
        lineno_offset = fn.__code__.co_firstlineno + num_dec_lines - 1

        transformer = ExpressionTransformer(body_lines, lineno_offset=lineno_offset)
        transformed = transformer.visit(ast.parse(body_src))
        ast.increment_lineno(transformed, lineno_offset)
        ast.fix_missing_locations(transformed)

        closure_dict: dict[str, Any] = {
            "_spy_eval": _spy_eval,
            **fn.__globals__,
        }
        code_obj = compile(transformed, filename=inspect.getfile(fn), mode="exec")
        exec(code_obj, closure_dict)
        wrapped_fn = closure_dict[fn.__name__]

        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            return wrapped_fn(*args, **kwargs)

        return wrapper
    except Exception:
        return fn
