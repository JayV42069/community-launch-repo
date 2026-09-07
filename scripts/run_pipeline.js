/**
 * @file run_pipeline.js
 * @brief Orchestrates the full C++ → Node → WS pipeline for testing
 *
 * Starts three processes in sequence:
 *   1. MT5 simulator (TCP server on port 9001)
 *   2. Node.js WebSocket relay (TCP listener on 8080, WS server on 8081)
 *   3. C++ bridge (connects to 9001, forwards to 8080)
 *
 * Cleanup: Ctrl+C to stop all three.
 */

import { spawn, execSync } from 'child_process';
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), '..');
const LOG_DIR = join(ROOT, 'logs');

// ─── Ensure log directory exists ──
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

// ─── Child processes ──────────────────
const children = [];

function startProcess(name, cmd, args, opts = {}) {
  const logPath = join(LOG_DIR, `${name}.log`);
  const logStream = createWriteStream(logPath, { flags: 'a' });

  console.log(`▶️  Starting ${name}...`);
  const proc = spawn(cmd, args, {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  });

  proc.stdout.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.log(`[${name}] ${line}`);
    logStream.write(`[${new Date().toISOString()}] ${line}\n`);
  });

  proc.stderr.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.error(`[${name} ERROR] ${line}`);
    logStream.write(`[${new Date().toISOString()}] ERROR: ${line}\n`);
  });

  proc.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`);
    logStream.end();
  });

  children.push(proc);
  return proc;
}

// ─── Start the pipeline ────────────────

async function startPipeline() {
  console.log('═══ Education Boilerplate — Live Pipeline Test ═══\n');

  // 1. Build the C++ bridge first
  try {
    console.log('🔨 Building C++ bridge...');
    execSync('cmake -B build -S . && cmake --build build', {
      cwd: join(ROOT, 'cpp'),
      stdio: 'pipe',
    });
    console.log('✅ C++ bridge compiled\n');
  } catch (e) {
    console.error('❌ Failed to build C++ bridge');
    console.error(e.message);
    process.exit(1);
  }

  // 2. Start Node.js relay (needs to be up before bridge connects)
  startProcess(
    'relay',
    'node',
    ['server/index.js'],
    { env: { ...process.env, WANT_AUTH: 'false' } }
  );

  // Give relay time to initialize
  await new Promise((r) => setTimeout(r, 2000));

  // 3. Start MT5 simulator
  startProcess('mt5-sim', 'node', ['scripts/mt5_simulator.js']);

  // 4. Start C++ bridge
  const bridgePath = join(ROOT, 'cpp', 'build', 'bridge_client.exe');
  startProcess('bridge', bridgePath, []);

  console.log('\n═══ Pipeline running ═══');
  console.log('   MT5 Simulator  → :9001 (simulates MT5 EA)');
  console.log('   C++ Bridge     → :9001 → :8080 (TCP forward)');
  console.log('   Node Relay     → :8080 TCP / :8081 WebSocket');
  console.log('   Frontend       → http://localhost:3000 (separate)');
  console.log('\n   Press Ctrl+C to stop all processes.\n');
}

// ─── Graceful shutdown ──────────────────
function shutdown() {
  console.log('\n🛑 Shutting down all processes...');
  for (const child of children) {
    child.kill();
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ─── Run ─────────────────────────────────
startPipeline().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
