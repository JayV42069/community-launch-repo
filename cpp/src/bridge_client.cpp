/**
 * @file bridge_client.cpp
 * @brief Education Boilerplate — C++ MT5 Bridge (Simplified)
 *
 * This is a CONDENSED version of the bridge source found in
 * @deepcharts/core-bridge. It demonstrates the core pattern:
 *
 *   1. Connect to MetaTrader 5's TCP listener (configured via
 *      Expert Advisor on the MT5 terminal).
 *   2. Receive JSON line-delimited messages from MT5.
 *   3. Parse the JSON to extract candlestick / tick data.
 *   4. Forward that data over a local TCP socket to a relay
 *      server (Node.js in this project), which fans it out
 *      to browser clients via WebSocket.
 *
 * For the full version with reconnection, heartbeat, batching,
 * binary frames, and production-grade error handling, see:
 *   packages/core-bridge/cpp/src/bridge_client.cpp
 *
 * ─── MT5 Expert Advisor (set this on your chart) ───
 *
 *   // MT5 EA side pseudocode:
 *   // OnTick():
 *   //   string json = "{\"symbol\":\"XAUUSD\",\"bid\":2345.67,\"ask\":2346.01}";
 *   //   FileWrite(handle, json);  // handle from FileOpen() on TCP
 *
 * ─── Build ───
 *   pnpm run build:cpp           # from community-launch-repo/ root
 *
 * Then run:  ./cpp/build/bridge_client
 */

#include "ws_sha1.h"
#include "ws_base64.h"
#include "ws_protocol.h"
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iostream>
#include <thread>
#include <chrono>
#include <string>

#pragma comment(lib, "ws2_32.lib")

// ─── Configuration ──────────────────────────────────────────────
constexpr const char* MT5_HOST = "127.0.0.1";   // MT5 EA listens here
constexpr int         MT5_PORT = 9001;          // TCP port for MT5 EA
constexpr const char* RELAY_HOST = "127.0.0.1"; // Node.js relay server
constexpr int         RELAY_PORT = 8080;        // TCP port for our relay

// ─── Winsock initialization ─────────────────────────────────────
/**
 * @brief Initialize Winsock on Windows. No-op on other platforms.
 */
bool initWinsock() {
#ifdef _WIN32
    WSADATA wsaData;
    return WSAStartup(MAKEWORD(2, 2), &wsaData) == 0;
#else
    return true;
#endif
}

/**
 * @brief Create a TCP connection to a given host:port.
 * @return Socket descriptor, or INVALID_SOCKET on failure.
 */
SOCKET createTCPConnection(const char* host, int port) {
    SOCKET sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock == INVALID_SOCKET) return INVALID_SOCKET;

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    inet_pton(AF_INET, host, &addr.sin_addr);

    if (connect(sock, (sockaddr*)&addr, sizeof(addr)) == SOCKET_ERROR) {
        closesocket(sock);
        return INVALID_SOCKET;
    }
    return sock;
}

/**
 * @brief Read a single JSON line from the MT5 socket.
 *
 * MT5 sends newline-delimited JSON. Each line is one complete message.
 * This function reads until '\n' is encountered.
 */
std::string readLine(SOCKET sock) {
    std::string result;
    char buf[1];
    while (true) {
        int n = recv(sock, buf, 1, 0);
        if (n <= 0) break;
        if (buf[0] == '\n') break;
        if (buf[0] != '\r') result += buf[0];
    }
    return result;
}

int main() {
    if (!initWinsock()) {
        std::cerr << "❌ Winsock failed\n";
        return 1;
    }

    std::cout << "🧠 Education Boilerplate MT5 Bridge\n";
    std::cout << "   Connecting to MT5 EA at " << MT5_HOST << ":" << MT5_PORT << "\n";

    SOCKET mt5Sock = createTCPConnection(MT5_HOST, MT5_PORT);
    if (mt5Sock == INVALID_SOCKET) {
        std::cerr << "❌ Could not connect to MT5. Is the EA running?\n";
        std::cerr << "   Falling back — the Node server generates mock data.\n";
        return 1;
    }

    std::cout << "   Connecting to relay at " << RELAY_HOST << ":" << RELAY_PORT << "\n";
    SOCKET relaySock = createTCPConnection(RELAY_HOST, RELAY_PORT);
    if (relaySock == INVALID_SOCKET) {
        std::cerr << "❌ Could not connect to relay server.\n";
        closesocket(mt5Sock);
        return 1;
    }

    std::cout << "✅ Connected! Streaming data...\n";

    /**
     * Main loop: read JSON from MT5, forward to relay.
     * In the full version, we batch multiple symbols and
     * handle reconnection. Here we just forward raw lines.
     */
    while (true) {
        std::string json = readLine(mt5Sock);
        if (json.empty()) {
            std::cerr << "⚠️  Disconnected from MT5\n";
            closesocket(mt5Sock);
            break;
        }

        // Forward to the Node.js relay server with a trailing newline
        std::string out = json + "\n";
        send(relaySock, out.c_str(), (int)out.size(), 0);
    }

    closesocket(relaySock);
    WSACleanup();
    return 0;
}
