import { useOrderFlowStream } from './hooks/useOrderFlowStream';
import CandlestickChart from './components/CandlestickChart';

/**
 * @file App.tsx
 * @brief Root component — header with status, canvas candlestick chart.
 *
 * This is the main entry point for the React app. It subscribes to
 * the WebSocket stream and passes incoming candles to the chart.
 *
 * In the full platform this would be a Next.js page with routing,
 * auth, settings, multi-panel layout, etc. Here it's minimal.
 *
 * AUTH: set `VITE_WS_TOKEN` in the environment to enable the auth gate.
 * The token is passed as ?token= to the relay server. When unset, the
 * server runs in open-relay mode (WANT_AUTH=false).
 */
export default function App() {
  // Vite automatically exposes VITE_* env vars to the client bundle.
  const wsToken = import.meta.env.VITE_WS_TOKEN || undefined;
  const { candles, connected } = useOrderFlowStream({ token: wsToken });

  return (
    <>
      <div className="header">
        <span className="title">
          <span className="accent">DeepCharts</span> · Education Boilerplate
        </span>
        <span style={{ fontSize: 12, color: '#888' }}>
          {candles.length} candles · {candles[candles.length - 1]?.symbol || '—'}
        </span>
      </div>

      <div className="status">
        <span className={`dot ${connected ? 'connected' : ''}`}></span>
        {connected
          ? 'Connected to WebSocket relay'
          : 'Connecting to ws://localhost:8081...'}
      </div>

      <CandlestickChart candles={candles} />
    </>
  );
}
