"""Tests for incremental trace delivery to the local Studio listener."""
from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from pydebug.core.events import TraceEvent, TraceSession
from pydebug.integrations.live import LiveSessionPublisher


def test_publisher_sends_growing_snapshots_with_a_stable_session_id():
    session = TraceSession(title="POST /api/items")
    tracer = SimpleNamespace(session=session)
    publisher = LiveSessionPublisher(tracer, port=8899)
    event = {
        "seq": 0, "timestamp": 1.0, "kind": "line", "file_idx": 0,
        "line": 1, "func": "handler", "depth": 1, "src": "return 1",
    }

    with patch("pydebug.integrations.live.urllib.request.urlopen", return_value=MagicMock()) as urlopen:
        session.events.append(TraceEvent(**event))
        assert publisher.publish()
        session.events.append(TraceEvent(**{**event, "seq": 1, "line": 2}))
        assert publisher.publish()

    snapshots = [json.loads(call.args[0].data.decode("utf-8")) for call in urlopen.call_args_list]
    assert len(snapshots) == 2
    assert snapshots[0]["id"] == snapshots[1]["id"] == session.id
    assert [len(snapshot["events"]) for snapshot in snapshots] == [1, 2]
