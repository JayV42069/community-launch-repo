/**
 * @file useOrderFlowStream.ts
 * @brief React hook for consuming candlestick data from the WebSocket relay.
 *
 * This hook connects to ws://localhost:8081 (the Node.js relay server)
 * and maintains an in-memory array of the most recent candlesticks.
 * It handles reconnection automatically.
 *
 * AUTH FLOW:
 *   When `token` is provided, it is appended to the WebSocket URL as
 *   `?token=<jwt>`. The relay server verifies the JWT before completing
 *   the handshake. Without a token the connection still works in
 *   open-relay mode (WANT_AUTH=false on the server).
 *
 * @see server/index.js            — the relay server (auth gate)
 * @see components/CandlestickChart.tsx  — rendering this data
 * @see scripts/verify-ws-auth.js  — automated auth handshake test
 */

import { useState, useEffect, useRef } from 'react';

/** Shape of a single candlestick packet from the bridge. */
export interface Candle {
  symbol: string;
  timeframe: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Options for the WebSocket stream hook. */
export interface UseOrderFlowStreamOptions {
  /** Base WebSocket URL (default: ws://localhost:8081) */
  url?: string;
  /** JWT token for the auth gate (optional; appends as ?token=) */
  token?: string;
  /** Maximum number of candles to keep in memory */
  maxCandles?: number;
}

/**
 * Connect to the WebSocket relay and return an array of recent candles.
 *
 * @param options.url    - WebSocket URL (default: ws://localhost:8081)
 * @param options.token  - JWT token appended as ?token= for auth-gate mode
 * @param options.maxCandles - Max candles to keep in memory (default: 50)
 */
export function useOrderFlowStream(options: UseOrderFlowStreamOptions = {}) {
  const {
    url = 'ws://localhost:8081',
    token,
    maxCandles = 50,
  } = options;

  const [candles, setCandles] = useState<Candle[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    /**
     * Construct the full WebSocket URL with the token query parameter.
     * The relay server reads `?token=` before completing the upgrade.
     */
    const wsUrl = token ? `${url}?token=${encodeURIComponent(token)}` : url;

    /**
     * Attempt a WebSocket connection. If it fails, retry
     * every 2 seconds (exponential backoff could be added).
     */
    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`🔗 Connected to ${wsUrl}`);
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data: Candle = JSON.parse(event.data);
          setCandles(prev => {
            // Append new candle, keep only the last `maxCandles`
            const updated = [...prev, data];
            if (updated.length > maxCandles) {
              updated.shift();
            }
            return updated;
          });
        } catch (e) {
          console.error('Failed to parse message:', event.data);
        }
      };

      ws.onclose = () => {
        console.log('🔌 Disconnected. Reconnecting in 2s...');
        setConnected(false);
        setTimeout(connect, 2000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        ws.close();
      };
    }

    connect();

    // Cleanup on unmount
    return () => {
      wsRef.current?.close();
    };
  }, [url, token, maxCandles]);

  return { candles, connected };
}
