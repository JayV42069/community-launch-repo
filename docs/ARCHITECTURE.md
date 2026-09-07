# Architecture Deep Dive

## Pipeline Overview

```
┌─────────────┐         TCP/NDJSON          ┌────────────────┐         TCP/NDJSON          ┌──────────────────┐
│  MT5 EA     │◄────────────────────────────│  C++ Bridge    │◄────────────────────────────│  Node.js Relay   │
│  (port 9001)│         (127.0.0.1)         │  bridge_client │         (127.0.0.1)         │  (TCP:8080,WS:808)│
│             │                             │                │                             │                  │
│ • Sends     │                             │ • Connects to  │                             │ • Listens for    │
│   JSON      │                             │   MT5 TCP      │                             │   TCP data from  │
│   candles   │                             │   socket       │                             │   C++ bridge     │
│   on tick   │                             │ • Parses NDJSON│                             │ • Broadcasts to  │
│             │                             │ • Forwards     │                             │   WebSocket      │
│             │                             │   each line    │                             │   clients        │
└─────────────┘                             │ • Optional WS  │                             │ • Mock data when │
                                            │   handshake    │                             │   no bridge      │
                                            │   (simplified) │                             │                  │
                                            └────────────────┘                              └────────┬───────────┘
                                                                                                      │
                                                                                         WebSocket/JSON (JSON)
                                                                                                      │
                                                                                                      ▼
                                   ┌─────────────────────────────────────────────────────────────────┐
                                   │                        React Frontend                            │
                                   │                         (port 3000)                             │
                                   │                                                                  │
                                   │  useOrderFlowStream.ts → App.tsx → CandlestickChart.tsx         │
                                   │                                                                  │
                                   │  • WS connects to :8081                                           │
                                   │  • Renders candles on HTML5 Canvas                                 │
                                   │  • Auto-reconnects on disconnect                                  │
                                   └──────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. MT5 Expert Advisor (External)

The MT5 EA is a MetaTrader 5 script that sends JSON candle data. It is **not included** in this repository — you write the EA yourself or use the provided simulator (`scripts/mt5_simulator.js`).

**Message format (NDJSON)**:
```json
{"symbol":"XAUUSD","timeframe":"M1","timestamp":"2024-01-01T12:00:00.000Z","tick":1,"open":2345.67,"high":2346.00,"low":2345.30,"close":2345.80,"volume":120}
```

### 2. C++ Bridge (`cpp/src/bridge_client.cpp`)

**Purpose**: TCP-to-TCP forwarder.

**Startup sequence**:
1. Initialize Winsock (`WSAStartup`) — Windows only
2. Connect to MT5 simulator/Ea at `127.0.0.1:9001`
3. Connect to Node relay at `127.0.0.1:8080`
4. Enter forward loop: `readLine()` from MT5 → `send()` to relay

**Key design decisions**:
- Single-threaded: one read, one write, blocking sockets
- No batching: each JSON line is forwarded immediately
- No reconnection: if MT5 disconnects, the bridge exits (wrapper restarts)
- No WebSocket: the bridge speaks raw TCP, not WebSocket

### 3. Node.js Relay (`server/index.js`)

**Three subsystems**:

#### TCP Listener (port 8080)
- Accepts connections from the C++ bridge
- Parses NDJSON lines from the TCP buffer
- Broadcasts parsed JSON to all WebSocket clients

#### WebSocket Server (port 8081)
- Hosts the real-time data stream for browsers
- Optional JWT auth gate via `verifyClient` callback
- Sends the latest candle to new connections immediately

#### Mock Data Generator
- Activates when no TCP bridge is connected
- Generates random-walk candle data for learning
- Respects `MOCK_SYMBOL` and `MOCK_INTERVAL_MS` env vars

### 4. React Frontend (`webapp/src/`)

#### `useOrderFlowStream.ts`
- React hook that manages WebSocket connection
- Maintains a rolling buffer of the last N candles (default 50)
- Auto-reconnects every 2 seconds on disconnect
- Supports JWT token injection via `VITE_WS_TOKEN`

#### `CandlestickChart.tsx`
- Pure HTML5 Canvas renderer — no external charting library
- Coordinate transforms: `priceToY()` and `indexToX()`
- Rendering pipeline: clear → grid → candles → price label
- Up candles: green (#00e676), Down candles: red (#ff5252)

## Configuration

All configurability flows through environment variables in `.env.local`:

| Subsystem | Variable | Default | Purpose |
|-----------|----------|---------|---------|
| Bridge | `MT5_HOST` | `127.0.0.1` | MT5 TCP address |
| Bridge | `MT5_PORT` | `9001` | MT5 EA port |
| Relay | `TCP_BRIDGE_PORT` | `8080` | Bridge TCP listener |
| Relay | `WS_RELAY_PORT` | `8081` | Browser WS server |
| Relay | `WANT_AUTH` | `false` | JWT auth gate on/off |
| Relay | `AUTH_BACKEND_URL` | (empty) | Subscription verification backend |
| Mock | `MOCK_SYMBOL` | `XAUUSD` | Symbol for mock data |
| Mock | `MOCK_INTERVAL_MS` | `1000` | Mock candle interval |

## Scaling Considerations

This boilerplate is designed for learning. For production:

1. **Multiple symbols**: Run parallel bridge instances per broker, fan-in at the relay
2. **High-frequency data**: Replace TCP forwarding with shared memory or IPC
3. **WebSocket scale**: Use `ws` with clustering or a message broker (Redis Streams)
4. **Auth**: Add Clerk/Stripe integration mirroring the full moon-dev-web stack
5. **Charting**: Replace Canvas with WebGL or TradingView Lightweight Charts for 60fps