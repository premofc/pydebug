"""Small, bounded snapshot publisher for an in-flight trace session."""
from __future__ import annotations

import json
import threading
import urllib.request
from typing import Any


class LiveSessionPublisher:
    """Periodically publishes a tracer's growing session to the local Studio."""

    FREE_STREAM_LIMIT = 3000

    def __init__(self, tracer: Any, port: int, interval: float = 0.8) -> None:
        self.tracer = tracer
        self.port = port
        self.interval = interval
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_count = 0
        self._next_threshold = self.FREE_STREAM_LIMIT
        self._last_session_id: str | None = None
        self.published = False

    def start(self) -> None:
        self.tracer.session.stats["in_progress"] = True
        self._thread = threading.Thread(target=self._run, name="pydebug-session-publisher", daemon=True)
        self._thread.start()

    def _run(self) -> None:
        while not self._stop.wait(self.interval):
            self.publish()

    def publish(self, force: bool = False) -> bool:
        session = self.tracer.session
        count = len(session.events)
        if session.id != self._last_session_id:
            self._last_session_id = session.id
            self._last_count = 0
            self._next_threshold = self.FREE_STREAM_LIMIT
        if not force and (count <= self._last_count or (count > self.FREE_STREAM_LIMIT and count < self._next_threshold)):
            return self.published

        try:
            session.compute_stats()
            data = json.dumps(session.to_dict()).encode("utf-8")
            req = urllib.request.Request(
                f"http://127.0.0.1:{self.port}/api/sessions",
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=1.5):
                pass
            self.published = True
            self._last_count = count
            self._next_threshold = count + max(self.FREE_STREAM_LIMIT, count // 2)
            return True
        except Exception:
            # The local UI may not be running yet. Keep the capture local and
            # let the final flush retry before falling back to the process store.
            return False

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        self.tracer.session.stats["in_progress"] = False
        if not self.publish(force=True):
            try:
                from pydebug.server.app import get_session_manager
                get_session_manager().add_session(self.tracer.session)
            except Exception:
                pass
