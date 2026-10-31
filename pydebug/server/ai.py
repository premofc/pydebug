"""Multi-provider LLM integration for PyDebug Studio.

Supports local & remote Ollama, OpenAI, DeepSeek, and any custom OpenAI-compatible
endpoint (Groq, OpenRouter, vLLM, LM Studio, etc.) with dynamic model fetching,
connection health testing, and persistent user configuration.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


CONFIG_DIR = Path.home() / ".pydebug"
CONFIG_FILE = CONFIG_DIR / "ai_config.json"

DEFAULT_PRESETS = {
    "ollama": {
        "base_url": "http://127.0.0.1:11434",
        "default_model": "qwen2.5:7b-instruct",
        "models": ["qwen2.5:7b-instruct", "llama3.1:8b", "mistral:7b", "deepseek-r1:8b"],
        "requires_key": False,
    },
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "default_model": "gpt-4o-mini",
        "models": ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
        "requires_key": True,
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "default_model": "deepseek-chat",
        "models": ["deepseek-chat", "deepseek-reasoner"],
        "requires_key": True,
    },
    "custom": {
        "base_url": "https://api.groq.com/openai/v1",
        "default_model": "llama-3.3-70b-versatile",
        "models": ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
        "requires_key": True,
    },
}


@dataclass
class AIProviderConfig:
    provider: str = "ollama"  # ollama | openai | deepseek | custom
    base_url: str = "http://127.0.0.1:11434"
    model: str = "qwen2.5:7b-instruct"
    api_key: str = ""
    temperature: float = 0.2

    def to_public_dict(self) -> dict[str, Any]:
        """Returns dict without exposing full API secret to UI."""
        return {
            "provider": self.provider,
            "base_url": self.base_url,
            "model": self.model,
            "temperature": self.temperature,
            "has_api_key": bool(self.api_key.strip()),
            "api_key_masked": f"{self.api_key[:4]}...{self.api_key[-3:]}" if len(self.api_key) > 7 else ("***" if self.api_key else ""),
        }


def _extract_json_or_text(raw_text: str) -> dict[str, str]:
    """Resiliently extracts JSON {explanation, suggestion} or falls back cleanly."""
    raw_text = raw_text.strip()
    if "```" in raw_text:
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw_text, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group(1))
                if isinstance(data, dict):
                    return {k: str(v) for k, v in data.items()}
            except Exception:
                pass

    try:
        data = json.loads(raw_text)
        if isinstance(data, dict):
            return {k: str(v) for k, v in data.items()}
    except Exception:
        pass

    match = re.search(r"(\{.*\})", raw_text, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(1))
            if isinstance(data, dict):
                return {k: str(v) for k, v in data.items()}
        except Exception:
            pass

    lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
    if len(lines) >= 2:
        return {
            "explanation": lines[0],
            "suggestion": " ".join(lines[1:]),
        }
    return {
        "explanation": raw_text or "No explanation returned by AI.",
        "suggestion": "Review execution trace step.",
    }


class AIManager:
    """Manages active LLM provider configuration, connection tests, and query execution."""

    def __init__(self) -> None:
        self.config = self._load_config()
        self._cache: dict[str, dict[str, Any]] = {}

    def _load_config(self) -> AIProviderConfig:
        """Loads configuration from ~/.pydebug/ai_config.json or environment variables."""
        if CONFIG_FILE.exists():
            try:
                data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
                return AIProviderConfig(
                    provider=data.get("provider", "ollama"),
                    base_url=data.get("base_url", "http://127.0.0.1:11434"),
                    model=data.get("model", "qwen2.5:7b-instruct"),
                    api_key=data.get("api_key", ""),
                    temperature=float(data.get("temperature", 0.2)),
                )
            except Exception:
                pass

        # Environment variable fallbacks
        env_provider = os.environ.get("PYDEBUG_AI_PROVIDER")
        env_openai_key = os.environ.get("OPENAI_API_KEY", "")
        env_deepseek_key = os.environ.get("DEEPSEEK_API_KEY", "")

        if env_provider:
            provider = env_provider.lower()
        elif env_openai_key:
            provider = "openai"
        elif env_deepseek_key:
            provider = "deepseek"
        else:
            provider = "ollama"

        preset = DEFAULT_PRESETS.get(provider, DEFAULT_PRESETS["ollama"])
        base_url = os.environ.get("OLLAMA_BASE_URL", os.environ.get("OPENAI_BASE_URL", preset["base_url"]))
        model = os.environ.get("OLLAMA_MODEL", os.environ.get("OPENAI_MODEL", preset["default_model"]))
        api_key = env_openai_key if provider == "openai" else (env_deepseek_key if provider == "deepseek" else os.environ.get("PYDEBUG_API_KEY", ""))

        return AIProviderConfig(
            provider=provider,
            base_url=base_url,
            model=model,
            api_key=api_key,
        )

    def save_config(self, provider: str, base_url: str, model: str, api_key: str | None = None, temperature: float = 0.2) -> AIProviderConfig:
        """Updates and persists configuration to disk."""
        base_url = base_url.rstrip("/")
        # If api_key is None or not provided, keep existing key
        effective_key = self.config.api_key if (api_key is None or api_key == "KEEP_EXISTING") else api_key.strip()

        self.config = AIProviderConfig(
            provider=provider.lower(),
            base_url=base_url,
            model=model.strip(),
            api_key=effective_key,
            temperature=temperature,
        )

        try:
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            CONFIG_FILE.write_text(json.dumps(asdict(self.config), indent=2), encoding="utf-8")
        except Exception as e:
            print(f"[PyDebug] Warning: Could not persist AI config: {e}")

        # Clear explanation cache when model/provider changes
        self._cache.clear()
        return self.config

    def fetch_models(self, provider: str | None = None, base_url: str | None = None, api_key: str | None = None) -> list[str]:
        """Queries the provider endpoint to discover available models."""
        prov = (provider or self.config.provider).lower()
        url = (base_url or self.config.base_url).rstrip("/")
        key = api_key if api_key is not None else self.config.api_key

        preset = DEFAULT_PRESETS.get(prov, DEFAULT_PRESETS["custom"])
        preset_models = list(preset.get("models", []))

        # 1. Ollama discovery (/api/tags)
        if prov == "ollama":
            try:
                req = urllib.request.Request(f"{url}/api/tags", headers={"User-Agent": "PyDebug/0.1.0"})
                with urllib.request.urlopen(req, timeout=4) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    models = [m["name"] for m in data.get("models", []) if "name" in m]
                    return models if models else preset_models
            except Exception:
                return preset_models

        # 2. OpenAI-compatible discovery (/models)
        try:
            headers = {"User-Agent": "PyDebug/0.1.0"}
            if key:
                headers["Authorization"] = f"Bearer {key}"
            req = urllib.request.Request(f"{url}/models", headers=headers)
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                models = [m["id"] for m in data.get("data", []) if "id" in m]
                return models[:25] if models else preset_models
        except Exception:
            return preset_models

    def test_connection(self, provider: str | None = None, base_url: str | None = None, model: str | None = None, api_key: str | None = None) -> dict[str, Any]:
        """Tests live reachability and returns latency and discovered models."""
        prov = (provider or self.config.provider).lower()
        url = (base_url or self.config.base_url).rstrip("/")
        mdl = model or self.config.model
        key = api_key if api_key is not None and api_key != "KEEP_EXISTING" else self.config.api_key

        start_t = time.perf_counter()

        if prov == "ollama":
            try:
                req = urllib.request.Request(f"{url}/api/version", headers={"User-Agent": "PyDebug/0.1.0"})
                with urllib.request.urlopen(req, timeout=5) as resp:
                    ver_data = json.loads(resp.read().decode("utf-8"))
                latency = round((time.perf_counter() - start_t) * 1000, 1)
                models = self.fetch_models(prov, url, key)
                return {
                    "success": True,
                    "latency_ms": latency,
                    "message": f"Connected to Ollama v{ver_data.get('version', 'unknown')} successfully.",
                    "models": models,
                }
            except Exception as e:
                return {
                    "success": False,
                    "latency_ms": round((time.perf_counter() - start_t) * 1000, 1),
                    "message": f"Ollama connection error: {e}",
                    "models": DEFAULT_PRESETS["ollama"]["models"],
                }

        # OpenAI, DeepSeek, or Custom OpenAI-compatible
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "PyDebug/0.1.0",
        }
        if key:
            headers["Authorization"] = f"Bearer {key}"
        elif prov in ("openai", "deepseek"):
            return {
                "success": False,
                "latency_ms": 0,
                "message": f"API Key required for {prov.title()}.",
                "models": DEFAULT_PRESETS.get(prov, {}).get("models", []),
            }

        try:
            # Query /models for health check
            req = urllib.request.Request(f"{url}/models", headers=headers)
            with urllib.request.urlopen(req, timeout=6) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                models = [m["id"] for m in data.get("data", []) if "id" in m]
            latency = round((time.perf_counter() - start_t) * 1000, 1)
            return {
                "success": True,
                "latency_ms": latency,
                "message": f"Connected to {prov.title()} successfully.",
                "models": models[:30] if models else DEFAULT_PRESETS.get(prov, {}).get("models", [mdl]),
            }
        except urllib.error.HTTPError as e:
            msg = f"HTTP {e.code}: {e.reason}"
            if e.code == 401:
                msg = "Invalid or expired API Key (401 Unauthorized)."
            return {
                "success": False,
                "latency_ms": round((time.perf_counter() - start_t) * 1000, 1),
                "message": msg,
                "models": DEFAULT_PRESETS.get(prov, {}).get("models", []),
            }
        except Exception as e:
            return {
                "success": False,
                "latency_ms": round((time.perf_counter() - start_t) * 1000, 1),
                "message": f"Connection error: {e}",
                "models": DEFAULT_PRESETS.get(prov, {}).get("models", []),
            }

    def explain_line(
        self,
        func: str,
        line: int,
        src: str,
        vars_dict: dict[str, str],
        diffs_dict: dict[str, Any],
        expressions: list[dict[str, Any]],
        prompt_type: str = "explain",
    ) -> dict[str, Any]:
        """Generates AI Co-Pilot line explanation via the configured LLM provider."""
        cache_key = hashlib.md5(
            f"{self.config.provider}:{self.config.model}:{func}:{line}:{src}:{sorted(vars_dict.items())}:{prompt_type}".encode()
        ).hexdigest()

        if cache_key in self._cache:
            res = dict(self._cache[cache_key])
            res["cached"] = True
            return res

        expr_summary = ", ".join(f"{e.get('text')} = {e.get('val')}" for e in expressions[:5])
        diff_summary = ", ".join(
            f"{k}: {v.get('old')} -> {v.get('new')}" for k, v in diffs_dict.items()
        )

        if prompt_type == "alteration":
            instruction = (
                "In 2 clear, concise sentences:\n"
                "1. Suggest a concrete code refactoring or bug fix for this line.\n"
                "2. Explain why this alteration makes the code safer or more Pythonic.\n"
                "Respond ONLY with valid JSON having the keys 'explanation' and 'suggestion'."
            )
        elif prompt_type == "edge_cases":
            instruction = (
                "In 2 clear, concise sentences:\n"
                "1. Audit the current variable values and identify any potential edge cases or failure modes (e.g. NoneType, empty collections, boundary conditions).\n"
                "2. Suggest an assertion, guard condition, or defensive check to prevent runtime crashes.\n"
                "Respond ONLY with valid JSON having the keys 'explanation' and 'suggestion'."
            )
        elif prompt_type == "rca":
            instruction = (
                "In 2 clear, concise sentences:\n"
                "1. Diagnose the root cause of any exception, unexpected state, or flaw on this line.\n"
                "2. State the exact recommended fix to resolve the root cause.\n"
                "Respond ONLY with valid JSON having the keys 'explanation' and 'suggestion'."
            )
        else:
            instruction = (
                "In 2 clear, concise sentences:\n"
                "1. Explain what this line does right now with these exact runtime variable values and what branch was taken.\n"
                "2. Give one practical tip, edge case, or code alteration suggestion.\n"
                "Respond ONLY with valid JSON having the keys 'explanation' and 'suggestion'."
            )

        prompt = f"""You are an expert Python debugger and execution engine assistant.
