/**
 * @file ws_base64.h
 * @brief Base64 encoder for the WebSocket handshake Sec-WebSocket-Accept.
 *
 * Only encoding is needed — the client sends the key, we compute the
 * accept hash. No base64 decoding is required on the server side.
 */
#pragma once

#include <string>
#include <vector>
#include <cstdint>

inline const char* B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Base64-encode a byte array.
 * @param data Pointer to raw bytes (e.g. SHA-1 digest).
 * @param len  Number of bytes.
 * @return Base64-encoded string with no padding (sufficient for WS handshake).
 */
inline std::string base64_encode(const uint8_t* data, size_t len) {
    std::string out;
    for (size_t i = 0; i < len; i += 3) {
        uint32_t n = (data[i] << 16);
        n |= (i + 1 < len) ? (data[i + 1] << 8) : 0;
        n |= (i + 2 < len) ? data[i + 2] : 0;
        out += B64_CHARS[(n >> 18) & 63];
        out += B64_CHARS[(n >> 12) & 63];
        if (i + 1 < len) out += B64_CHARS[(n >> 6) & 63];
        if (i + 2 < len) out += B64_CHARS[n & 63];
    }
    while (out.size() % 4) out += '=';
    return out;
}
