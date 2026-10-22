import argparse
import json
import runpy
import sys
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


def auto_patch_asgi() -> None:
    """Automatically injects PyDebugMiddleware into any Starlette or FastAPI application."""
    try:
        from starlette.applications import Starlette
        from pydebug.integrations.fastapi import PyDebugMiddleware

        orig_build = Starlette.build_middleware_stack

        def patched_build(self):
            # Check if PyDebugMiddleware already present
            has_mw = any(
                getattr(m, "cls", None) is PyDebugMiddleware or m is PyDebugMiddleware
                for m in self.user_middleware
            )
            if not has_mw:
                self.add_middleware(PyDebugMiddleware)
            return orig_build(self)

        Starlette.build_middleware_stack = patched_build
    except ImportError:
        pass


def cmd_run(args: argparse.Namespace) -> None:
    cwd = Path.cwd().resolve()
    include_paths = [str(cwd)]

    is_module = args.module or (not args.file.endswith(".py") and not Path(args.file).exists())

    if is_module:
        mod_name = args.file
        print(f"⚡ [PyDebug] Tracing module {mod_name} in {cwd} ...")
        tracer = PyTracer(include_paths=include_paths)
        tracer.start()
        sys.argv = [mod_name, *args.script_args]
        try:
            runpy.run_module(mod_name, run_name="__main__", alter_sys=True)
        finally:
            session = tracer.stop()
            session.title = f'Module: {mod_name}'
            session.compute_stats()
    else:
        target = Path(args.file).resolve()
        if not target.exists():
            print(f"Error: file not found: {target}", file=sys.stderr)
            sys.exit(1)

        include_paths.extend([str(target), str(target.parent)])
        print(f"⚡ [PyDebug] Tracing {target.name} ...")
        tracer = PyTracer(include_paths=include_paths)
        tracer.start()
        sys.argv = [str(target), *args.script_args]
        try:
            runpy.run_path(str(target), run_name="__main__")
        finally:
            session = tracer.stop()
            session.title = f'Script: {target.name}'
            session.compute_stats()

    print(f"✨ [PyDebug] Execution finished: {len(session.events)} events recorded.")

    # Check if a listener server is already running on the given port
    is_server_running = False
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{args.port}/api/health")
        with urllib.request.urlopen(req, timeout=0.6) as resp:
            if resp.status == 200:
                is_server_running = True
    except Exception:
        is_server_running = False

    if is_server_running:
        try:
            data = json.dumps(session.to_dict()).encode("utf-8")
            post_req = urllib.request.Request(
                f"http://127.0.0.1:{args.port}/api/sessions",
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(post_req, timeout=3.0) as post_resp:
                print(f"✨ [PyDebug] Sent trace session directly to live dashboard at http://127.0.0.1:{args.port}")
        except Exception as e:
            print(f"⚠️ [PyDebug] Could not stream session to existing server: {e}")
    else:
        if not args.no_ui:
            serve_trace(session, port=args.port, auto_open=not args.no_open, block=True)


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
    pth_code = 'import os; os.getenv("ENABLE_PYDEBUG", "1") == "1" and __import__("pydebug").enable()\n'
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
