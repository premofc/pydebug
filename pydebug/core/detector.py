"""Detector for identifying long-running server daemons, batch runners, and standalone scripts."""
from __future__ import annotations

import ast
from enum import Enum
from pathlib import Path


class ExecutionProfile(str, Enum):
    STANDALONE_SCRIPT = "script"
    SERVER_DAEMON = "server"
    BATCH_RUNNER = "runner"


SERVER_FILENAME_KEYWORDS = (
    "run_server",
    "server",
    "serve",
    "daemon",
    "worker",
    "celery",
    "uvicorn",
)

RUNNER_FILENAME_KEYWORDS = (
    "run_all",
    "runner",
    "benchmark",
    "pipeline",
    "orchestrator",
)

SERVER_AST_IMPORTS = {
    "uvicorn",
    "fastapi",
    "starlette",
    "mcp",
    "mcp.server",
    "flask",
    "tornado",
    "sanic",
    "aiohttp",
    "gunicorn",
}


def detect_execution_profile(file_path: str | Path, source_code: str | None = None) -> ExecutionProfile:
    """Analyzes a script path and AST structure to classify its execution profile."""
    path = Path(file_path)
    stem = path.stem.lower()

    if source_code is None:
        try:
            if path.exists() and path.is_file():
                source_code = path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            source_code = None

    # Inspect the entrypoint before filename heuristics. Orchestrators such as
    # run_all.py are commonly named as batch runners while also starting API
    # and MCP daemons; those need the server hooks so later requests are traced.
    imports: set[str] = set()
    calls: set[str] = set()
    if source_code:
        try:
            tree = ast.parse(source_code)
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    imports.update(alias.name.lower() for alias in node.names)
                elif isinstance(node, ast.ImportFrom) and node.module:
                    imports.add(node.module.lower())
                    imports.update(alias.name.lower() for alias in node.names)
                elif isinstance(node, ast.Call):
                    if isinstance(node.func, ast.Attribute):
                        calls.add(node.func.attr.lower())
                    elif isinstance(node.func, ast.Name):
                        calls.add(node.func.id.lower())

            import_parts = {part for module in imports for part in module.split(".")}
            server_frameworks = {"uvicorn", "fastapi", "starlette", "mcp", "flask", "tornado", "sanic", "aiohttp", "gunicorn"}
            server_calls = {"run", "serve", "serve_forever", "run_until_complete", "run_forever", "run_sse_async", "start_server", "serve_http"}
            named_server_calls = any(
                token in call for call in calls
                for token in ("run_server", "start_server", "serve_server", "run_api", "start_api", "run_mcp", "start_mcp")
            )
            if (server_frameworks & import_parts) and (server_calls & calls or named_server_calls or {"uvicorn", "mcp"} & import_parts):
                return ExecutionProfile.SERVER_DAEMON
            # A run_all entrypoint importing both API and MCP server modules is
            # an orchestrated daemon even when it delegates startup to helpers.
            has_api_module = any("api" in part for part in import_parts)
            has_mcp_module = any("mcp" in part for part in import_parts)
            if stem == "run_all" and has_api_module and has_mcp_module:
                return ExecutionProfile.SERVER_DAEMON
        except Exception:
            pass

    # 1. Filename heuristic checks
    if any(stem == kw or stem.startswith(f"{kw}_") or stem.endswith(f"_{kw}") for kw in RUNNER_FILENAME_KEYWORDS):
        return ExecutionProfile.BATCH_RUNNER

    if any(stem == kw or stem.startswith(f"{kw}_") or stem.endswith(f"_{kw}") for kw in SERVER_FILENAME_KEYWORDS):
        return ExecutionProfile.SERVER_DAEMON

    return ExecutionProfile.STANDALONE_SCRIPT