Function: {func}()
Current Line {line}: {src}
Active variables in scope: {json.dumps(vars_dict)}
Line variable mutations: {diff_summary or 'None'}
Evaluated AST sub-expressions: {expr_summary or 'None'}

{instruction}"""

        try:
            if self.config.provider == "ollama":
                result = self._call_ollama(prompt, line, src)
            else:
                result = self._call_openai_compatible(prompt, line, src)

            result["provider"] = self.config.provider
            result["model"] = self.config.model
            result["cached"] = False
            self._cache[cache_key] = result
            return result
        except Exception as exc:
            return {
                "explanation": f"Line {line} in {func}() evaluated with variables {list(vars_dict.keys())[:4]}.",
                "suggestion": f"{self.config.provider.title()} note: {exc}. Open AI Settings to verify your endpoint.",
                "provider": self.config.provider,
                "model": self.config.model,
                "cached": False,
            }

    def chat(
        self,
        query: str,
        func: str = "unknown",
        line: int = 0,
        src: str = "",
        vars_dict: dict[str, Any] | None = None,
        diffs_dict: dict[str, Any] | None = None,
        expressions: list[dict[str, Any]] | None = None,
        history: list[dict[str, str]] | None = None,
        prompt_type: str = "custom",
    ) -> dict[str, Any]:
        """Interactive conversational AI Co-Pilot query with full execution context."""
        vars_dict = vars_dict or {}
        diffs_dict = diffs_dict or {}
        expressions = expressions or []
        history = history or []

        expr_summary = ", ".join(f"{e.get('text')} = {e.get('val')}" for e in expressions[:8])
        diff_summary = ", ".join(
            f"{k}: {v.get('old')} -> {v.get('new')}" for k, v in diffs_dict.items()
        )

        context_block = f"""[Execution Context]
