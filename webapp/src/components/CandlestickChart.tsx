import { useEffect, useRef } from 'react';
import { Candle } from '../hooks/useOrderFlowStream';

/**
 * @file CandlestickChart.tsx
 * @brief A from-scratch HTML5 Canvas candlestick chart component.
 *
 * This component renders candlestick charts without any external
 * charting library. Every pixel is drawn manually on a 2D canvas
 * context. It demonstrates:
 *
 *   - Price-to-pixel coordinate transformations
 *   - Wick and body rendering (green for up, red for down)
 *   - Axis labels and grid lines
 *   - Real-time candle appending
 *
 * In the full platform, this is replaced by TradingView integration.
 * Here we build it from first principles so you understand the math.
 */

interface Props {
  candles: Candle[];
}

export default function CandlestickChart({ candles }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const priceRef = useRef<number | null>(null);

  /**
   * Render the chart on the canvas.
   * Called every time candles change.
   */
  useEffect(() => {
    if (!candles || candles.length === 0 || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ─── Layout constants ──────────────────────────────────
    const w = canvas.width;
    const h = canvas.height;
    const margin = { top: 20, bottom: 30, left: 60, right: 40 };
    const chartW = w - margin.left - margin.right;
    const chartH = h - margin.top - margin.bottom;

    // ─── Determine price range ─────────────────────────────
    const allPrices = candles.flatMap(c => [c.high, c.low]);
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const priceRange = maxPrice - minPrice || 1; // avoid divide-by-zero

    // Add 5% padding to top and bottom
    const pad = priceRange * 0.05;
    const hi = maxPrice + pad;
    const lo = minPrice - pad;
    const range = hi - lo;

    // ─── Coordinate transforms ────────────────────────────
    /** Convert a price value to a y-pixel. */
    const priceToY = (price: number) =>
      h - margin.bottom - ((price - lo) / range) * chartH;

    /** Convert a candle index to an x-pixel. */
    const indexToX = (i: number) =>
      margin.left + (i / Math.max(candles.length - 1, 1)) * chartW;

    /** Pixel width of a single candle body. */
    const candleWidth = Math.max(1, (chartW / candles.length) * 0.6);

    // ─── Clear canvas ──────────────────────────────────────
    ctx.fillStyle = '#0a0a0e';
    ctx.fillRect(0, 0, w, h);

    // ─── Draw grid lines ───────────────────────────────────
    ctx.strokeStyle = '#1a1a1e';
    ctx.lineWidth = 1;

    // Horizontal grid + price labels
    const gridSteps = 6;
    for (let i = 0; i <= gridSteps; i++) {
      const y = margin.top + (i / gridSteps) * chartH;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(w - margin.right, y);
      ctx.stroke();

      const price = hi - (i / gridSteps) * range;
      ctx.fillStyle = '#888';
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(price.toFixed(2), margin.left - 6, y + 4);
    }

    // ─── Render candles ────────────────────────────────────
    candles.forEach((c, i) => {
      const x = indexToX(i);
      const yOpen = priceToY(c.open);
      const yClose = priceToY(c.close);
      const yHigh = priceToY(c.high);
      const yLow = priceToY(c.low);

      const isUp = c.close >= c.open;
      ctx.strokeStyle = isUp ? '#00e676' : '#ff5252';
      ctx.fillStyle = isUp ? '#00e676' : '#ff5252';

      // Wick (thin line from high to low)
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      // Body (rectangle from open to close)
      const bodyTop = Math.min(yOpen, yClose);
      const bodyHeight = Math.abs(yClose - yOpen);
      if (bodyHeight < 1) {
        // Doji — draw a thin line
        ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, 1);
      } else {
        ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      }

      // Store latest price for display
      if (i === candles.length - 1) {
        priceRef.current = c.close;
      }
    });
  }, [candles]);

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div className="chart-container">
      <canvas
        ref={canvasRef}
        width={1200}
        height={600}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      {priceRef.current !== null && (
        <div style={{
          position: 'absolute',
          top: 52,
          left: 16,
          padding: '4px 12px',
          background: '#14141a',
          border: '1px solid #222',
          borderRadius: 4,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 13,
          color: '#00d4ff'
        }}>
          {priceRef.current.toFixed(2)}
        </div>
      )}
    </div>
  );
}
