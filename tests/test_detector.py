"""Tests for server and runner execution profile detector."""
from pydebug.core.detector import ExecutionProfile, detect_execution_profile


def test_detect_by_filename():
    assert detect_execution_profile("server/run_server.py") == ExecutionProfile.SERVER_DAEMON
    assert detect_execution_profile("run_all.py") == ExecutionProfile.BATCH_RUNNER
    assert detect_execution_profile("benchmark_suite.py") == ExecutionProfile.BATCH_RUNNER
    assert detect_execution_profile("calculate.py") == ExecutionProfile.STANDALONE_SCRIPT


def test_detect_by_ast_code():
    mcp_code = """
import sys
from mcp.server import MCPServer

mcp = MCPServer("test")
if __name__ == "__main__":
    mcp.run()
"""
    assert detect_execution_profile("custom_entry.py", source_code=mcp_code) == ExecutionProfile.SERVER_DAEMON

    uvicorn_code = """
import uvicorn

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000)
"""
    assert detect_execution_profile("main.py", source_code=uvicorn_code) == ExecutionProfile.SERVER_DAEMON

    script_code = """
def add(a, b):
    return a + b

print(add(2, 3))
"""
    assert detect_execution_profile("calc.py", source_code=script_code) == ExecutionProfile.STANDALONE_SCRIPT