Function: {func}()
Line {line}: {src}
Active Variables in Scope: {json.dumps(vars_dict)}
Line Variable Mutations: {diff_summary or 'None'}
AST Sub-expressions: {expr_summary or 'None'}"""

        if prompt_type == "explain":
            user_msg = f"Explain in detail what happened when line {line} executed with the current variable values and which branch was taken."
        elif prompt_type == "alteration":
            user_msg = f"Suggest a cleaner, safer, or more idiomatic Python code fix for line {line} in {func}(). Provide the before/after code snippet."
        elif prompt_type == "edge_cases":
            user_msg = f"Audit line {line} for edge cases, potential exceptions, NoneType errors, or unexpected values. Suggest defensive checks."
        elif prompt_type == "rca":
            user_msg = f"Perform root cause analysis on this execution step in {func}(). Diagnose what failed or could fail and how to fix it."
        else:
            user_msg = query.strip() or f"Analyze line {line}: {src}"

        system_prompt = (
            "You are PyDebug AI Co-Pilot, an expert Python debugging and code execution assistant.\n"
            "Help the developer understand code execution, diagnose bugs, evaluate variable state, and improve code.\n"
            "Always be clear, precise, and practical. Use Markdown with code fences (```python ... ```) when providing code.\n"
            f"{context_block}"
        )

        messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
        for item in history[-6:]:
            role = item.get("role", "user")
            content = item.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": user_msg})

        try:
            if self.config.provider == "ollama":
                reply = self._call_ollama_chat(messages)
            else:
                reply = self._call_openai_chat(messages)

            return {
                "response": reply,
                "provider": self.config.provider,
                "model": self.config.model,
                "timestamp": time.time(),
            }
        except Exception as exc:
            return {
                "response": (
                    f"⚠️ **{self.config.provider.title()} Query Error**: {exc}\n\n"
                    "Please verify your AI settings in **AI Configuration** (Endpoint URL, Model name, or API Key)."
                ),
                "provider": self.config.provider,
                "model": self.config.model,
                "timestamp": time.time(),
                "error": str(exc),
            }

    def _call_ollama(self, prompt: str, line: int, src: str) -> dict[str, str]:
        payload = json.dumps({
            "model": self.config.model,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {"temperature": self.config.temperature, "num_predict": 300},
        }).encode("utf-8")

        req = urllib.request.Request(
            f"{self.config.base_url}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json", "User-Agent": "PyDebug/0.1.0"},
        )
        with urllib.request.urlopen(req, timeout=45) as response:
            raw = json.loads(response.read().decode("utf-8"))
            resp_str = raw.get("response", "{}")
            parsed = _extract_json_or_text(resp_str)
            return {
                "explanation": parsed.get("explanation", f"Executed line {line}: {src}"),
                "suggestion": parsed.get("suggestion", "Verify variable bounds and edge conditions."),
            }

    def _call_openai_compatible(self, prompt: str, line: int, src: str) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "PyDebug/0.1.0",
        }
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"

        payload_dict: dict[str, Any] = {
            "model": self.config.model,
            "messages": [
                {"role": "system", "content": "You are a Python runtime debugger assistant. Return valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            "temperature": self.config.temperature,
            "max_tokens": 300,
        }
        if self.config.provider in ("openai", "deepseek"):
            payload_dict["response_format"] = {"type": "json_object"}

        req = urllib.request.Request(
            f"{self.config.base_url}/chat/completions",
            data=json.dumps(payload_dict).encode("utf-8"),
            headers=headers,
        )
        with urllib.request.urlopen(req, timeout=45) as response:
            raw = json.loads(response.read().decode("utf-8"))
            content = raw.get("choices", [{}])[0].get("message", {}).get("content", "{}")
            parsed = _extract_json_or_text(content)
            return {
                "explanation": parsed.get("explanation", f"Executed line {line}: {src}"),
                "suggestion": parsed.get("suggestion", "Verify variable bounds and edge conditions."),
            }

    def _call_ollama_chat(self, messages: list[dict[str, str]]) -> str:
        try:
            payload = json.dumps({
                "model": self.config.model,
                "messages": messages,
                "stream": False,
                "options": {"temperature": self.config.temperature, "num_predict": 600},
            }).encode("utf-8")

            req = urllib.request.Request(
                f"{self.config.base_url}/api/chat",
                data=payload,
                headers={"Content-Type": "application/json", "User-Agent": "PyDebug/0.1.0"},
            )
            with urllib.request.urlopen(req, timeout=45) as response:
                data = json.loads(response.read().decode("utf-8"))
                return data.get("message", {}).get("content", "").strip()
        except Exception:
            full_prompt = "\n\n".join(f"{m['role'].upper()}: {m['content']}" for m in messages) + "\n\nASSISTANT:"
            payload = json.dumps({
                "model": self.config.model,
                "prompt": full_prompt,
                "stream": False,
                "options": {"temperature": self.config.temperature, "num_predict": 600},
            }).encode("utf-8")
            req = urllib.request.Request(
                f"{self.config.base_url}/api/generate",
                data=payload,
                headers={"Content-Type": "application/json", "User-Agent": "PyDebug/0.1.0"},
            )
            with urllib.request.urlopen(req, timeout=45) as response:
                data = json.loads(response.read().decode("utf-8"))
                return data.get("response", "").strip()

    def _call_openai_chat(self, messages: list[dict[str, str]]) -> str:
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "PyDebug/0.1.0",
        }
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"

        payload_dict: dict[str, Any] = {
            "model": self.config.model,
            "messages": messages,
            "temperature": self.config.temperature,
            "max_tokens": 600,
        }

        req = urllib.request.Request(
            f"{self.config.base_url}/chat/completions",
            data=json.dumps(payload_dict).encode("utf-8"),
            headers=headers,
        )
        with urllib.request.urlopen(req, timeout=45) as response:
            raw = json.loads(response.read().decode("utf-8"))
            content = raw.get("choices", [{}])[0].get("message", {}).get("content", "")
            return content.strip()


# Global Singleton
_GLOBAL_AI_MANAGER = AIManager()


def get_ai_manager() -> AIManager:
    return _GLOBAL_AI_MANAGER
