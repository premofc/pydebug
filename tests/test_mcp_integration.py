"""Tests for autonomous MCP tool call instrumentation."""
import asyncio
from pydebug.integrations.mcp import instrument_mcp_tool
from pydebug.server.app import get_session_manager


def test_instrument_async_mcp_tool():
    async def sample_tool(a: int, b: str = "ok") -> dict:
        return {"res": a * 2, "msg": b}

    wrapped = instrument_mcp_tool(sample_tool, tool_name="sample_tool", server_port=8899)
    result = asyncio.run(wrapped(10, b="success"))
    assert result == {"res": 20, "msg": "success"}

    mgr = get_session_manager()
    latest = mgr.get_latest()
    assert latest is not None
    assert latest.title == "[MCP Tool] sample_tool"
    assert latest.stats.get("tag") == "MCP Tool"
    assert len(latest.events) > 0


def test_instrument_sync_mcp_tool():
    def sync_calc_tool(val: int) -> int:
        return val + 100

    wrapped = instrument_mcp_tool(sync_calc_tool, tool_name="sync_calc_tool", server_port=8899)
    result = wrapped(42)
    assert result == 142

    mgr = get_session_manager()
    latest = mgr.get_latest()
    assert latest is not None
    assert latest.title == "[MCP Tool] sync_calc_tool"
