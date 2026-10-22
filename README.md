# ⚡ PyDebug — Next-Gen Visual Python Debugger & Live Tracer

> **The execution speed of Hunter. The expression insight of Birdseye. A Swagger-grade live operations studio.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI / Starlette](https://img.shields.io/badge/FastAPI%20%7C%20Starlette-Compatible-009688.svg)](https://fastapi.tiangolo.com/)
[![MCP Server](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-8A2BE2.svg)](https://modelcontextprotocol.io/)

PyDebug is a high-performance visual debugger and runtime tracer engineered for modern Python backends, FastAPI APIs, MCP (Model Context Protocol) servers, and standalone Python scripts. It captures full execution flows, line-by-line variable mutations, and sub-expression evaluations—without modifying your production source code.

---

## ✨ Features at a Glance

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ⚡ PYDEBUG STUDIO (8899)                        │
├─────────────────┬─────────────────┬──────────────────┬─────────────────┤
│ 📋 Dashboard    │ 👁️ Birdseye     │ ▶️ Hunter        │ ⚡ Playground   │
│ Swagger-style   │ AST expression  │ Line-by-line VCR │ Live test cases │
│ operations list │ call-tree map   │ variable stepper │ & AI Co-Pilot   │
└─────────────────┴─────────────────┴──────────────────┴─────────────────┘
```

### 1. 📋 Swagger-Inspired Operations Dashboard
- **Auto-Categorized Operations**: Live events grouped into `[POST]`, `[GET]`, `[MCP]`, `[TEST]`, and `[SCRIPT]` accordions.
- **Microsecond Metrics**: Precise execution durations, line counts, event tallies, and HTTP status codes (`200 OK`, `500 Error`).
- **One-Click Jump**: Instantly launch **Hunter Replay**, **Birdseye Ast**, or **Playground** for any captured event.

### 2. ▶️ Hunter Line-by-Line Replay & Variable Inspector
- **VCR Controls**: Play, pause, step forward, step backward, or jump to any execution step.
- **Inline Scope Bar**: Displays current executing line's local variables directly beneath the code.
- **🤖 AI Co-Pilot**: Integrated local LLM assistance (Ollama / Qwen / Llama) explaining logic and conditions in real time.

### 3. 👁️ Birdseye AST Expression Insight
- **Sub-Expression Evaluation**: Evaluates intermediate sub-expressions within complex `if` conditions, list comprehensions, and calculations.
- **Hierarchical Call Graph**: Trace parent-child function execution relationships without code clutter.

### 4. ⚡ Live Function Playground
- **JSON Arguments Testing**: Supply custom test arguments to any discovered project function and execute it live.
- **Presets & Edge Cases**: Run pre-configured test scenarios and immediately replay the result in the Hunter timeline.

---

## 🚀 Quickstart

### Installation
```bash
pip install pydebug
# or using uv:
uv add pydebug
```

### 1. Global Auto-Record (Recommended)
Automatically intercept **every script, API endpoint, MCP tool, and test** in your virtual environment:

```bash
# Install the zero-touch auto-hook
pydebug install
```

Now start the visual Studio listener in one terminal:
```bash
pydebug serve --port 8899
```

And run your project normally in another terminal:
```bash
# Run your FastAPI / MCP server
uv run python -m server.run_all

# Or run any standalone script
uv run python my_script.py

# Or run your test suite
uv run pytest
```
*Every single request from Swagger, Postman, curl, or MCP Inspector will automatically stream live to your browser dashboard!*

---

### 2. Standalone Script Debugging
Run any individual Python script with live visual tracing:

```bash
pydebug run path/to/script.py
```

### 3. Module Execution
Run any module directly (e.g. your FastAPI or MCP entrypoint):

```bash
pydebug run -m server.run_server
```

---

## 🔌 Framework Integrations

### FastAPI & Starlette Middleware
Trace individual API requests per-route:

```python
from fastapi import FastAPI
from pydebug.integrations.fastapi import PyDebugMiddleware

app = FastAPI()
app.add_middleware(PyDebugMiddleware)
```

### Surgical Function Tracing (`@spy`)
Trace a single specific function or async tool:

```python
from pydebug.core.tracer import spy

@spy
async def calculate_claim_copay(claim_id: str, amount: float):
    # Traced line-by-line automatically
    ...
```

---

## 🛠️ CLI Reference

| Command | Description |
| :--- | :--- |
| `pydebug serve [--port 8899]` | Launch the visual studio dashboard and live SSE listener |
| `pydebug run <file.py>` | Execute and trace a script, then open in Studio |
| `pydebug run -m <module>` | Execute and trace a Python library module |
| `pydebug install` | Install global auto-hook into active virtual environment |
| `pydebug uninstall` | Remove global auto-hook |
| `pydebug demo` | Launch interactive algorithm demonstration |

---

## 🧪 Architecture

```
pydebug/
├── core/               # Hunter-inspired tracing engine & Birdseye AST parser
│   ├── tracer.py       # Global line tracer & @spy decorator
│   ├── ast_spy.py      # AST expression instrumentation
│   ├── events.py       # TraceSession & event schemas
│   └── predicates.py   # High-speed query predicates
├── integrations/       # Framework middlewares
│   └── fastapi.py      # Starlette/FastAPI ASGI auto-interceptor
├── server/             # Embedded Studio HTTP & SSE live streamer
│   └── app.py          # REST endpoints & static UI provider
├── cli.py              # Single CLI entrypoint (serve, run, install)
└── ui/                 # Bundled production React + Vite Studio assets
```

---

## 📄 License
MIT © 2026 Premnathan ([@premofc](https://github.com/premofc))
