/**
 * @file verify-ws-auth.js
 * @brief Automated WebSocket auth handshake verification for the education boilerplate.
 *
 * This script:
 *   1. Spawns the relay server with WANT_AUTH=true
 *   2. Generates a test JWT (structurally valid, dev-mode decode only)
 *   3. Connects with a valid token   → expects 'open'
 *   4. Connects without a token       → expects 'close' (401)
 *   5. Connects with an expired token  → expects 'close' (403)
 *   6. Kills the server and prints PASS/FAIL
 *
 * Usage:
 *   node scripts/verify-ws-auth.js
 *   # Or override the relay port:
 *   WS_PORT=8090 node scripts/verify-ws-auth.js
 */

import { spawn, execSync } from 'child_process';
import WebSocket from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, '..', 'server', 'index.js');

const WS_PORT = process.env.WS_PORT || '8081';
const WS_URL = `ws://localhost:${WS_PORT}`;

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Base64url-encode a string (no padding).
 */
function b64url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * Build a JWT from a payload object. The signature is a dummy string
 * — the relay server in dev mode only decodes the payload, it does not
 * verify signatures (real signature verification happens in the Clerk
 * backend on the full platform).
 */
function buildJwt(payload, overrideHeader) {
  const header = b64url(JSON.stringify(overrideHeader || { alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const signature = b64url('dev-mode-signature');
  return `${header}.${body}.${signature}`;
}

const VALID_TOKEN = buildJwt({
  sub: 'user_edu_test_001',
  sid: 'sess_edu_test_001',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  tier: 'Pro',
  features: { wsStreaming: true },
});

const EXPIRED_TOKEN = buildJwt({
  sub: 'user_edu_test_002',
  sid: 'sess_edu_test_002',
  iat: Math.floor(Date.now() / 1000) - 7200,
  exp: Math.floor(Date.now() / 1000) - 3600, // expired 1 hour ago
  tier: 'Developer',
});

// ─── Test runner ─────────────────────────────────────────────────

let results = [];

/**
 * Attempt a WebSocket connection. Resolves with the close code or 'open'.
 */
function tryConnect(token) {
  return new Promise((resolve) => {
    const url = token ? `${WS_URL}?token=${token}` : WS_URL;
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      resolve({ result: 'timeout', url });
    }, 3000);

    ws.on('open', () => {
      clearTimeout(timer);
      ws.close();
      resolve({ result: 'open', url });
    });

    ws.on('close', (code) => {
      clearTimeout(timer);
      resolve({ result: 'close', code, url });
    });

    ws.on('error', () => {
      clearTimeout(timer);
      resolve({ result: 'error', url });
    });
  });
}

async function runTests() {
  console.log('═══ WebSocket Auth Handshake Verification ═══\n');

  // ── Test 1: Valid token → expect open ──
  console.log('Test 1: Valid JWT token → expect connection open');
  const r1 = await tryConnect(VALID_TOKEN);
  const pass1 = r1.result === 'open';
  console.log(`  ${pass1 ? '✅ PASS' : '❌ FAIL'} — got: ${r1.result}` +
    (r1.code ? ` (code ${r1.code})` : ''));
  results.push({ name: 'valid_token', pass: pass1 });

  // ── Test 2: No token → expect rejection ──
  // When the server rejects the WS handshake, the client emits an
  // "error" event (the server's HTTP error response), followed by
  // a "close" event. We accept either as a valid rejection.
  console.log('Test 2: No token → expect rejection (error or close)');
  const r2 = await tryConnect(null);
  const pass2 = r2.result === 'close' || r2.result === 'error';
  console.log(`  ${pass2 ? '✅ PASS' : '❌ FAIL'} — got: ${r2.result}` +
    (r2.code ? ` (code ${r2.code})` : ''));
  results.push({ name: 'no_token', pass: pass2 });

  // ── Test 3: Expired token → expect rejection ──
  console.log('Test 3: Expired JWT → expect rejection (error or close)');
  const r3 = await tryConnect(EXPIRED_TOKEN);
  const pass3 = r3.result === 'close' || r3.result === 'error';
  console.log(`  ${pass3 ? '✅ PASS' : '❌ FAIL'} — got: ${r3.result}` +
    (r3.code ? ` (code ${r3.code})` : ''));
  results.push({ name: 'expired_token', pass: pass3 });

  // ── Summary ──
  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  console.log(`\n═══ Results: ${passed}/${total} passed ═══\n`);

  process.exitCode = passed === total ? 0 : 1;
}

// ─── Main: spawn server, run tests, kill server ──────────────────

console.log('Starting relay server with WANT_AUTH=true...\n');

// Spawn the server with auth enabled
const child = spawn('node', [SERVER_PATH], {
  env: {
    ...process.env,
    WANT_AUTH: 'true',
    WS_RELAY_PORT: WS_PORT,
    TCP_BRIDGE_PORT: String(parseInt(WS_PORT, 10) + 1),
    // DOTENV_DISABLE skips .env.local loading so we control all env vars
    DOTENV_DISABLE: '1',
    // No backend — test dev-mode JWT decode path only
    AUTH_BACKEND_URL: '',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});

// Capture server logs
let serverReady = false;
child.stdout.on('data', (data) => {
  const msg = data.toString().trim();
  if (msg.includes('listening')) serverReady = true;
  console.log(`  [server] ${msg}`);
});
child.stderr.on('data', (data) => {
  console.error(`  [server:err] ${data.toString().trim()}`);
});

// Wait for the server to be ready, then run tests
const checkReady = setInterval(() => {
  if (serverReady) {
    clearInterval(checkReady);
    setTimeout(async () => {
      await runTests();
      child.kill();
    }, 500);
  }
}, 200);

// Safety timeout
setTimeout(() => {
  if (!serverReady) {
    console.error('\n❌ Server did not start within 10 seconds.');
    child.kill();
    process.exit(1);
  }
}, 10000);
