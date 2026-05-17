'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import type { Time, IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Candle } from '@/lib/types';
import { useRealtimeCandles } from '@/hooks/use-realtime-candles';
import { utcToLocal, getTimezoneDisplay } from '@/lib/timezone';

interface TradingChartProps {
  candles: Candle[];
  symbol: string;
  timeframe: string;
  /** Callback to report WS connection state to parent */
  onWSStateChange?: (state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting', isRealtime: boolean, latencyMs: number | null) => void;
}

export function TradingChart({ candles, symbol, timeframe, onWSStateChange }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const prevSymbolRef = useRef<string>('');
  const prevCandleCountRef = useRef<number>(0);

  // ─── Real-time WebSocket Integration ──────────────────────────────────
  const {
    candles: realtimeCandles,
    wsState,
    isRealtime,
    latencyMs,
  } = useRealtimeCandles(candles, symbol, timeframe);

  // Report WS state to parent
  useEffect(() => {
    onWSStateChange?.(wsState, isRealtime, latencyMs);
  }, [wsState, isRealtime, latencyMs, onWSStateChange]);

  // Timezone display label (computed once, not reactive)
  const [tzDisplay] = useState(() => getTimezoneDisplay());

  // Memoize chart data transformation — convert UTC timestamps to local time
  // so the chart displays times in the user's timezone.
  // Internal data (hooks, WS merge) stays in UTC; only the display layer adjusts.
  const chartData = useMemo(() => {
    const data = realtimeCandles;
    if (!data.length) return { candles: [], volume: [] };

    const candlesMapped = data.map(c => ({
      time: utcToLocal(c.time) as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeMapped = data.map(c => ({
      time: utcToLocal(c.time) as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
    }));

    return { candles: candlesMapped, volume: volumeMapped };
  }, [realtimeCandles]);

  // ─── Incremental Update Logic ─────────────────────────────────────────
  // Instead of calling setData() on every WS message (expensive for large
  // datasets), we use update() for the last candle which is much faster.
  const lastCandleTimeRef = useRef<number | null>(null);
  const lastCandleCountRef = useRef<number>(0);

  // Create chart once on mount
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0a0f' },
        textColor: '#9ca3af',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: 'rgba(255, 255, 255, 0.1)', labelBackgroundColor: '#1a1a2e' },
        horzLine: { color: 'rgba(255, 255, 255, 0.1)', labelBackgroundColor: '#1a1a2e' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        timeVisible: true,
        secondsVisible: false,
      },
      width: container.clientWidth,
      height: container.clientHeight,
    });

    // Add candlestick series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    // Add volume series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (chartRef.current && container) {
        chartRef.current.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Update data — uses incremental updates for real-time, full setData for symbol changes
  useEffect(() => {
    if (!candlestickSeriesRef.current || !volumeSeriesRef.current) return;
    if (chartData.candles.length === 0) return;

    const isSymbolChange = prevSymbolRef.current !== symbol;
    const candleCount = chartData.candles.length;
    const lastCandle = chartData.candles[candleCount - 1];
    const lastVolume = chartData.volume[candleCount - 1];
    const prevCount = lastCandleCountRef.current;

    if (isSymbolChange) {
      // Symbol changed — full data reload
      candlestickSeriesRef.current.setData(chartData.candles);
      volumeSeriesRef.current.setData(chartData.volume);
      chartRef.current?.timeScale().fitContent();
      prevSymbolRef.current = symbol;
      lastCandleTimeRef.current = lastCandle.time as number;
      lastCandleCountRef.current = candleCount;
      prevCandleCountRef.current = candleCount;
    } else if (isRealtime && prevCount > 0 && candleCount >= prevCount) {
      // Real-time update — use incremental update for performance
      // Only update the last candle (much faster than setData for 1000+ candles)

      if (candleCount > prevCount) {
        // New candle added — need to update both the last old candle (now closed)
        // and add the new candle
        candlestickSeriesRef.current.setData(chartData.candles);
        volumeSeriesRef.current.setData(chartData.volume);
      } else if (candleCount === prevCount && lastCandleTimeRef.current !== null) {
        // Same number of candles — just the last one updated (price moved)
        // Use lightweight-charts update() for buttery smooth animation
        try {
          candlestickSeriesRef.current.update(lastCandle);
          volumeSeriesRef.current.update(lastVolume);
        } catch {
          // update() can fail if the time doesn't match any existing bar
          // Fall back to setData
          candlestickSeriesRef.current.setData(chartData.candles);
          volumeSeriesRef.current.setData(chartData.volume);
        }
      }

      lastCandleTimeRef.current = lastCandle.time as number;
      lastCandleCountRef.current = candleCount;

      // Auto-scroll to keep latest candle visible (only if user is near the edge)
      const timeScale = chartRef.current?.timeScale();
      if (timeScale) {
        const logicalRange = timeScale.getVisibleLogicalRange();
        if (logicalRange && logicalRange.to >= candleCount - 5) {
          timeScale.scrollToRealTime();
        }
      }
    } else {
      // Non-realtime or first load — full data set
      candlestickSeriesRef.current.setData(chartData.candles);
      volumeSeriesRef.current.setData(chartData.volume);

      if (prevCandleCountRef.current === 0) {
        // First load — fit to content
        chartRef.current?.timeScale().fitContent();
      }

      lastCandleTimeRef.current = lastCandle.time as number;
      lastCandleCountRef.current = candleCount;
      prevCandleCountRef.current = candleCount;
    }
  }, [chartData, symbol, isRealtime]);

  return (
    <div className="relative w-full h-full">
      <div ref={chartContainerRef} className="w-full h-full chart-container" />

      {/* Loading overlay */}
      {realtimeCandles.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0f]/80">
          <div className="text-gray-500 text-sm">Cargando datos del gráfico...</div>
        </div>
      )}

      {/* Real-time indicator */}
      {isRealtime && (
        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded px-2 py-0.5 z-10">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[9px] text-emerald-400 font-medium">LIVE</span>
          {latencyMs !== null && (
            <span className="text-[8px] text-gray-500">{latencyMs}ms</span>
          )}
        </div>
      )}

      {/* Connecting indicator */}
      {wsState === 'connecting' || wsState === 'reconnecting' ? (
        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded px-2 py-0.5 z-10">
          <span className="relative flex h-2 w-2">
            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
          </span>
          <span className="text-[9px] text-yellow-400 font-medium">CONECTANDO</span>
        </div>
      ) : null}

      {/* Timezone indicator */}
      <div className="absolute bottom-2 right-2 bg-black/40 backdrop-blur-sm rounded px-1.5 py-0.5 z-10">
        <span className="text-[8px] text-gray-500 font-mono">{tzDisplay}</span>
      </div>
    </div>
  );
}
