/**
 * @file ws_sha1.h
 * @brief SHA-1 hashing for WebSocket handshake (Sec-WebSocket-Accept).
 *
 * The WebSocket handshake requires computing SHA-1 of the magic GUID
 * concatenated with the client's Sec-WebSocket-Key, then base64-encoding
 * the result.
 *
 * This is a compact, educational SHA-1 implementation. It is NOT
 * cryptographically secure and should never be used for anything other
 * than the WebSocket handshake.
 */
#pragma once

#include <string>
#include <cstdint>
#include <cstring>
#include <cstdio>

/**
 * Compute SHA-1 hash of input data.
 * @param data Pointer to input bytes.
 * @param len  Number of input bytes.
 * @return Hex-encoded SHA-1 digest string (40 characters).
 */
inline std::string sha1(const void* data, size_t len) {
    uint32_t h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE,
             h3 = 0x10325476, h4 = 0xC3D2E1F0;

    // Pre-processing: padding
    // Helper: left-rotate a 32-bit integer by n bits
    auto leftrotate = [](uint32_t x, uint32_t n) { return (x << n) | (x >> (32 - n)); };

    std::string msg((const char*)data, len);
    uint64_t bitlen = (uint64_t)len * 8;
    msg.push_back(0x80);
    while (msg.size() % 64 != 56) msg.push_back('\0');
    for (int i = 7; i >= 0; --i) msg.push_back((char)((bitlen >> (i * 8)) & 0xFF));

    // Process each 512-bit (64-byte) chunk
    for (size_t off = 0; off < msg.size(); off += 64) {
        uint32_t w[80];
        for (int i = 0; i < 16; ++i)
            w[i] = ((uint8_t)msg[off + i*4] << 24) | ((uint8_t)msg[off + i*4 + 1] << 16) |
                   ((uint8_t)msg[off + i*4 + 2] << 8) | ((uint8_t)msg[off + i*4 + 3]);
        for (int i = 16; i < 80; ++i) w[i] = leftrotate(w[i-3] ^ w[i-8] ^ w[i-14] ^ w[i-16], 1);

        uint32_t a = h0, b = h1, c = h2, d = h3, e = h4;
        for (int i = 0; i < 80; ++i) {
            uint32_t f, k;
            if (i < 20)       { f = (b & c) | (~b & d); k = 0x5A827999; }
            else if (i < 40)  { f = b ^ c ^ d;          k = 0x6ED9EBA1; }
            else if (i < 60)  { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
            else              { f = b ^ c ^ d;          k = 0xCA62C1D6; }
            uint32_t temp = leftrotate(a, 5) + f + e + k + w[i];
            e = d; d = c; c = leftrotate(b, 30); b = a; a = temp;
        }
        h0 += a; h1 += b; h2 += c; h3 += d; h4 += e;
    }

    char buf[41];
    snprintf(buf, sizeof(buf), "%08x%08x%08x%08x%08x", h0, h1, h2, h3, h4);
    return std::string(buf);
}
