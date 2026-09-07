# Community Launch Blueprint: Education Boilerplate

> Introductory module for the developer community launch of the DeepCharts education kit.

## 1. What This Is

The `education-boilerplate/` package is a **stripped-down learning kit** that teaches
how to build the core data-pipeline of the DeepCharts Pro trading platform — the part
that moves market data from MetaTrader 5 → C++ bridge → Node.js WebSocket relay →
React candlestick chart.

It deliberately **excludes** AI models, backtesting engines, compliance reporting,
multi-broker adapters, and the Next.js dashboard. Every remaining line of code is
heavily commented as a teaching example.

---

## 2. Repository Map

```
education-boilerplate/
├── package.json              ← Root workspace: pnpm dev runs server + webapp
├── pnpm-workspace.yaml       ← Declares "server" and "webapp" workspaces
├── .env.example              ← Template for local configuration
├── .gitignore                ← Node_modules, build artifacts
│
├── cpp/                      ← C++ MT5 TCP bridge (Windows)
│   ├── CMakeLists.txt        ← Build config (MSVC / MinGW)
│   ├── include/
│   │   ├── ws_protocol.h     ← JSON over TCP message framing
│   │   ├── ws_sha1.h         ← SHA-1 (for educational HMAC)
│   │   └── ws_base64.h       ← Base64 encoder
│   └── src/
│       └── bridge_client.cpp ← Connects to MT5, sends JSON candles
│
├── server/                   ← Node.js WebSocket relay
│   ├── package.json          ← ws + dotenv deps, ESM
│   └── index.js              ← TCP listener + WS broadcaster + auth gate
│
├── webapp/                  ← React 18 frontend (Vite + TypeScript)
│   ├── package.json
│   ├── vite.config.ts        ← Port 3000, proxies /ws → :8081
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx          ← React DOM entry point
│       ├── App.tsx           ← Header + status + chart container
│       ├── styles.css        ← Cardigan-themed dark mode
│       ├── hooks/
│       │   └── useOrderFlowStream.ts ← WS client w/ reconnect + token
│       └── components/
│           └── CandlestickChart.tsx  ← Canvas-based candlestick renderer
│
├── scripts/                  ← Verification & test scripts
│   ├── verify-ws-auth.js     ← End-to-end WS auth handshake test
│   └── test-tenant-resolution.js ← Tenant config resolution dry-run
│
├── README.md                 ← Quick-start + architecture overview
└── COMMUNITY-LAUNCH.md       ← This file (community launch blueprint)
```

---

## 3. Quick Start (Zero to Trading Terminal)

```bash
# Clone + enter
git clone <repo-url> education-boilerplate
cd education-boilerplate

# Install all dependencies (pnpm workspaces hoists server + webapp deps)
pnpm install

# Start the relay server + React frontend
pnpm dev

# Or run individual parts:
pnpm dev:server       # node server/index.js
pnpm dev:webapp       # vite dev server on :3000

# Optional: build the C++ MT5 bridge
pnpm run build:cpp

# Optional: verify auth handshake works
pnpm test:auth

# Optional: test tenant resolution (point at a running moon-dev-web)
TENANT_BASE_URL=http://localhost:3000 pnpm test:tenant
```

**Expected result:** The React app opens at `http://localhost:3000` and shows a live
candlestick chart animating with mock XAUUSD data.

---

## 4. Learning Objectives

Each component teaches a distinct layer of the platform:

### 4.1 C++ Bridge (`cpp/`)
| File | Concepts Taught |
|------|----------------|
| `bridge_client.cpp` | Winsock2 TCP client, MT5 Python integration, newline-delimited JSON framing, reconnection logic with exponential backoff |
| `ws_protocol.h` | Message schema design (JSON over TCP), field definitions for candle/position/account data |
| `ws_sha1.h` | SHA-1 implementation (educational — used in HMAC for message signing) |
| `ws_base64.h` | Base64 encoding (for embedding binary data in JSON) |
| `CMakeLists.txt` | Cross-platform C++ build configuration, MSVC vs GCC differences |

