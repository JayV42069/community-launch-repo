/**
 * @file mt5_simulator.js
 * @brief Simulates an MT5 Expert Advisor sending JSON tick data over TCP
 *
 * In production, MetaTrader 5 listens on a TCP port with an Expert Advisor
 * that sends newline-delimited JSON tick/candle data. This simulator mimics
 * that behavior for testing the C++ bridge without requiring an MT5 terminal.
 *
 * Usage:
 *   node scripts/mt5_simulator.js            # runs on port 9001 (default)
 *   MT5_PORT=9002 node scripts/mt5_simulator.js
 *   MT5_SYMBOL=XAUUSD node scripts/mt5_simulator.js
 *
 * The simulator emits realistic candle data with:
 * - Random walk price movements
 * - Volume that correlates with volatility
 * - Occasional spikes (5x normal volume) to stress-test the pipeline
 */

import net from 'net';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Configuration ─────────────────────────
const MT5_PORT = parseInt(process.env.MT5_PORT || '9001', 10);
const SYMBOL = process.env.MT5_SYMBOL || 'XAUUSD';
const INTERVAL_MS = parseInt(process.env.MT5_INTERVAL_MS || '500', 10); // 2 candles/sec for stress test

// ─── State ───────────────────────────────
let basePrice = 2345.67;  // XAUUSD ballpark
let clients = [];
let tickCount = 0;
let spikeActive = false;

// ─── Candle Generator ────────────────────
function generateCandle() {
  const now = new Date();
  const volatility = spikeActive ? 0.8 : 0.3;
  const priceMovement = (Math.random() - 0.5) * volatility;
  basePrice += priceMovement;

  const open = parseFloat(basePrice.toFixed(2));
  const close = parseFloat((basePrice + (Math.random() - 0.5) * volatility).toFixed(2));
  const high = parseFloat(Math.max(open, close, basePrice + Math.random() * volatility / 2).toFixed(2));
  const low = parseFloat(Math.min(open, close, basePrice - Math.random() * volatility / 2).toFixed(2));
  const volume = spikeActive
    ? Math.floor(Math.random() * 5000) + 2000  // spike volume
    : Math.floor(Math.random() * 200) + 50;    // normal volume

  return {
    symbol: SYMBOL,
    timeframe: 'M1',
    timestamp: now.toISOString(),
    tick: tickCount++,
    open,
    high,
    low,
    close,
    volume,
  };
}

// ─── Spike Simulator ─────────────────────
function maybeTriggerSpike() {
  if (Math.random() < 0.02 && !spikeActive) {
    spikeActive = true;
    setTimeout(() => { spikeActive = false; }, Math.floor(Math.random() * 3000) + 1000);
  }
}

// ─── TCP Server (simulates MT5 EA) ───────
const server = net.createServer((socket) => {
  console.log(`🔗 Client connected: ${socket.remoteAddress}:${socket.remotePort}`);

  // Note: No welcome message — the C++ bridge expects raw JSON candlesticks

  let buffer = '';

  socket.on('data', (data) => {
    buffer += data.toString();
    let newlineIdx;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (line) {
        console.log(`  ← ${line.substring(0, 100)}`);
      }
    }
  });

  socket.on('close', () => {
    console.log('🔌 Client disconnected');
  });

  socket.on('error', (err) => {
    console.error('Socket error:', err.message);
  });
});

// ─── Stream Candle Data ──────────────────
setInterval(() => {
  maybeTriggerSpike();
  const candle = generateCandle();

  const json = JSON.stringify(candle);
  const disconnected = [];

  for (const client of clients) {
    if (client.writable) {
      try {
        client.write(json + '\n');
      } catch (e) {
        disconnected.push(client);
      }
    } else {
      disconnected.push(client);
    }
  }

  // Clean up disconnected clients
  for (const dc of disconnected) {
    const idx = clients.indexOf(dc);
    if (idx !== -1) clients.splice(idx, 1);
  }

  if (tickCount % 50 === 0) {
    console.log(`📈 Sent ${tickCount} candles | Current: ${candle.close} | ${spikeActive ? '⚡ SPIKE' : ''}`);
  }
}, INTERVAL_MS);

// ─── Start ─────────────────────────────────
server.listen(MT5_PORT, () => {
  console.log(`\n🧠 MT5 Simulator (Education Boilerplate)`);
  console.log(`  Listening on port ${MT5_PORT}`);
  console.log(`  Symbol: ${SYMBOL}`);
  console.log(`  Interval: ${INTERVAL_MS}ms`);
  console.log(`  Waiting for C++ bridge to connect...\n`);

  // Save PID for cleanup
  fs.writeFileSync(
    join(__dirname, '..', '.mt5-sim.pid'),
    process.pid.toString()
  );
});

// ─── Graceful Shutdown ───────────────────
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down MT5 simulator...');
  server.close(() => {
    process.exit(0);
  });
});
