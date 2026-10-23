"""Data structures and event representations for PyDebug."""
from __future__ import annotations

import datetime
import json
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class SubExpression:
    """Represents a fine-grained sub-expression evaluated during a code line (Birdseye-style)."""
    text: str
    val: str
    type_name: str
    start_col: int
    end_col: int
    node_type: str = "expr"


@dataclass
class TraceEvent:
    """Represents an execution event (line execution, call, return, exception)."""
    seq: int
    timestamp: float
    kind: str             # "call" | "line" | "return" | "exception"
    file_idx: int
    line: int
    func: str
    depth: int
    src: str
    vars: dict[str, str] = field(default_factory=dict)
    vars_diff: dict[str, dict[str, str]] = field(default_factory=dict)  # {"var_name": {"old": "...", "new": "..."}}
    return_val: str | None = None
    exc_type: str | None = None
    exc_val: str | None = None
    expressions: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class TraceSession:
    """Contains all files, events, and metrics captured during a trace execution."""
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    title: str = "PyDebug Session"
    created_at: str = field(default_factory=lambda: datetime.datetime.now().isoformat())
    files: list[str] = field(default_factory=list)
    file_sources: dict[int, list[str]] = field(default_factory=dict)
    events: list[TraceEvent] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=dict)
    _file_idx_cache: dict[str, int] = field(default_factory=dict, repr=False)
    _last_vars_by_func: dict[str, dict[str, str]] = field(default_factory=dict, repr=False)

    def register_file(self, filename: str) -> int:
        clean_path = str(Path(filename).resolve())
        if clean_path not in self._file_idx_cache:
            idx = len(self.files)
            self._file_idx_cache[clean_path] = idx
            self.files.append(clean_path)
            try:
                content = Path(clean_path).read_text(encoding="utf-8", errors="replace")
                self.file_sources[idx] = content.splitlines()
            except Exception:
                self.file_sources[idx] = []
        return self._file_idx_cache[clean_path]

    def record_event(
        self,
        kind: str,
        filename: str,
        lineno: int,
        func: str,
        depth: int,
        source: str,
        locals_dict: dict[str, str],
        timestamp: float,
        return_val: str | None = None,
        exc_type: str | None = None,
        exc_val: str | None = None,
        expressions: list[dict[str, Any]] | None = None,
    ) -> TraceEvent:
        fidx = self.register_file(filename)

        # Compute variable mutations scoped by function
        diffs: dict[str, dict[str, str]] = {}
        last_for_func = self._last_vars_by_func.get(func, {})
        for k, v in locals_dict.items():
            if k not in last_for_func:
                diffs[k] = {"old": "<unset>", "new": v}
            elif last_for_func[k] != v:
                diffs[k] = {"old": last_for_func[k], "new": v}
        self._last_vars_by_func[func] = dict(locals_dict)

        ev = TraceEvent(
            seq=len(self.events),
            timestamp=timestamp,
            kind=kind,
            file_idx=fidx,
            line=lineno,
            func=func,
            depth=depth,
            src=source.strip(),
            vars=dict(locals_dict),
            vars_diff=diffs,
            return_val=return_val,
            exc_type=exc_type,
            exc_val=exc_val,
            expressions=expressions or [],
        )
        self.events.append(ev)
        return ev

    def compute_stats(self) -> None:
        self.stats = {
            "total_events": len(self.events),
            "files_count": len(self.files),
            "calls_count": sum(1 for e in self.events if e.kind == "call"),
            "returns_count": sum(1 for e in self.events if e.kind == "return"),
            "exceptions_count": sum(1 for e in self.events if e.kind == "exception"),
            "max_depth": max((e.depth for e in self.events), default=0),
            "duration_ms": (
                round((self.events[-1].timestamp - self.events[0].timestamp) * 1000, 2)
                if len(self.events) > 1 else 0.0
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TraceSession":
        events = []
        for ev in data.get("events", []):
            if isinstance(ev, dict):
                events.append(TraceEvent(**ev))
            else:
                events.append(ev)
        sources = {}
        for k, v in data.get("file_sources", {}).items():
            try:
                sources[int(k)] = v
            except ValueError:
                pass
        return cls(
            id=data.get("id", str(uuid.uuid4())[:8]),
            title=data.get("title", "PyDebug Session"),
            created_at=data.get("created_at", datetime.datetime.now().isoformat()),
            files=data.get("files", []),
            file_sources=sources,
            events=events,
            stats=data.get("stats", {}),
        )

    def to_dict(self) -> dict[str, Any]:
        self.compute_stats()
        return {
            "id": self.id,
            "title": self.title,
            "created_at": self.created_at,
            "files": self.files,
            "file_sources": self.file_sources,
            "events": [asdict(e) for e in self.events],
            "stats": self.stats,
        }

    def to_json(self, indent: int | None = None) -> str:
        return json.dumps(self.to_dict(), indent=indent)

