"""Exhaustive tests for pydebug.cli covering LiveSessionSync, commands execution, auto-hook installation, and argument parsing."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

from pydebug.cli import (
    LiveSessionSync,
    cmd_install,
    cmd_run,
    cmd_uninstall,
    main,
)
from pydebug.core.events import TraceSession
from pydebug.core.tracer import PyTracer


class TestLiveSessionSync:
    def test_sync_snapshot_threshold_and_streaming(self):
        tracer = PyTracer()
        syncer = LiveSessionSync(tracer, port=8899, title="Sync Test")
        syncer.connected = True

        # Record dummy events
        for i in range(15):
            tracer.session.record_event("line", "test.py", i + 1, "fn", 1, "x = 1", {}, 10.0 + i)

        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_resp = MagicMock()
            mock_resp.status = 200
            mock_urlopen.return_value.__enter__.return_value = mock_resp

            # First sync sends initial batch
            syncer.sync_snapshot()
            assert syncer.last_sent_count == 15
            assert mock_urlopen.called

    def test_sync_snapshot_failure_resets_counter(self):
        tracer = PyTracer()
        syncer = LiveSessionSync(tracer, port=8899, title="Sync Test Fail")
        syncer.connected = True
        tracer.session.record_event("line", "test.py", 1, "fn", 1, "x = 1", {}, 1.0)

        with patch("urllib.request.urlopen", side_effect=Exception("Connection refused")):
            syncer.sync_snapshot()
            # On failure, last_sent_count reset so next tick retries
            assert syncer.last_sent_count == 0


class TestCliCommands:
    def test_cmd_run_script_execution(self, tmp_path):
        script = tmp_path / "target_script.py"
        script.write_text("x = 10\ny = 20\nres = x + y\n", encoding="utf-8")

        args = argparse.Namespace(
            file=str(script),
            module=False,
            port=8899,
            no_ui=True,
            no_open=True,
            script_args=[],
        )

        with patch("urllib.request.urlopen"):
            # Execute cmd_run with no UI and mocked server check
            cmd_run(args)

    def test_cmd_run_file_not_found(self):
        args = argparse.Namespace(
            file="C:/definitely_non_existent_file_abc.py",
            module=False,
            port=8899,
            no_ui=True,
            no_open=True,
            script_args=[],
        )
        with pytest.raises(SystemExit):
            cmd_run(args)

    def test_cmd_install_and_uninstall(self, tmp_path):
        args = argparse.Namespace()
        sp = tmp_path / "site-packages"
        sp.mkdir(parents=True, exist_ok=True)
        # Patch site.getsitepackages to return site-packages directory
        with patch("site.getsitepackages", return_value=[str(sp)]):
            cmd_install(args)
            hook_file = sp / "pydebug_hook.pth"
            assert hook_file.exists()
            assert "ENABLE_PYDEBUG" in hook_file.read_text(encoding="utf-8")

            # Uninstall
            cmd_uninstall(args)
            assert not hook_file.exists()


class TestCliMainParser:
    def test_main_help_when_no_args(self):
        with patch.object(sys, "argv", ["pydebug"]):
            with patch("argparse.ArgumentParser.print_help") as mock_help:
                main()
                mock_help.assert_called_once()

    def test_main_command_routing(self):
        with patch.object(sys, "argv", ["pydebug", "serve", "--port", "9000", "--no-open"]):
            with patch("pydebug.cli.cmd_serve") as mock_serve:
                main()
                mock_serve.assert_called_once()
