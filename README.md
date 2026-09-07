# Quant-Dev Education Boilerplate

> A stripped-down, fully-working learning kit that teaches how to build a live trading data pipeline from scratch — MetaTrader 5 → C++ TCP bridge → Node.js WebSocket relay → React candlestick chart.

**No external charting libraries. No magic. Just the code.**

---

## 📺 Companion Video Series

This repository is the companion code for the free YouTube series **"Build a Trading Data Pipeline from Scratch"**. Each video maps to a directory in this repo. See [`docs/VIDEO_SERIES.md`](docs/VIDEO_SERIES.md) for the full mapping.

| # | Title | What You'll Build |
|---|-------|-------------------|
| 1 | Architecture Overview | Understand the 4-component pipeline |
| 2 | C++ TCP Bridge Deep Dive | Decode the WebSocket handshake, JSON forwarding |
| 3 | Node.js WebSocket Relay | Build auth-gated WS server, TCP listener, mock fallback |
| 4 | React Canvas Chart from Scratch | Render candlesticks pixel-by-pixel on HTML5 Canvas |
| 5 | Testing & Verification | Run auth handshake tests, tenant resolution tests |
| 6 | Running the Full Pipeline | End-to-end: MT5 simulator → bridge → relay → chart |
| 7 | Extending the Boilerplate | Add symbols, features, production hardening |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18.0.0
- **pnpm** ≥ 9.0.0 (`npm install -g pnpm@9.15.0`)
- **CMake** ≥ 3.15
- **C++ compiler** (MSVC on Windows, GCC/Clang on Linux/macOS)

### Install & Run

```bash
# 1. Clone and install all dependencies (server + webapp workspaces)
git clone https://github.com/deepcharts/education-boilerplate.git
cd education-boilerplate
pnpm install

# 2. (Optional) Build the C++ bridge
pnpm run build:cpp

# 3. Start the Node.js relay server + React frontend together
pnpm dev
```

- **WebSocket server**: `ws://localhost:8081`
- **React frontend**: `http://localhost:3000`

### Live Pipeline (Full Simulation)

To run the complete pipeline end-to-end with the MT5 simulator:

```bash
# Starts: MT5 simulator (:9001) → C++ bridge (:8080) → Node relay (:8081)
pnpm run pipeline
```

Then open `http://localhost:3000` in your browser — but you also need the frontend running:

```bash
# In a separate terminal:
pnpm dev:webapp
```

### C++ Bridge Only (Windows)

```cmd
cpp\bridge_runner.bat
```

### C++ Bridge Only (Linux/macOS)

```bash
bash scripts/bridge_dev.sh
```

---

## 🏗️ Architecture

```
┌──────────┐     TCP (JSON)     ┌──────────────────┐   WebSocket (JSON)   ┌─────────┐
│  MT5     │◄──────────────────►│  C++ Bridge       │◄────────────────────►│ Browser │
│ Terminal │                   │  (bridge_client)  │                      │ (React)  │
└──────────┘                   └────────┬─────────┘                      └────┬────┘
                                          │                                    │
                                         TCP (JSON)                           │
                                          ▼                                    │
                                   ┌──────────────┐                            │
                                   │ Node.js WS   │◄───────────────────────────┘
                                   │ Relay Server │
                                   └──────────────┘
```

### Data Flow

1. **MT5 Terminal** — Your MetaTrader 5 EA sends JSON candle data as newline-delimited messages over TCP (port 9001).
2. **C++ Bridge** — Connects to MT5's TCP listener, receives JSON, and forwards it to the Node.js relay server over TCP (port 8080).
3. **Node.js Relay** — Receives JSON from the bridge via TCP, broadcasts it to all connected browser clients via WebSocket (port 8081).
4. **React Frontend** — Subscribes to the WebSocket stream, renders candlesticks on an HTML5 Canvas in real time.

If MT5 is not running, the Node.js server generates mock candlestick data so the frontend still works for learning purposes.

---

## 📂 Directory Structure

