/**
 * @file ws_protocol.h
 * @brief Minimal WebSocket frame parser and builder for educational use.
 *
 * This header implements a tiny subset of RFC 6455 sufficient for
 * server-to-client text frames. It is intentionally simplified —
 * no fragmentation, no binary frames, no per-frame masking (servers
 * do not mask; only clients do).
 *
 * For production use, see @deepcharts/core-bridge which handles the
 * full protocol including fragmentation, compression, and ping/pong.
 */
#pragma once

#include <string>
#include <vector>
#include <cstdint>
#include <cstring>

#ifdef _WIN32
  #include <winsock2.h>
  #include <ws2tcpip.h>
  #pragma comment(lib, "ws2_32.lib")
  // On Windows, htons/htonl are in winsock2.h
  // For 64-bit endianness conversion:
  #define htobe64(x) _byteswap_uint64(x)
#else
  #include <arpa/inet.h>
  #include <endian.h>
#endif

namespace edu_ws {

/// Convert a std::string to a little-endian uint34 byte array (network order).
inline std::vector<uint8_t> encodeFrame(const std::string& payload) {
    std::vector<uint8_t> frame;
    size_t len = payload.size();

    // FIN bit = 1 (final frame), Opcode = 0x1 (text frame)
    uint8_t b1 = 0x81;
    frame.push_back(b1);

    if (len <= 125) {
        // Length fits in 7 bits; set mask bit = 0 (server→client)
        frame.push_back(static_cast<uint8_t>(len));
    } else if (len <= 65535) {
        // 16-bit length
        frame.push_back(126);
        uint16_t len16 = htons(static_cast<uint16_t>(len));
        frame.push_back(*reinterpret_cast<uint8_t*>(&len16));
        frame.push_back(*(reinterpret_cast<uint8_t*>(&len16) + 1));
    } else {
        // 64-bit length
        frame.push_back(127);
        uint64_t len64 = htobe64(len);
        for (int i = 0; i < 8; ++i)
            frame.push_back(*(reinterpret_cast<uint8_t*>(&len64) + i));
    }

    // Append payload bytes
    for (char c : payload)
        frame.push_back(static_cast<uint8_t>(c));

    return frame;
}

} // namespace edu_ws
