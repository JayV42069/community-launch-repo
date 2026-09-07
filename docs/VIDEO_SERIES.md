# Video Series: Build a Trading Data Pipeline from Scratch

This document maps each video in the companion YouTube series to the specific files, code sections, and concepts covered in this repository.

---

## Video 1: Architecture Overview — "From MT5 to Browser, No Frameworks"

**Goal**: Understand the four-component pipeline and why each layer exists.

### What's Covered

- The 4-component architecture: MT5 → C++ Bridge → Node Relay → React Frontend
- Why use C++ for the bridge (performance, direct socket control)
- Why Node.js for the relay (WebSocket fan-out, easy auth)
- Why Canvas for the chart (pixel-perfect control, no bundle bloat)

### Code References

- `README.md` — Architecture diagram and data flow section
- `package.json` — Root workspace structure (`server`, `webapp` workspaces)
- `scripts/mt5_simulator.js` (lines 1–18) — What the simulator replaces
- `server/index.js` (lines 1–27) — Server's "three things" doc comment
- `webapp/src/App.tsx` (lines 1–18) — Frontend subscription entry point

### Key Concepts

- TCP vs WebSocket — when to use each transport
- Newline-delimited JSON (NDJSON) for line-based protocols
- Mock data fallback pattern

### Commands Shown

```bash
pnpm install
```

---

## Video 2: C++ TCP Bridge Deep Dive — "WebSocket Handshake from First Principles"

**Goal**: Understand the WebSocket protocol, SHA-1 hashing, Base64 encoding, and TCP forwarding — all implemented from scratch in C++.

### What's Covered

- How the C++ bridge connects to MT5 over TCP
- The WebSocket handshake that browsers expect
- Implementing SHA-1 from scratch (yes, all 80 rounds)
- Base64 encoding for the `Sec-WebSocket-Accept` header
- Forwarding JSON candlesticks line-by-line

### Code References

- `cpp/src/bridge_client.cpp` — Main file, fully commented
  - `initWinsock()` (line 56) — Windows socket initialization
  - `createTCPConnection()` (line 69) — TCP connection helper
  - `readLine()` (line 91) — NDJSON line reader
  - `main()` (line 103) — Connection sequence and forward loop
- `cpp/include/ws_protocol.h` — WebSocket frame encoder
- `cpp/include/ws_sha1.h` — SHA-1 implementation
- `cpp/include/ws_base64.h` — Base64 encoder
- `cpp/CMakeLists.txt` — Cross-platform build (Winsock on Windows, pthread on Linux)

### Key Concepts

- Winsock2 vs POSIX sockets
- `htobe64` / `_byteswap_uint64` for cross-platform endianness
- WebSocket frame format (FIN bit, opcode, payload length encoding)
- RFC 6455 magic GUID: `258EAFA5-E917-4C2C-A567-C033B5F6C124`

### Commands Shown

```bash
cd cpp
cmake -B build -S .
cmake --build build --config Release
```

---

## Video 3: Node.js WebSocket Relay — "Auth Gates and Mock Data"

**Goal**: Build the WebSocket relay server with JWT auth, TCP listener, and mock data fallback.

### What's Covered

- Setting up a `ws` v8.21.3 WebSocket server with callback-style `verifyClient`
- JWT decoding (without signature verification — dev mode only)
- TCP listener for C++ bridge connections
- Mock data generation when no bridge is connected
- Graceful shutdown handling

### Code References

- `server/index.js` — Full server source, ~370 lines
  - Configuration block (line 33–65) — All environment variables
  - `decodeJwt()` (line 88) — JWT payload extraction
  - `verifyToken()` (line 129) — Auth + optional backend cross-check
  - `extractToken()` (line 182) — Query string and header extraction
  - WebSocket server setup (line 201) — `verifyClient` callback pattern
  - TCP server (line 280) — `net.createServer` with NDJSON buffer handling
  - Mock data generator (line 324) — Random walk candle simulation
  - Graceful shutdown (line 357) — SIGINT/SIGTERM handlers

### Key Concepts

