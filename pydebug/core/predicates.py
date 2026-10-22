"""Hunter-style Query Predicate DSL (Q, And, Or, Not, When) for PyDebug."""
from __future__ import annotations

import fnmatch
from typing import Any, Callable


class Predicate:
    """Base predicate class for execution event filtering."""

    def __call__(self, event: Any) -> bool:
        raise NotImplementedError

    def __and__(self, other: Predicate) -> Predicate:
        return And(self, other)

    def __or__(self, other: Predicate) -> Predicate:
        return Or(self, other)

    def __invert__(self) -> Predicate:
        return Not(self)


class And(Predicate):
    def __init__(self, *predicates: Predicate) -> None:
        self.predicates = predicates

    def __call__(self, event: Any) -> bool:
        return all(p(event) for p in self.predicates)


class Or(Predicate):
    def __init__(self, *predicates: Predicate) -> None:
        self.predicates = predicates

    def __call__(self, event: Any) -> bool:
        return any(p(event) for p in self.predicates)


class Not(Predicate):
    def __init__(self, predicate: Predicate) -> None:
        self.predicate = predicate

    def __call__(self, event: Any) -> bool:
        return not self.predicate(event)


class Query(Predicate):
    """Filters events based on module, function, depth, or kind matching (Hunter style)."""

    def __init__(
        self,
        module: str | None = None,
        function: str | None = None,
        kind: str | None = None,
        depth_lt: int | None = None,
        depth_lte: int | None = None,
        filter_fn: Callable[[Any], bool] | None = None,
    ) -> None:
        self.module = module
        self.function = function
        self.kind = kind
        self.depth_lt = depth_lt
        self.depth_lte = depth_lte
        self.filter_fn = filter_fn

    def __call__(self, event: Any) -> bool:
        if self.kind and getattr(event, "kind", None) != self.kind:
            return False
        if self.depth_lt is not None and getattr(event, "depth", 0) >= self.depth_lt:
            return False
        if self.depth_lte is not None and getattr(event, "depth", 0) > self.depth_lte:
            return False
        if self.function:
            fn = getattr(event, "func", "")
            if not fnmatch.fnmatch(fn, self.function):
                return False
        if self.module:
            filename = getattr(event, "filename", "") or ""
            if not fnmatch.fnmatch(filename, f"*{self.module}*"):
                return False
        if self.filter_fn and not self.filter_fn(event):
            return False
        return True


def Q(
    module: str | None = None,
    function: str | None = None,
    kind: str | None = None,
    depth_lt: int | None = None,
    depth_lte: int | None = None,
    filter_fn: Callable[[Any], bool] | None = None,
) -> Query:
    """Convenience constructor for Hunter-style Q predicate queries."""
    return Query(
        module=module,
        function=function,
        kind=kind,
        depth_lt=depth_lt,
        depth_lte=depth_lte,
        filter_fn=filter_fn,
    )