```
community-launch-repo/
├── README.md                        ← You are here
├── LICENSE                          ← MIT
├── .env.example                     ← Environment variable template
├── .gitignore
├── docs/
│   ├── VIDEO_SERIES.md              ← Video-to-code mapping guide
│   └── ARCHITECTURE.md              ← Deep architecture notes
├── package.json                     ← Root workspace (pnpm)
├── pnpm-workspace.yaml              ← Workspace config
├── cpp/                             ← C++ MT5 Bridge
│   ├── CMakeLists.txt               ← Build configuration
│   ├── bridge_runner.bat            ← Windows one-click launcher
│   ├── include/
│   │   ├── ws_protocol.h            ← WebSocket frame encoder (RFC 6455 subset)
│   │   ├── ws_base64.h              ← Base64 encoder for WS handshake
│   │   └── ws_sha1.h                ← SHA-1 hash for WS handshake
│   └── src/
│       └── bridge_client.cpp        ← Main bridge client source
├── server/                          ← Node.js WebSocket Relay
│   ├── package.json                 ← Server-specific deps
│   └── index.js                     ← WS server, TCP listener, mock data
├── webapp/                          ← React Frontend (Vite + TypeScript)
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx                 ← React entry point
│       ├── App.tsx                  ← Root component
│       ├── styles.css               ← Minimal dark-theme styles
│       ├── components/
│       │   └── CandlestickChart.tsx ← Canvas-based candlestick renderer
│       └── hooks/
│           └── useOrderFlowStream.ts← WebSocket stream consumer hook
└── scripts/                         ← Dev & Test Scripts
    ├── mt5_simulator.js             ← Simulates MT5 EA (TCP :9001)
    ├── run_bridge.js                ← Persistent C++ bridge wrapper
    ├── run_pipeline.js              ← Full pipeline orchestrator
    ├── bridge_dev.sh                ← Linux/macOS pipeline launcher
    ├── verify-ws-auth.js            ← WebSocket auth handshake tests
    └── test-tenant-resolution.js    ← Tenant config resolution tests
```

---

## 🧪 Testing

### WebSocket Auth Handshake

Tests the auth gate with valid tokens, missing tokens, and expired tokens:

```bash
pnpm run test:auth
```

**Expected output**: 3/3 tests pass (valid token → open, no token → rejected, expired token → rejected).

### Tenant Resolution

Tests tenant config resolution by API key, host header, tier override, and default fallback:

```bash
pnpm run test:tenant
```

**Expected output**: 12/12 tests pass.

> **Note**: The tenant test requires the Next.js SaaS app from the full `moon-dev-web` project. In the education boilerplate, it serves as a reference for how tenant-based routing works in production.

---

## ⚙️ Configuration

Copy `.env.local` from `.env.example` and adjust values:

```bash
cp .env.example .env.local
```

| Variable | Default | Description |
|----------|---------|-------------|
| `WS_RELAY_PORT` | `8081` | Port for browser WebSocket connections |
| `TCP_BRIDGE_PORT` | `8080` | Port where the C++ bridge connects via TCP |
| `WANT_AUTH` | `false` | When `true`, WS connections require a valid JWT |
| `AUTH_BACKEND_URL` | `http://localhost:8000` | Backend URL for subscription verification |
| `MOCK_SYMBOL` | `XAUUSD` | Symbol streamed by mock data generator |
| `MOCK_INTERVAL_MS` | `1000` | Interval (ms) for mock candle generation |

---

## 📚 Learning Path

1. **`cpp/`** — Understand how the C++ bridge talks to MT5 over TCP. Each file has Doxygen comments (`/** ... */`) explaining the protocol, WebSocket handshake, and JSON forwarding logic.

2. **`server/`** — Learn how the Node.js WebSocket server relays data between the C++ bridge and browser clients. Every function has JSDoc explaining the auth flow, TCP listener, and mock data fallback.

3. **`webapp/src/`** — Build a candlestick chart from scratch using HTML Canvas. All rendering code is commented step-by-step, covering coordinate transforms, wick/body rendering, and axis labels.

4. **`scripts/`** — Explore the MT5 simulator (for testing without MetaTrader 5), the pipeline orchestrator, and automated test suites.

---

## 🔧 Building the C++ Bridge from Source

```bash
cd cpp
cmake -B build -S .
cmake --build build --config Release
```

The compiled binary will be at `cpp/build/bridge_client.exe` (Windows) or `cpp/build/bridge_client` (Linux/macOS).

---

## 🐛 Troubleshooting

**Frontend shows "Connecting..." forever**
- Ensure the Node.js relay is running: `pnpm run dev:server`
- Check the console for WebSocket connection errors.

**C++ bridge can't connect to MT5**
- The bridge connects to `127.0.0.1:9001`. Start the MT5 simulator: `pnpm run pipeline:mt5`
- Without MT5, the Node relay falls back to mock data.

**Auth tests fail**
- Ensure no other process is using port 8081.
- Check that `DOTENV_DISABLE` is not set when running the relay directly.

---

## 📜 License

MIT — use this for learning, teaching, or as a foundation for your own trading terminal.

---

## 🧡 Credits

Built by the DeepCharts team as a learning resource. The full platform includes AI vision models, strategy backtesting, multi-broker support, and a Next.js dashboard — this boilerplate strips all of that to focus on the core pipeline.

**Made for curious devs who want to understand, not just deploy.**