**What students learn:** How to write a lightweight TCP client that streams structured
data from a trading platform, with zero external dependencies.

### 4.2 Node.js Relay (`server/`)
| Concept | Where |
|---------|-------|
| WebSocket server with `ws` library | `index.js` — `WebSocketServer` |
| TCP-to-WS bridging | `net.createServer` listener in `index.js` |
| JWT verification (decode) | `decodeJwt()` in `index.js` |
| Auth gate with `verifyClient` | `wss.on('connection')` with `verifyClient` option |
| Mock data fallback | `generateMockCandle()` + `setInterval` |
| Graceful shutdown | `SIGTERM` / `SIGINT` handlers |
| dotenv configuration | `dotenv.config()` |

**What students learn:** How to build a relay server that forwards data from a TCP
source to WebSocket clients, with optional authentication and fallback mock data.

### 4.3 React Frontend (`webapp/`)
| File | Concepts Taught |
|------|----------------|
| `useOrderFlowStream.ts` | WebSocket client hook, reconnection, message parsing, token-based auth |
| `CandlestickChart.tsx` | Canvas 2D rendering, price-to-pixel transforms, Wick/body drawing, grid lines |
| `App.tsx` | Root component composition, environment variable access via `import.meta.env` |
| `vite.config.ts` | Dev server proxy for WebSocket, port configuration |

**What students learn:** How to consume a WebSocket stream in React and render a
real-time chart from scratch (no TradingView dependency).

### 4.4 Scripts & Testing (`scripts/`)
| Script | Validates |
|--------|-----------|
| `verify-ws-auth.js` | WS handshake: valid token → open, no token → 401, expired token → 403 |
| `test-tenant-resolution.js` | Tenant config: API key → domain → tier override → default fallback |

**What students learn:** How to write automated verification scripts for the auth
gate and tenant resolution flow.

---

## 5. Auth Gate: How It Works

The education-boilerplate mirrors the full platform's auth flow at a simplified level:

```
┌──────────┐                    ┌──────────────┐
│  React   │  WS connect w/    │   Node.js    │
│ Frontend │  ?token=<jwt>     │   Relay      │
└────┬─────┴───────────────────→  (auth gate) │
     │                           └──────┬─────┘
     │  1. Extract token from URL       │
     │  2. JWT decode (header+payload)   │
     │  3. If AUTH_BACKEND_URL set:      │
     │     POST /api/v1/auth/subscription-check
     │  4. Reject with 401/403 if fail  │
     │                                   │
     └──────────── ← accepts ────────────┘
```

**Config (`.env.local`):**
- `WANT_AUTH=false` → open relay (default, zero-config learning mode)
- `WANT_AUTH=true` → requires valid JWT on every WS connect
- `AUTH_BACKEND_URL=http://localhost:8000` → cross-check Stripe subscription via backend API

**In the full platform**, this maps to:
- Clerk JWT verification via JWKS on the Edge middleware
- Stripe subscription check via FastAPI `/api/v1/auth/subscription-check`
- Short-lived WS tokens issued by POST `/api/bridge/authorize`

---

## 6. Tenant Resolution: How It Works

The full platform (`apps/web/src/app/api/tenant/config/route.ts`) resolves the
tenant config via a priority chain:

```
1. API Key  (query param: ?api_key=<key>)    → highest priority
2. Host Header (Host: <domain>)              → fallback when no key
3. Tier Override (?tier=<Developer|Pro|Enterprise>) → dev-mode override
4. Default Config (DEFAULT_TENANT_CONFIG)    → always works
```

**Test tenants** (registered in the route handler):

| API Key | Domain | Tier |
|---------|--------|------|
| `dev_demo_123` | `demo.deepcharts.io` | Developer |
| `pro_acme_456` | `trading.acme-capital.com` | Pro |
| `ent_global_789` | `terminal.global-macro.com` | Enterprise |

Run the dry-run:
```bash
TENANT_BASE_URL=http://localhost:3000 pnpm test:tenant
```