- Why `ws` v8 uses `info.req` (not `info.request`)
- Callback-style `verifyClient` vs Promise-return (the Promise style silently fails open)
- Why `setInterval` must be assigned to a const for `clearInterval` on shutdown
- DOTENV_DISABLE=1 pattern for test scripts

### Commands Shown

```bash
pnpm run dev:server
pnpm run test:auth
```

---

## Video 4: React Canvas Chart from Scratch — "No Charting Libraries"

**Goal**: Build a candlestick chart using nothing but HTML5 Canvas and React hooks.

### What's Covered

- Connecting React to the WebSocket relay via a custom hook
- Pixel-perfect coordinate transformations (price → y-pixel, index → x-pixel)
- Drawing wicks, bodies, grid lines, and axis labels
- Green/red coloring (up vs down candles)
- Doji handling (when open === close)
- Real-time candle appending with memory bounds

### Code References

- `webapp/src/hooks/useOrderFlowStream.ts` — WebSocket consumer hook
  - `Candle` interface (line 23) — Data shape
  - Connection with auto-reconnect (line 73) — Exponential retry pattern
  - `cereals` state management (line 85) — Circular buffer with `shift()`
- `webapp/src/components/CandlestickChart.tsx` — Canvas renderer
  - `priceToY()` (line 61) — Price-to-pixel transform
  - `indexToX()` (line 65) — Index-to-pixel transform
  - Grid rendering (line 79) — Horizontal lines + price labels
  - Candle rendering (line 96) — Wick + body drawing loop
  - Doji special case (line 116) — Single-pixel body when open === close
- `webapp/src/App.tsx` — Root component wiring

### Key Concepts

- Canvas `fillRect` vs `beginPath`/`stroke` for lines
- Monospace font for financial charts (`ui-monospace, monospace`)
- Why `noEmit: true` in tsconfig for Vite projects
- Vite proxy configuration for dev mode

### Commands Shown

```bash
pnpm dev:webapp
```

---

## Video 5: Testing & Verification — "Don't Trust Your Eyes, Run Tests"

**Goal**: Validate the auth handshake, TCP forwarding, and WebSocket broadcasting with automated tests.

### What's Covered

- WebSocket auth handshake: valid token → open, no token → rejected, expired token → rejected
- Tenant resolution: API key, host header, tier override, default fallback
- Mock data generation verification
- End-to-end pipeline verification

### Code References

- `scripts/verify-ws-auth.js` — Auth handshake test suite
  - JWT builder (line 49) — Creates test tokens with dummy signatures
  - `tryConnect()` (line 80) — Connection helper with timeout
  - Test matrix (line 107) — 3 test cases with pass/fail reporting
  - Server spawn + env injection (line 150) — `DOTENV_DISABLE` pattern
- `scripts/test-tenant-resolution.js` — Tenant config test suite
  - Test matrix (line 27) — 12 test cases covering all resolution paths
  - Priority validation (line 94) — API key > host header > tier override > default
- `scripts/mt5_simulator.js` — Spike simulation for stress testing
  - `maybeTriggerSpike()` (line 68) — 2% chance per tick of 5x volume spike
  - `generateCandle()` (line 40) — Random walk with correlated volume

### Key Concepts

- Why the auth test uses `DOTENV_DISABLE=1` to control the environment
- Test isolation: each test spawns a fresh server instance
- TCP buffer handling for partial message segments

### Commands Shown

```bash
pnpm run test:auth
pnpm run test:tenant
```

---

## Video 6: Running the Full Pipeline — "End-to-End Without Real MT5"

**Goal**: Run the complete pipeline locally using the MT5 simulator so you can see real-time candlesticks without a MetaTrader 5 installation.

### What's Covered

- Starting the MT5 simulator (TCP server on port 9001)
- Building and starting the C++ bridge (forwards :9001 → :8080)
- Starting the Node relay (listens on :8080 TCP, :8081 WebSocket)
- Connecting the React frontend
- Reading logs to debug pipeline issues

### Code References

