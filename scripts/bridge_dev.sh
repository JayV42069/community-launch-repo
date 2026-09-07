#!/bin/bash
# Development script to run the C++ bridge, MT5 simulator, and Node relay
# Usage: pnpm run bridge:dev  (from the repo root)
#
# This script is designed for Linux/macOS/WSL2 environments.
# On Windows, use: cpp\bridge_runner.bat

set -e

echo "=== Education Boilerplate — Live Pipeline Test ==="

# ─── Helper: Determine binary path (handles both Windows .exe and Linux) ─────────
BINARY="cpp/build/bridge_client"
if [ -f "cpp/build/bridge_client.exe" ]; then
    BINARY="cpp/build/bridge_client.exe"
fi

# ─── Cleanup on exit ─────────────────────────────────────────────────────────────
cleanup() {
    echo ""
    echo "🛑 Shutting down pipeline..."
    [ -n "$MT5_PID" ] && kill "$MT5_PID" 2>/dev/null
    [ -n "$RELAY_PID" ] && kill "$RELAY_PID" 2>/dev/null
    [ -n "$BRIDGE_PID" ] && kill "$BRIDGE_PID" 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

# ─── 1. Start MT5 simulator (listens on port 9001) ───────────────────────────────
echo "🧠 Starting MT5 Simulator on port 9001..."
node scripts/mt5_simulator.js &
MT5_PID=$!

# Give simulator a moment to bind
sleep 1

# ─── 2. Start Node.js relay (listens on port 8081 for WS, 8080 for TCP) ──────────
echo "🌐 Starting Node.js WebSocket Relay..."
node server/index.js &
RELAY_PID=$!

# Give relay a moment to start
sleep 2

# ─── 3. Build and start C++ bridge ───────────────────────────────────────────────
echo "🔨 Building C++ bridge..."
cmake -S cpp -B cpp/build
cmake --build cpp/build --config Release

echo "🌉 Starting C++ Bridge..."
"./${BINARY}" &
BRIDGE_PID=$!

# ─── Wait for processes ───────────────────────────────────────────────────────────
wait $BRIDGE_PID