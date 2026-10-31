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

    # 1. Filename heuristic checks
    if any(stem == kw or stem.startswith(f"{kw}_") or stem.endswith(f"_{kw}") for kw in RUNNER_FILENAME_KEYWORDS):
        return ExecutionProfile.BATCH_RUNNER

    if any(stem == kw or stem.startswith(f"{kw}_") or stem.endswith(f"_{kw}") for kw in SERVER_FILENAME_KEYWORDS):
        return ExecutionProfile.SERVER_DAEMON

    # 2. Source code / AST analysis if file exists or code provided
    if source_code is None:
        try:
            if path.exists() and path.is_file():
                source_code = path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            return ExecutionProfile.STANDALONE_SCRIPT

    if source_code:
        try:
            tree = ast.parse(source_code)
            imports: set[str] = set()
            calls: set[str] = set()

            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        imports.add(alias.name.split(".")[0])
                elif isinstance(node, ast.ImportFrom) and node.module:
                    imports.add(node.module.split(".")[0])
                elif isinstance(node, ast.Call):
                    if isinstance(node.func, ast.Attribute):
                        calls.add(node.func.attr)
                    elif isinstance(node.func, ast.Name):
                        calls.add(node.func.id)

            if SERVER_AST_IMPORTS.intersection(imports):
                if any(c in calls for c in ("run", "serve", "serve_forever", "run_until_complete", "run_forever", "run_sse_async")):
                    return ExecutionProfile.SERVER_DAEMON
                if "uvicorn" in imports or "mcp" in imports:
                    return ExecutionProfile.SERVER_DAEMON

        except Exception:
            pass

    return ExecutionProfile.STANDALONE_SCRIPT

