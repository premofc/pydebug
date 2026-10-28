"""Exhaustive tests for pydebug.server.ai covering AIProviderConfig, AIManager providers, key masking, caching, and fallback handling."""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch
import urllib.error
import pytest

from pydebug.server.ai import AIProviderConfig, AIManager, get_ai_manager


class TestAIProviderConfig:
    def test_default_config_properties(self):
        cfg = AIProviderConfig()
        assert cfg.provider == "ollama"
        assert cfg.model == "qwen2.5:7b-instruct"
        assert cfg.base_url == "http://127.0.0.1:11434"
        assert cfg.api_key == ""
        assert cfg.temperature == 0.2

    def test_api_key_masking(self):
        # Long key gets masked
        cfg = AIProviderConfig(api_key="sk-proj-1234567890abcdef")
        public = cfg.to_public_dict()
        assert public["has_api_key"] is True
        assert public["api_key_masked"] == "sk-p...def"

        # Short key gets masked
        cfg_short = AIProviderConfig(api_key="1234")
        assert cfg_short.to_public_dict()["has_api_key"] is True
        assert cfg_short.to_public_dict()["api_key_masked"] == "***"

        # Empty key
        cfg_none = AIProviderConfig(api_key="")
        assert cfg_none.to_public_dict()["has_api_key"] is False
        assert cfg_none.to_public_dict()["api_key_masked"] == ""


class TestAIManager:
    def test_singleton_accessor(self):
        mgr1 = get_ai_manager()
        mgr2 = get_ai_manager()
        assert mgr1 is mgr2

    def test_save_and_update_config(self):
        mgr = AIManager()
        updated = mgr.save_config(
            provider="openai",
            model="gpt-4o-mini",
            base_url="https://api.openai.com/v1",
            api_key="sk-test-secret-key-1234",
            temperature=0.5,
        )
        assert mgr.config.provider == "openai"
        assert mgr.config.model == "gpt-4o-mini"
        assert mgr.config.api_key == "sk-test-secret-key-1234"
        assert mgr.config.temperature == 0.5
        assert updated.provider == "openai"

    @patch("urllib.request.urlopen")
    def test_fetch_models_ollama(self, mock_urlopen):
        mgr = AIManager()
        # Mock Ollama /api/tags response
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "models": [{"name": "qwen2.5:7b-instruct"}, {"name": "llama3.1:8b"}]
        }).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_response

        models = mgr.fetch_models(provider="ollama", base_url="http://127.0.0.1:11434")
        assert "qwen2.5:7b-instruct" in models
        assert "llama3.1:8b" in models

    @patch("urllib.request.urlopen")
    def test_test_connection_ollama_success_and_failure(self, mock_urlopen):
        mgr = AIManager()

        # Success case
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({"version": "0.5.4"}).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        res = mgr.test_connection(provider="ollama", base_url="http://127.0.0.1:11434")
        assert res["success"] is True
        assert "0.5.4" in res["message"]

        # Failure case
        mock_urlopen.side_effect = urllib.error.URLError("Connection refused")
        res_fail = mgr.test_connection(provider="ollama", base_url="http://127.0.0.1:11434")
        assert res_fail["success"] is False
        assert "connection error" in res_fail["message"].lower()

    def test_test_connection_openai_missing_key(self):
        mgr = AIManager()
        res = mgr.test_connection(provider="openai", base_url="https://api.openai.com/v1", api_key="")
        assert res["success"] is False
        assert "API Key required" in res["message"]

    @patch("urllib.request.urlopen")
    def test_test_connection_openai_401_unauthorized(self, mock_urlopen):
        mgr = AIManager()
        mock_urlopen.side_effect = urllib.error.HTTPError(
            url="https://api.openai.com/v1/models",
            code=401,
            msg="Unauthorized",
            hdrs={},
            fp=None,
        )
        res = mgr.test_connection(provider="openai", base_url="https://api.openai.com/v1", api_key="sk-bad-key")
        assert res["success"] is False
        assert "401 Unauthorized" in res["message"]

    @patch("urllib.request.urlopen")
    def test_explain_line_caching_and_execution(self, mock_urlopen):
        mgr = AIManager()
        mgr.config.provider = "ollama"
        mgr._cache.clear()

        # Mock Ollama generation response
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({
            "response": json.dumps({
                "explanation": "Calculated variable with value 42.",
                "suggestion": "Check boundary limits.",
            })
        }).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        # First call -> network call executed
        res1 = mgr.explain_line(
            func="compute_tax",
            line=15,
            src="tax = total * 0.1",
            vars_dict={"total": "100", "tax": "10"},
            diffs_dict={"tax": {"old": "<unset>", "new": "10"}},
            expressions=[{"text": "total * 0.1", "val": "10"}],
        )
        assert res1["cached"] is False
        assert res1["explanation"] == "Calculated variable with value 42."

        # Second call with identical arguments -> served from cache
        res2 = mgr.explain_line(
            func="compute_tax",
            line=15,
            src="tax = total * 0.1",
            vars_dict={"total": "100", "tax": "10"},
            diffs_dict={"tax": {"old": "<unset>", "new": "10"}},
            expressions=[{"text": "total * 0.1", "val": "10"}],
        )
        assert res2["cached"] is True
        assert res2["explanation"] == "Calculated variable with value 42."

    @patch("urllib.request.urlopen")
    def test_explain_line_failure_graceful_fallback(self, mock_urlopen):
        mgr = AIManager()
        mgr.config.provider = "ollama"
        mgr._cache.clear()

        mock_urlopen.side_effect = TimeoutError("Ollama timed out")
        res = mgr.explain_line(
            func="faulty_line",
            line=99,
            src="raise Exception()",
            vars_dict={"err": "True"},
            diffs_dict={},
            expressions=[],
        )
        # Should gracefully return explanation fallback without crashing
        assert res["cached"] is False
        assert "Line 99 in faulty_line()" in res["explanation"]
        assert "timed out" in res["suggestion"].lower() or "ollama" in res["suggestion"].lower()
