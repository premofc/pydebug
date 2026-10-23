# 🔬 PyDebug — Next-Gen Visual Python Debugger & Live Tracer

> **The execution speed of Hunter. The expression insight of Birdseye. A Swagger-grade live operations studio.**

[![PyPI version](https://img.shields.io/pypi/v/pydebug.svg?color=blue)](https://pypi.org/project/pydebug/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Python 3.9+](https://img.shields.io/badge/python-3.9%2B-blue.svg)](https://www.python.org/downloads/)
[![FastAPI / Starlette](https://img.shields.io/badge/FastAPI%20%7C%20Starlette-Compatible-009688.svg)](https://fastapi.tiangolo.com/)
[![MCP Safe](https://img.shields.io/badge/MCP-Safe--No%20Timeouts-8A2BE2.svg)](https://modelcontextprotocol.io/)

PyDebug is a high-performance visual debugger and runtime tracer built for modern Python backends — FastAPI APIs, MCP (Model Context Protocol) servers, and standalone scripts. It captures full execution flows, line-by-line variable mutations, and sub-expression evaluations **without modifying your production source code** and **without causing timeouts in MCP servers or async frameworks**.

---

## ✨ Features at a Glance

| Feature | Description |
|---|---|
| **Dashboard** | Swagger-inspired operations log: every traced script, API call, and MCP tool captured in live accordion cards |
| **Execution Timeline** | Play, pause, step forward/backward through any execution with full variable scope and AI Co-Pilot explanations |
| **Function Calls** | Sub-expression evaluation for `if` conditions, list comprehensions, and complex expressions with call graph |
| **Code Sandbox** | Supply JSON arguments to any function in your project, run it live, and instantly replay the trace |
| **AI Co-Pilot** | Built-in LLM integration — Ollama, OpenAI, DeepSeek, or any custom OpenAI-compatible endpoint |
| **Multi-Provider LLM UI** | Graphical modal to configure any AI provider, discover available models, and test connection latency |
| **MCP-Safe Architecture** | Explicitly bypasses `/mcp`, SSE streams, and async event loop internals — **zero timeout risk** |
| **Zero Dependencies** | Pure Python stdlib server. No numpy, torch, or heavy runtime dependencies required |

---

## ⚡ Installation

```bash
# From PyPI (recommended)
pip install pydebug

# Using uv
uv add pydebug

# From source
git clone https://github.com/premofc/pydebug.git
cd pydebug
pip install -e .
```

---

## 🚀 Quickstart

### Method 1 — Trace a Script (Simplest)

Run any Python script and immediately launch the visual Studio:

```bash
pydebug run path/to/my_script.py
# Opens browser automatically at http://127.0.0.1:8899
```

### Method 2 — Run a Module

```bash
pydebug run -m my_package.my_module
```

### Method 3 — Launch the Visual Studio Listener First

In one terminal, start the persistent listener:
```bash
pydebug serve --port 8899
```

Then in another terminal, run your scripts — trace sessions stream live to the dashboard:
```bash
pydebug run scripts/my_algorithm.py
```

### Method 4 — Interactive Demo

See PyDebug working immediately with built-in algorithms:
```bash
pydebug demo
```

---

## 🧩 Framework Integrations

### FastAPI / Starlette — Auto-Record All API Requests

```python
from fastapi import FastAPI
from pydebug.integrations.fastapi import PyDebugMiddleware

app = FastAPI()
app.add_middleware(PyDebugMiddleware)
# Every POST /api/claims, GET /api/search, etc. will appear in the Dashboard
```

> **Safety Note:** The middleware automatically skips `/mcp`, `/sse`, `/health`, `/docs`,
> `/redoc`, and any `text/event-stream` connections. MCP Inspector handshakes are **never** intercepted.

**Advanced options:**
```python
app.add_middleware(
    PyDebugMiddleware,
    prefix_filter="/api",           # Only trace /api/* routes
    exclude_paths=["/api/webhook"], # Additional paths to skip
    server_port=8899,               # PyDebug Studio port
    trace_mcp=False,                # Keep MCP streaming untouched (default)
)
```

### Surgical Function Tracing (`@trace` / `@spy`)

Trace a single specific function — sync or async — without touching the rest of your server:

```python
from pydebug.core.tracer import trace, spy

@trace
def calculate_claim_copay(claim_id: str, amount: float) -> float:
    copay = amount * 0.20
    return round(copay, 2)

# spy is an alias for @trace with sub-expression AST inspection enabled
@spy
async def check_waiting_period(disease_name: str, policy_age_months: int) -> dict:
    is_covered = policy_age_months >= 24
    return {"covered": is_covered, "disease": disease_name}
```

Both sync and async functions are fully supported. Traced sessions appear live in the Dashboard.

### Context Manager — Trace a Code Block

```python
from pydebug.core.tracer import capture

with capture(title="Payment processing block") as session:
    result = process_payment(order_id="ORD-001", amount=149.99)

print(f"Captured {len(session.events)} events")
```

### `enable()` — Programmatic Integration

```python
import pydebug

# Safe integration for Starlette/FastAPI apps
# Automatically injects PyDebugMiddleware (with MCP bypass) at startup
pydebug.enable(server_port=8899)

# With auto script tracing enabled too (only use for pure script runners)
pydebug.enable(server_port=8899, auto_trace_scripts=True)
```

---

## 🤖 AI Co-Pilot — Multi-Provider LLM Setup

PyDebug includes a built-in AI Co-Pilot that explains any selected execution line in real-time. The graphical **AI Settings modal** (click the provider pill in the Navbar) lets you switch providers without touching any code.

### Supported Providers

| Provider | Default Base URL | API Key Required |
|---|---|---|
| **Ollama** (default) | `http://127.0.0.1:11434` | No |
| **OpenAI** | `https://api.openai.com/v1` | Yes |
| **DeepSeek** | `https://api.deepseek.com/v1` | Yes |
| **Custom (OpenAI-compatible)** | Your endpoint URL | Optional |

### Configuration via UI

1. Click the **provider pill** (e.g., `Ollama · qwen2.5`) in the top-right of the navbar.
2. Select your provider.
3. Enter your API key and endpoint URL.
4. Click **Discover Models** to auto-fetch available models from the endpoint.
5. Click **Test Connection** to verify latency.
6. Click **Save Settings**.

### Configuration via API

```bash
curl -X POST http://127.0.0.1:8899/api/ai/config \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai","base_url":"https://api.openai.com/v1","model":"gpt-4o","api_key":"sk-..."}'
```

### Configuration via Code

```python
from pydebug.server.ai import get_ai_manager

mgr = get_ai_manager()
mgr.save_config(
    provider="deepseek",
    base_url="https://api.deepseek.com/v1",
    model="deepseek-chat",
    api_key="your-deepseek-api-key",
    temperature=0.2,
)
```

---

## ⚠️ MCP Server Safety — Important

PyDebug is **fully safe** with MCP servers. However, you must use it correctly to avoid timeouts.

### Root Cause of Old Timeout Issues (Now Fixed)

Earlier auto-injection attached `sys.settrace()` globally across all Python imports:

1. **Asyncio event loop starvation:** `sys.settrace()` fires on every line in `uvicorn`, `starlette`, and `anyio`, causing a **50x to 100x slowdown** in the async event loop.
2. **MCP Inspector watchdog timeout (`-32001`):** The MCP Inspector has a hard timeout (~10-60s). With the event loop slowed down, the `/mcp` handshake could not complete in time.
3. **SSE stream interference:** Middleware buffering long-lived streaming connections caused the MCP client to sever the connection.

### Current Safe Architecture

| Method | Safety | MCP Impact | Best For |
|---|---|---|---|
| `pydebug run <script>` | ✅ Fully safe | Zero impact | Standalone scripts |
| `@trace` / `@spy` decorator | ✅ Fully safe | Zero impact | Specific MCP tools or functions |
| `PyDebugMiddleware` (explicit) | ✅ Safe | Bypasses `/mcp` and SSE | REST API tracing |
| `pydebug install` (auto-hook) | ⚠️ Opt-in only | Requires `ENABLE_PYDEBUG=1` | When explicitly needed |

### Using `@trace` on an MCP Tool (Recommended Pattern)

```python
from pydebug.core.tracer import trace

@trace  # Only this function is traced — MCP streaming runs at full speed
async def check_waiting_period_tool(disease_name: str, policy_age_months: int):
    result = await lookup_disease(disease_name)
    is_covered = policy_age_months >= result.waiting_period_months
    return {"covered": is_covered}
```

### Auto-Hook via `pydebug install`

```bash
# Install the hook (DISABLED by default)
pydebug install

# Enable only for specific session
ENABLE_PYDEBUG=1 pydebug serve --port 8899
```

> The hook checks `os.getenv("ENABLE_PYDEBUG", "0") == "1"` before activating.
> If the env var is not set, PyDebug does **not** activate.

---

## 🖥️ CLI Reference

| Command | Description |
|---|---|
| `pydebug serve [--port 8899] [--no-open]` | Launch the Studio dashboard and live SSE listener |
| `pydebug run <file.py> [args...]` | Trace a Python script and open it in Studio |
| `pydebug run -m <module> [args...]` | Trace a Python module |
| `pydebug demo [--port 8899]` | Launch interactive algorithm demo |
| `pydebug install` | Install opt-in auto-hook into the active virtual environment |
| `pydebug uninstall` | Remove the auto-hook from the virtual environment |

### CLI Flags

| Flag | Description |
|---|---|
| `--port <N>` | Studio port (default: `8899`) |
| `--no-ui` | Capture trace without launching the browser UI |
| `--no-open` | Start server without auto-opening the browser |
| `-m / --module` | Treat argument as a module name |

---

## 🗂️ REST API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Health check — returns `{"status": "ok"}` |
| `/api/session` | GET | Fetch the latest trace session |
| `/api/session?id=<uuid>` | GET | Fetch a specific session by ID |
| `/api/sessions` | GET | List all recorded sessions (metadata only) |
| `/api/sessions` | POST | Submit a new trace session (JSON payload) |
| `/api/stream` | GET | SSE stream — pushes `new_session` events in real-time |
| `/api/ai/config` | GET | Fetch current AI provider configuration |
| `/api/ai/config` | POST | Save AI provider configuration |
| `/api/ai/models` | GET | Discover available models from the configured endpoint |
| `/api/ai/test` | POST | Test AI provider connection and measure latency |
| `/api/ai/explain` | POST | Get AI explanation for a specific execution line |
| `/api/simulate` | POST | Run a built-in simulation scenario |
| `/api/execute` | POST | Execute a named project function live |

---

## 🏗️ Architecture

```
pydebug/
├── core/
│   ├── tracer.py        # PyTracer, @trace decorator, capture() context manager
│   ├── ast_spy.py       # Birdseye-style AST sub-expression instrumentation
│   ├── events.py        # TraceSession, TraceEvent data models (JSON serializable)
│   └── predicates.py    # Hunter-style Q() predicate filter engine
├── integrations/
│   └── fastapi.py       # Starlette/FastAPI ASGI middleware with MCP bypass
├── server/
│   ├── app.py           # Embedded HTTP server, SSE streamer, all REST routes
│   └── ai.py            # Multi-provider LLM engine (Ollama, OpenAI, DeepSeek, Custom)
├── examples/
│   └── demo_algorithms.py  # Built-in demo: sorting, recursion, AST expressions
├── cli.py               # CLI entrypoint: run, serve, install, uninstall, demo
├── __init__.py          # Public API: enable(), PyTracer, trace, spy, capture
└── ui/                  # Production-bundled React + Vite frontend assets
```

### Key Design Decisions

1. **Zero external dependencies** — Uses Python stdlib `ThreadingHTTPServer` only. No FastAPI required to run PyDebug itself.
2. **Strict path filtering** — `_should_trace()` hard-excludes `.venv`, `site-packages`, `uvicorn`, `starlette`, `asyncio`, and `anyio` to prevent async event loop starvation.
3. **SSE-over-HTTP live streaming** — Dashboard connects to `/api/stream` via `EventSource`. Sessions push instantly without polling.
4. **Bounded locals capture** — At most 30 local variables are captured per event, truncated to safe string representations to prevent memory spikes.

---

## 🧪 Running Tests

```bash
# Install dev dependencies
pip install pytest pytest-asyncio

# Run the full test suite
pytest tests/ -v

# Or with uv
uv run pytest tests/ -v
```

### Test Coverage

| Test | What It Verifies |
|---|---|
| `test_session_event_recording` | `TraceSession.record_event()`, variable delta tracking, stats computation |
| `test_tracer_capture_context_manager` | `capture()` context manager traces correct functions |
| `test_ast_sub_expression_spy` | `@inspect_expressions` preserves semantics while capturing sub-expressions |
| `test_hunter_q_predicates` | `Q()` predicate filtering by function name and depth |
| `test_session_json_serialization` | `to_dict()` / `to_json()` round-trip serialization |
| `test_ai_manager_config_presets` | All 4 provider presets; API key masking works correctly |
| `test_ai_manager_explanation_graceful_fallback` | `explain()` returns valid dict even when LLM endpoint is unreachable |

---

## 🎨 Studio UI Overview

The PyDebug Studio is a React + TypeScript + Tailwind CSS application bundled into the package.

### Design System

- **Dark mode:** OLED slate (`#060911` base) with indigo/violet/emerald accent palette and radial ambient glows
- **Light mode:** Clean `#f8fafc` base with crisp contrast and soft card elevation
- **Typography:** Inter (UI sans) + JetBrains Mono (code/traces)
- **Glassmorphism:** `backdrop-blur-md` panels with translucent borders
- **Animations:** Smooth hover states, animated VCR controls, loading spinners

### Pages

| Page | Key Features |
|---|---|
| **Dashboard** | Live session list, Swagger-style method badges, one-click jump to Timeline, Function Calls, or Sandbox |
| **Execution Timeline** | VCR play/pause/step controls, event stream filter (all/line/call/return), scope pane, AI explanation |
| **Function Calls** | Function call tree, sub-expression chips per line, pinned watchlist, locals inspector |
| **Code Sandbox** | Function picker, JSON argument editor with validation, saved test cases, live return value viewer |

### Building the UI from Source

```bash
cd frontend
npm install
npm run dev        # Development server at http://localhost:5173
npm run build      # Production bundle → ../pydebug/ui/
```

---

## 🔐 Security

- API keys are stored **in-memory only** — never written to disk.
- `to_public_dict()` returns a **masked key** (`sk-te...xxxx`) — never exposes the raw key over REST.
- The server binds to `0.0.0.0:8899`. In production, restrict access via a firewall or reverse proxy.
- The middleware logs only execution metadata (function names, line numbers, local variable values) — never request/response bodies.

---

## 📦 Publishing to PyPI

1. Bump `version` in `pyproject.toml` and `pydebug/__init__.py`.
2. Build the frontend production bundle:
   ```bash
   cd frontend && npm run build && cd ..
   ```
3. Build the Python distribution:
   ```bash
   uv build
   ```
4. Publish to PyPI:
   ```bash
   uv publish
   ```

The GitHub Actions workflow at `.github/workflows/workflow.yml` automates steps 3 and 4 on every push to `main` when `PYPI_API_TOKEN` secret is configured.

---

## 🔧 Troubleshooting

### Studio does not open automatically
```bash
pydebug serve --port 8899 --no-open
# Then visit: http://127.0.0.1:8899
```

### MCP Inspector shows `-32001: Request timed out`
Remove any stale auto-hooks:
```bash
pydebug uninstall
# Verify no .pth files remain:
dir .venv\Lib\site-packages\*.pth    # Windows
ls .venv/lib/python*/site-packages/*.pth  # Linux/macOS
```

### AI Co-Pilot shows "Connection error"
- **Ollama:** Run `ollama serve` to start the local Ollama server.
- **OpenAI / DeepSeek:** Verify your API key in the AI Settings modal.
- **Custom endpoint:** Confirm the base URL is OpenAI-compatible and reachable.

### `pydebug run` reports zero events
Ensure the script file path is accessible from your current working directory:
```bash
pydebug run my_script.py           # Relative to cwd — correct
pydebug run /absolute/path.py      # Absolute path — also correct
```

---

## 🗺️ Roadmap

- [ ] WebSocket-based live streaming (lower latency than SSE)
- [ ] Timeline diff view between two sessions
- [ ] pytest plugin: auto-upload test session to Studio on each test run
- [ ] VS Code extension: click-to-trace directly from the editor
- [ ] Docker / container support

---

## 📄 License

MIT © 2026 Premnathan ([@premofc](https://github.com/premofc))
