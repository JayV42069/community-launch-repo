/**
 * @file run_bridge.js
 * @brief Wrapper to run the C++ bridge as a managed child process
 *
 * The C++ bridge is a long-running forwarder (infinite loop).
 * This wrapper spawns it and restarts it if it crashes,
 * keeping the pipeline alive during testing.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), '..');
const BRIDGE_PATH = join(ROOT, 'cpp', 'build', 'bridge_client.exe');

console.log('🌉 Starting C++ Bridge wrapper...');
console.log(`   Binary: ${BRIDGE_PATH}`);

function startBridge() {
  const bridge = spawn(BRIDGE_PATH, [], {
    cwd: ROOT,
    stdio: 'pipe',
  });

  bridge.stdout.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.log(`[bridge] ${line}`);
  });

  bridge.stderr.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.error(`[bridge ERROR] ${line}`);
  });

  bridge.on('exit', (code, signal) => {
    console.log(`[bridge] Process exited (code: ${code}, signal: ${signal})`);
    console.log('[bridge] Restarting in 3s...');
    setTimeout(startBridge, 3000);
  });

  return bridge;
}

const proc = startBridge();

// Graceful shutdown
function shutdown() {
  console.log('\n🛑 Shutting down bridge wrapper...');
  proc.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('✅ Bridge wrapper running. Press Ctrl+C to stop.');
