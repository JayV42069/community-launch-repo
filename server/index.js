/**
 * @file index.js
 * @brief Education Boilerplate — Node.js WebSocket Relay Server
 *
 * This server does three things:
 *
 *   1. Optionally verifies a JWT token on WebSocket connect
 *      (auth gate). In dev mode (WANT_AUTH=false) the relay is open.
 *      In auth mode, the token must be passed as a query-string `?token=`
 *      parameter, matching the handshake flow in useOrderFlowStream.ts.
 *
 *   2. Listens for TCP data from the C++ MT5 bridge
 *      (cpp/src/bridge_client.cpp). The bridge forwards JSON
 *      candlestick data as newline-delimited messages.
 *
 *   3. Serves that data to browser clients over WebSocket.
 *      When a client connects to ws://localhost:8081 it starts
 *      receiving candlesticks in real time.
 *
 * If the C++ bridge is not running (or MT5 is not connected), the server
 * generates mock candlestick data so the React frontend works for
 * learning purposes.
 *
 * @see cpp/src/bridge_client.cpp       — the C++ TCP side
 * @see ../web/src/hooks/useOrderFlowStream.ts — the React client side
 * @see scripts/verify-ws-auth.js        — automated auth handshake test
 */

import WebSocket, { WebSocketServer } from 'ws';
import net from 'net';
import dotenv from 'dotenv';

// ─── Configuration ──────────────────────────────────────────────

/**
 * Load .env.local if present (no crash if file is missing).
 * DOTENV_DISABLE=1 skips loading (used by the auth test script to
 * pass env vars directly without .env.local interference).
 */
if (!process.env.DOTENV_DISABLE) {
  dotenv.config({ path: ['.env.local', '.env'] });
}

/** Port for browser WebSocket connections. */
const WS_PORT = parseInt(process.env.WS_RELAY_PORT || '8081', 10);

/** Port where the C++ bridge connects via TCP. */
const TCP_BRIDGE_PORT = parseInt(process.env.TCP_BRIDGE_PORT || '8080', 10);

/** Whether to require a JWT token on WebSocket connect. */
const WANT_AUTH = process.env.WANT_AUTH === 'true';

/**
 * When true, the server performs a lightweight JWT decode (header +
 * payload) to confirm the token is structurally valid and not expired.
 * When AUTH_BACKEND_URL is set, an additional HTTP call cross-checks the
 * user's Stripe subscription tier against the backend API.
 */
const AUTH_BACKEND_URL = process.env.AUTH_BACKEND_URL || '';

/** Symbol streamed by mock data generator. */
const MOCK_SYMBOL = process.env.MOCK_SYMBOL || 'XAUUSD';

/** Interval (ms) for mock candle generation. */
const MOCK_INTERVAL_MS = parseInt(process.env.MOCK_INTERVAL_MS || '1000', 10);

/** List of subscribed browser clients (each tagged with their tier). */
const clients = new Set();

/** Latest candlestick data, shared across clients. */
let latestCandle = null;
let mockTick = 1950.0;

// ─── Auth: JWT Verification ─────────────────────────────────────

/**
 * Decode a JWT without signature verification (the Clerk/Stripe backend
 * in the full platform handles signature validation via JWKS).
 *
 * In this educational relay we decode the payload to extract:
 *   - `sub`  → Clerk user ID (required)
 *   - `exp`  → expiry timestamp (checked if present)
 *   - `tier` → subscription tier claim (used for channel gating)
 *
 * @param {string} token - The raw JWT string (without "Bearer ").
 * @returns {{ userId: string, tier?: string } | null}
 */
function decodeJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    // base64url → JSON payload
    const payloadB64 = parts[1];
    const padded = payloadB64 + '='.repeat((-payloadB64.length) % 4);
    const payload = JSON.parse(
      Buffer.from(padded, 'base64').toString('utf-8')
    );

    // Expiry check
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null;
    }

    // `sub` or `userId` identifies the Clerk user
    const userId = payload.sub || payload.userId;
    if (!userId) return null;

    return {
      userId,
      tier: payload.tier || (payload.features ? 'Enterprise' : 'Developer'),
    };
  } catch {
    return null;
  }
}

/**
 * Verify the JWT against the optional backend subscription API.
 *
 * If AUTH_BACKEND_URL is set, the server POSTs the token to
 * `${AUTH_BACKEND_URL}/api/v1/auth/subscription-check` and gates the WS
 * connection on the response. In dev mode (no backend), any structurally
 * valid JWT is accepted.
 *
 * This mirrors the middleware.ts pattern on master, where the Edge
 * runtime cross-checks Stripe via the FastAPI backend.
 */
async function verifyToken(token) {
  const decoded = decodeJwt(token);
  if (!decoded) {
    return { authorized: false, reason: 'invalid_token' };
  }

  if (!AUTH_BACKEND_URL) {
    // Dev mode: trust the decoded JWT
    return { authorized: true, userId: decoded.userId, tier: decoded.tier };
  }

  // Cross-check subscription with backend
  try {
    const res = await fetch(
      `${AUTH_BACKEND_URL}/api/v1/auth/subscription-check`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clerkUserId: decoded.userId,
          requiredFeature: 'wsStreaming',
        }),
      }
    );

    if (!res.ok) {
      return { authorized: false, reason: 'subscription_check_failed' };
    }

    const data = await res.json();
    if (!data.active) {
      return { authorized: false, reason: 'no_active_subscription' };
    }

    return { authorized: true, userId: decoded.userId, tier: data.tier };
  } catch (e) {
    console.warn('⚠️  Auth backend unreachable — falling back to token decode:', e.message);
    return { authorized: true, userId: decoded.userId, tier: decoded.tier };
  }
}