**In the full platform**, this powers:
- White-label theming (CSS variable injection via `TenantProvider`)
- Feature flag gating (`IndicatorGate` component)
- Logo swapping (`TenantLogo` component)
- Subscription-based indicator visibility

---

## 7. Mapping: Education Boilerplate → Full Platform

| Education Boilerplate | Full Platform (DeepCharts Pro) |
|----------------------|-------------------------------|
| `cpp/bridge_client.cpp` | `packages/core-bridge/cpp/src/bridge_server.cpp` |
| `cpp/ws_protocol.h` | `packages/core-bridge/cpp/include/ws_protocol.h` |
| `server/index.js` | `MoonDevAI/moon-dev-web/apps/api/` (FastAPI) + C++ server |
| `web/` (Vite/React) | `MoonDevAI/moon-dev-web/apps/web/` (Next.js) |
| `useOrderFlowStream.ts` | `packages/core-bridge/src/hooks/useOrderFlowStream.ts` |
| `CandlestickChart.tsx` | TradingView integration + `@deepcharts/ui` |
| Mock data fallback | Live MT5 account data via Python bridge |
| JWT decode-only | Full JWKS signature verification (Clerk) |
| — | Stripe subscription gate |
| — | Multi-tenant white-label configs |
| — | AI vision models (GPT-5, Claude, Gemini) |
| — | OmniRoute LLM routing |
| — | Strategy backtesting engine |

---

## 8. Video Module Outline

If producing a companion video series, structure as follows:

### Episode 1: "From Zero to Candles" (12 min)
- Project structure walkthrough
- `pnpm dev` demonstration
- Explaining the mock data fallback

### Episode 2: "The C++ Bridge" (15 min)
- How `bridge_client.cpp` connects to MT5
- TCP framing with newline-delimited JSON
- Building with CMake on Windows

### Episode 3: "WebSocket Relay" (10 min)
- Node.js `ws` server setup
- TCP-to-WS bridging pattern
- Mock data generation

### Episode 4: "Canvas Candles" (18 min)
- Price-to-pixel coordinate transforms
- Wick + body rendering (green/red)
- Real-time candle appending

### Episode 5: "Auth Gate" (14 min)
- JWT decode in Node.js
- `verifyClient` handshake hook
- Token passing from React hook
- Running `verify-ws-auth.js`

### Episode 6: "Tenant Resolution" (12 min)
- Host-header domain matching
- API-key priority chain
- Tier override in dev mode
- Feature flag gating with `IndicatorGate`

### Episode 7: "From Toy to Terminal" (8 min)
- How each file maps to the full platform
- Where to dig deeper (moon-dev-web / core-bridge)
- Community contribution guide

---

## 9. Community Contribution Guide

### Getting Started
1. Fork the repository
2. `cd education-boilerplate && pnpm install`
3. Make your changes
4. Run `pnpm test:auth` to verify nothing breaks
5. Open a PR with a clear description of what you're teaching

### What to Contribute
- **Enhanced mock data**: Add realistic volatility patterns, different symbol types
- **Chart features**: Volume histogram, RSI panel, moving averages, crosshairs
- **Auth examples**: OAuth2 login screen, Clerk test account integration
- **Documentation**: More inline comments, diagrams, video timestamps
- **Translations**: Guide translations for non-English learners

### Code Style
- Heavy comments on every non-obvious line (this is educational code)
- JSDoc on every function
- No external charting libraries — build from first principles
- Keep mock data deterministic where possible (seeded RNG)

---

## 10. Known Limitations

| Limitation | Workaround |
|-----------|------------|
| C++ bridge only connects to a local TCP relay (no WS) | Run Node server as the bridge target |
| No real MT5 integration without the Python bridge | Use mock data mode (`WANT_AUTH=false`) |
| Canvas chart doesn't support zooming/panning | Add mouse event handlers to CandlestickChart |
| Auth is decode-only (no signature verification) | Point `AUTH_BACKEND_URL` at moon-dev-web API |
| No order execution (read-only) | Education kit — refer to core-bridge for trading |
