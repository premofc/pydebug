import argparse
import json
import os
import runpy
import sys
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from pydebug.core.tracer import PyTracer
from pydebug.server.app import serve_trace


class LiveSessionSync:
    """Streams trace session updates in real-time to the PyDebug Studio server while code executes."""

    # Small sessions re-send freely on every tick. Larger ones only re-send when
    # they have grown by 50% since the last send; re-sending the full snapshot
    # every tick would make the total transfer O(n^2) in the number of events
    # and slow traced programs down dramatically.
    FREE_STREAM_LIMIT = 3000

    def __init__(self, tracer: PyTracer, port: int, title: str) -> None:
        self.tracer = tracer
        self.port = port
        self.title = title
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None
        self.last_sent_count = 0
        self.next_send_threshold = self.FREE_STREAM_LIMIT
        self.connected = False

    def check_server(self) -> bool:
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{self.port}/api/health")
            with urllib.request.urlopen(req, timeout=0.6) as resp:
                return resp.status == 200
        except Exception:
            return False

    def start(self) -> None:
        if self.check_server():
            self.connected = True
            print(f"✨ [PyDebug] Live real-time stream connected to Studio at http://127.0.0.1:{self.port}")
            self.thread = threading.Thread(target=self._run_loop, daemon=True)
            self.thread.start()

    def sync_snapshot(self) -> None:
        if not self.connected:
            return
        sess = self.tracer.session
        curr_count = len(sess.events)
        if curr_count <= self.last_sent_count:
            return
        if curr_count > self.FREE_STREAM_LIMIT and curr_count < self.next_send_threshold:
            return
        self.last_sent_count = curr_count
        self.next_send_threshold = curr_count + max(self.FREE_STREAM_LIMIT, curr_count // 2)
        try:
            sess.title = self.title
            sess.compute_stats()
            data = json.dumps(sess.to_dict()).encode("utf-8")
            post_req = urllib.request.Request(
                f"http://127.0.0.1:{self.port}/api/sessions",
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(post_req, timeout=10.0):
                pass
        except Exception:
            # Sending failed: allow the next tick to retry this snapshot.
            self.last_sent_count = 0
            if curr_count > self.FREE_STREAM_LIMIT:
                self.next_send_threshold = 0

    def _run_loop(self) -> None:
        while not self.stop_event.is_set():
            time.sleep(0.8)
            self.sync_snapshot()

    def stop(self) -> None:
        self.stop_event.set()
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)
        # Final flush
        self.sync_snapshot()


def cmd_run(args: argparse.Namespace) -> None:
    cwd = Path.cwd().resolve()
    include_paths = [str(cwd)]

    # Check if a listener server is already running on the given port
    is_server_running = False
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{args.port}/api/health")
        with urllib.request.urlopen(req, timeout=0.6) as resp:
            if resp.status == 200:
                is_server_running = True
    except Exception:
        is_server_running = False

    # If no server is running yet and UI is wanted, launch Studio in the background
    if not is_server_running and not args.no_ui:
        print(f"⚡ [PyDebug] Starting live Studio server on port {args.port} ...")
        serve_trace(session=None, port=args.port, auto_open=not args.no_open, block=False)
        time.sleep(0.5)

    is_module = args.module or (not args.file.endswith(".py") and not Path(args.file).exists())

    # Never trace PyDebug's own package: when running pytest files the test
    # suite itself instantiates nested tracers, and every inner trace event
    # would multiply into outer-trace events (O(n^2) blowup / apparent hang).
    cli_excludes: list[str] = []
    try:
        from pydebug import __file__ as _pd_init
        cli_excludes.append(os.path.dirname(os.path.abspath(_pd_init)) + os.sep)
    except Exception:
        pass

    if is_module:
        mod_name = args.file
        print(f"⚡ [PyDebug] Tracing module {mod_name} in {cwd} ...")
        tracer = PyTracer(include_paths=include_paths, exclude_prefixes=cli_excludes)
        syncer = LiveSessionSync(tracer, port=args.port, title=f"Module: {mod_name}")
        syncer.start()
        tracer.start()
        sys.argv = [mod_name, *args.script_args]
        try:
            runpy.run_module(mod_name, run_name="__main__", alter_sys=True)
        finally:
            syncer.stop()
            session = tracer.stop()
            session.title = f"Module: {mod_name}"
            session.compute_stats()
    else:
        target = Path(args.file).resolve()
        if not target.exists():
            print(f"Error: file not found: {target}", file=sys.stderr)
            sys.exit(1)

        # Pytest test files must be executed through pytest, otherwise only the
        # module import is traced and the actual test functions never run.
        is_test_file = target.name.startswith("test_") or target.name.endswith("_test.py")

        include_paths.extend([str(target), str(target.parent)])
        print(f"⚡ [PyDebug] Tracing {target.name} ...")
        tracer = PyTracer(include_paths=include_paths, exclude_prefixes=cli_excludes)
        syncer = LiveSessionSync(tracer, port=args.port, title=f"Script: {target.name}")
        syncer.start()
        tracer.start()
        sys.argv = [str(target), *args.script_args]
        try:
            if is_test_file:
                import pytest

                print(f"✨ [PyDebug] Detected pytest test file - running {target.name} through pytest.main() ...")
                pytest.main([str(target), "-v", "-s", *args.script_args])
            else:
                runpy.run_path(str(target), run_name="__main__")
        finally:
            syncer.stop()
            session = tracer.stop()
            prefix = "Test Run: " if is_test_file else "Script: "
            session.title = f"{prefix}{target.name}"
            session.compute_stats()

    print(f"✨ [PyDebug] Execution finished: {len(session.events)} events recorded.")

    # Final sync check if server is running (full snapshot; large traces need a generous timeout)
    try:
        data = json.dumps(session.to_dict()).encode("utf-8")
        post_req = urllib.request.Request(
            f"http://127.0.0.1:{args.port}/api/sessions",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(post_req, timeout=60.0) as post_resp:
            print(f"✨ [PyDebug] Trace session synced to live dashboard at http://127.0.0.1:{args.port}")
    except Exception:
        print(f"⚠️ [PyDebug] Final sync failed: {len(session.events)} events remain in this process only.")


def cmd_demo(args: argparse.Namespace) -> None:
    from pydebug.examples.demo_algorithms import run_demo
    print("⚡ [PyDebug] Launching interactive algorithms & sub-expression demo ...")
    session = run_demo()
    serve_trace(session, port=args.port, auto_open=not args.no_open, block=True)


def cmd_serve(args: argparse.Namespace) -> None:
    print(f"⚡ [PyDebug] Starting visualization server on port {args.port} ...")
    serve_trace(session=None, port=args.port, auto_open=not args.no_open, block=True)


def cmd_install(args: argparse.Namespace) -> None:
    import site
    packages = [Path(p) for p in site.getsitepackages() if Path(p).name == "site-packages"]
    pth_code = 'import os; os.getenv("ENABLE_PYDEBUG", "0") == "1" and __import__("pydebug").enable()\n'
    if packages:
        target = packages[0] / "pydebug_hook.pth"
        target.write_text(pth_code, encoding="utf-8")
        print(f"⚡ [PyDebug] Global auto-hook installed to virtual environment: {target}")
    else:
        target = Path.cwd() / "sitecustomize.py"
        target.write_text(pth_code, encoding="utf-8")
        print(f"⚡ [PyDebug] Global auto-hook installed to: {target}")
    print("✨ Every script, MCP server, API, and test in this environment will now auto-record to PyDebug Studio at http://127.0.0.1:8899.")


def cmd_uninstall(args: argparse.Namespace) -> None:
    import site
    removed = 0
    for p in site.getsitepackages():
        pth = Path(p) / "pydebug_hook.pth"
        if pth.exists():
            pth.unlink()
            print(f"🗑️ [PyDebug] Removed {pth}")
            removed += 1
    sc = Path.cwd() / "sitecustomize.py"
    if sc.exists():
        try:
            if "pydebug" in sc.read_text(encoding="utf-8"):
                sc.unlink()
                print(f"🗑️ [PyDebug] Removed {sc}")
                removed += 1
        except Exception:
            pass
    if removed > 0:
        print("✨ [PyDebug] Global auto-hook uninstalled successfully.")
    else:
        print("ℹ️ [PyDebug] No active auto-hooks found to remove.")


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="pydebug",
        description="Next-Gen 3D Visual Python Debugger (Hunter + Birdseye hybrid)",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # run command
    p_run = subparsers.add_parser("run", help="Run and debug a Python script or module")
    p_run.add_argument("file", help="Python script file or module name to trace and debug")
    p_run.add_argument("-m", "--module", action="store_true", help="Run library module as a script")
    p_run.add_argument("--port", type=int, default=8899, help="UI port (default: 8899)")
    p_run.add_argument("--no-ui", action="store_true", help="Capture trace without launching browser UI")
    p_run.add_argument("--no-open", action="store_true", help="Do not automatically open browser")
    p_run.add_argument("script_args", nargs="*", help="Arguments passed to script")

    # demo command
    p_demo = subparsers.add_parser("demo", help="Run interactive demo with 3D visualization")
    p_demo.add_argument("--port", type=int, default=8899, help="UI port (default: 8899)")
    p_demo.add_argument("--no-open", action="store_true", help="Do not automatically open browser")

    # serve command
    p_serve = subparsers.add_parser("serve", help="Launch UI viewer server")
    p_serve.add_argument("--port", type=int, default=8899, help="UI port (default: 8899)")
    p_serve.add_argument("--no-open", action="store_true", help="Do not automatically open browser")

    # install command
    subparsers.add_parser("install", help="Install global auto-hook into virtual environment (auto-record everything)")

    # uninstall command
    subparsers.add_parser("uninstall", help="Remove global auto-hook")

    args = parser.parse_args()

    if args.command == "run":
        cmd_run(args)
    elif args.command == "demo":
        cmd_demo(args)
    elif args.command == "serve":
        cmd_serve(args)
    elif args.command == "install":
        cmd_install(args)
    elif args.command == "uninstall":
        cmd_uninstall(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