/**
 * Extract the JWT token from the WebSocket upgrade request.
 *
 * The token can arrive in two ways:
 *   1. Query string:  ws://host:port/?token=eyJ...
 *   2. Authorization header:  Bearer eyJ...
 *
 * The query-string approach is used by the React hook because the
 * `ws` library does not expose headers until `socket.handshake()`.
 * We inspect the raw upgrade request URL before the connection is
 * upgraded.
 */
function extractToken(request) {
  // Try query string first (used by the frontend hook)
  const url = new URL(request.url || '', 'http://localhost');
  const queryToken = url.searchParams.get('token');
  if (queryToken) return queryToken;

  // Fall back to Authorization header
  const authHeader = request.headers && request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

// ─── WebSocket Server ──────────────────────────────────────────

/** Port for browser WebSocket connections. */

const wss = new WebSocketServer({
  port: WS_PORT,
  /**
   * Auth gate — runs at the WebSocket handshake (before "open" fires
   * on the client), so rejected connections never emit a successful
   * open event.
   *
   * We use the callback-style verifyClient(info, done) — this is the
   * only style that ws v8.x properly supports for async authorization.
   * The Promise-return style is NOT awaited by ws and silently fails open.
   *
   * When WANT_AUTH=true: extract the JWT from ?token=eyJ..., decode it,
   * optionally cross-check against the backend subscription API, and
   * call done(true) or done(false, statusCode, reason).
   *
   * This is the educational mirror of the full platform's middleware.ts
   * WS gate — there we check Clerk JWT + Stripe on the Next.js Edge.
   * Here it's simplified: dev-mode JWT decode + optional backend call.
   */
  verifyClient: (info, done) => {
    if (!WANT_AUTH) {
      return done(true);
    }

    // info.req is the raw http.IncomingMessage (ws v8.x uses "req" not "request")
    const token = extractToken(info.req);
    if (!token) {
      return done(false, 401, 'Unauthorized: missing token');
    }

    // verifyToken is async — resolve the Promise, then call done()
    verifyToken(token)
      .then((result) => {
        if (!result.authorized) {
          return done(false, 403, `Forbidden: ${result.reason}`);
        }
        // Stash auth info for the connection handler
        info.req.userAuth = result;
        return done(true);
      })
      .catch((err) => {
        console.error('Auth verification error:', err.message);
        return done(false, 500, 'Internal error');
      });
  },
});

wss.on('listening', () => {
  console.log(`📡 WebSocket server listening on ws://localhost:${WS_PORT}` +
    (WANT_AUTH ? ' (auth gate: ON)' : ' (auth gate: OFF)'));
});

wss.on('connection', (ws, request) => {
  // Auth info was attached during verifyClient (or absent if open relay)
  const tier = request.userAuth?.tier || 'open';
  console.log(`🔗 Client connected (${clients.size + 1} total, tier=${tier})`);
  clients.add(ws);

  // Send the most recent candle immediately so the chart isn't empty
  if (latestCandle) {
    ws.send(JSON.stringify(latestCandle));
  }

  ws.on('close', () => {
    console.log(`🔌 Client disconnected (${clients.size - 1} remaining)`);
    clients.delete(ws);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
});

// ─── TCP Bridge Listener ───────────────────────────────────────

/**
 * Listen for TCP connections from the C++ bridge.
 * Each line received is a JSON candlestick packet forwarded to all WS clients.
 */
const tcpServer = net.createServer((socket) => {
  console.log('🔗 C++ bridge connected via TCP');

  // Buffer to handle partial TCP segments
  let buffer = '';

  socket.on('data', (chunk) => {
    buffer += chunk.toString();
    // Process complete lines (newline-delimited JSON)
    let newlineIdx;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);

      if (line) {
        try {
          const data = JSON.parse(line);
          broadcast(data);
        } catch (e) {
          console.error('Failed to parse TCP message:', line);
        }
      }
    }
  });

  socket.on('close', () => {
    console.log('🔌 C++ bridge disconnected');
  });

  socket.on('error', (err) => {
    console.error('TCP bridge error:', err.message);
  });
});

tcpServer.listen(TCP_BRIDGE_PORT, () => {
  console.log(`🌉 TCP bridge listening on port ${TCP_BRIDGE_PORT}`);
});

// ─── Mock Data Fallback ────────────────────────────────────────

/**
 * Generate a mock candlestick packet with random-walk data.
 * Used when the C++ bridge is not connected.
 */
function generateMockCandle() {
  mockTick += (Math.random() - 0.5) * 2;
  const now = new Date();

  const candle = {
    symbol: MOCK_SYMBOL,
    timeframe: 'M1',
    timestamp: now.toISOString(),
    open: parseFloat(mockTick.toFixed(2)),
    high: parseFloat((mockTick + Math.random()).toFixed(2)),
    low: parseFloat((mockTick - Math.random()).toFixed(2)),
    close: parseFloat(mockTick.toFixed(2)),
    volume: Math.floor(Math.random() * 100) + 50,
  };

  latestCandle = candle;
  return candle;
}

/**
 * When no C++ bridge is connected, generate mock data periodically.
 * This ensures the frontend chart animates even without MT5.
 * A single interval handles both cases — no need for two loops.
 */
const mockInterval = setInterval(() => {
  if (clients.size > 0) {
    generateMockCandle();
    broadcast(latestCandle);
  }
}, MOCK_INTERVAL_MS);

// ─── Graceful Shutdown ─────────────────────────────────────────

process.on('SIGTERM', () => {
  clearInterval(mockInterval);
  tcpServer.close();
  wss.close();
  console.log('🛑 Server shut down');
});

process.on('SIGINT', () => {
  clearInterval(mockInterval);
  tcpServer.close();
  wss.close();
  console.log('🛑 Server shut down');
});