- `scripts/run_pipeline.js` — Full pipeline orchestrator
  - Build step (line 68) — `cmake -B build -S . && cmake --build build`
  - Relay spawn (line 82) — With `WANT_AUTH=false`
  - Simulator spawn (line 93) — MT5 simulator on :9001
  - Bridge spawn (line 96) — C++ binary from `cpp/build/`
  - Shutdown handler (line 108) — Kills all children on Ctrl+C
- `scripts/run_bridge.js` — Persistent bridge wrapper with auto-restart
  - Crash recovery (line 37) — 3-second restart delay
- `scripts/bridge_dev.sh` — Linux/macOS version of the pipeline

### Key Concepts

- Process lifecycle management from Node.js
- Why the relay must start before the bridge (bridge retries on failure)
- Log aggregation: each process writes to `logs/<name>.log`

### Commands Shown

```bash
pnpm run pipeline:mt5     # Terminal 1: Start MT5 simulator
pnpm run build:cpp        # Terminal 2: Build C++ bridge
pnpm run dev:server       # Terminal 3: Start Node relay
pnpm dev:webapp              # Terminal 4: Start React frontend
```

Or one command for everything:

```bash
pnpm run pipeline        # Orchestrates all of the above
```

---

## Video 7: Extending the Boilerplate — "Your Turn to Build"

**Goal**: Customize the pipeline — add new symbols, modify chart rendering, enable auth, and understand how each piece connects for production.

### What's Covered

- Adding new symbols: modify `MOCK_SYMBOL` or extend the simulator
- Chart extensions: volume bars, moving averages, crosshairs
- Enabling auth: set `WANT_AUTH=true`, provide JWT via `VITE_WS_TOKEN`
- Production hardening: reconnection logic, error boundaries, rate limiting
- Extending to multiple brokers: multi-port TCP listeners

### Code References

- `webapp/src/hooks/useOrderFlowStream.ts` (line 36) — `url` parameter for multi-broker support
- `server/config/routes.ts` (reference) — Full tenant routing pattern
- `server/index.js` (line 201) — `verifyClient` for auth gate extension
- `cpp/src/bridge_client.cpp` (line 103) — Multi-connection scaling notes
- `webapp/src/components/CandlestickChart.tsx` (line 33) — Extension point for overlays

### Key Concepts

- How the full `moon-dev-web` SaaS extends this boilerplate
- Tenant-based feature gating (Developer/Pro/Enterprise tiers)
- Stripe subscription cross-check via `AUTH_BACKEND_URL`
- Architecture for scaling to 100+ concurrent WebSocket clients

### Next Steps

1. Fork this repo
2. Pick an extension from the list above
3. Open a PR — we review community contributions weekly

---

## Repo Mapping Summary

| Video | Primary Files | Secondary Files |
|-------|--------------|-----------------|
| 1. Architecture | `README.md`, `package.json`, `pnpm-workspace.yaml` | `scripts/mt5_simulator.js` (header), `server/index.js` (header), `webapp/src/App.tsx` (header) |
| 2. C++ Bridge | `cpp/src/bridge_client.cpp`, `cpp/include/*.h` | `cpp/CMakeLists.txt`, `cpp/bridge_runner.bat` |
| 3. Node Relay | `server/index.js` | `scripts/verify-ws-auth.js` |
| 4. React Chart | `webapp/src/components/CandlestickChart.tsx`, `webapp/src/hooks/useOrderFlowStream.ts` | `webapp/src/App.tsx`, `webapp/src/styles.css`, `webapp/vite.config.ts` |
| 5. Testing | `scripts/verify-ws-auth.js`, `scripts/test-tenant-resolution.js` | `scripts/mt5_simulator.js` (spike logic) |
| 6. Full Pipeline | `scripts/run_pipeline.js`, `scripts/mt5_simulator.js`, `scripts/run_bridge.js`, `scripts/bridge_dev.sh` | `cpp/CMakeLists.txt` |
| 7. Extensions | `webapp/src/components/CandlestickChart.tsx` (rendering), `server/index.js` (auth), `cpp/src/bridge_client.cpp` (scaling) | `webapp/src/hooks/useOrderFlowStream.ts` (multi-broker) |