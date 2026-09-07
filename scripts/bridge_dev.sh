#!/bin/bash
# Development script to run the C++ bridge, MT5 simulator, and Node relay
# Usage: pnpm run bridge:dev  (from education-boilerplate/)

set -e

echo "=== Education Boilerplate — Live Pipeline Test ==="

# 1. Start MT5 simulator (listens on port 9001)
echo "🧠 Starting MT5 Simulator on port 9001..."
node scripts/mt5_simulator.js &
MT5_PID=$!

# Give simulator a moment to bind
sleep 1

# 2. Start Node.js relay (listens on port 8081 for WS, 8080 for TCP from bridge)
echo "🌐 Starting Node.js WebSocket Relay..."
node server/index.js &
RELAY_PID=$!

# Give relay a moment to start
sleep 2

# 3. Build and start C++ bridge (connects to MT5 simulator on 9001, forwards to relay on 8080)
echo "🔨 Building C++ bridge..."
cd cpp
cmake -B build -S .
cmake --build build
cd ..

echo "🌉 Starting C++ Bridge..."
./cpp/build/bridge_client.exe &
BRIDGE_PID=$!

# Wait for processes
wait $BRIDGE_PID
