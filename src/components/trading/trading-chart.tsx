'use client';

import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import type { Time, IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Candle } from '@/lib/types';
import { useRealtimeCandles } from '@/hooks/use-realtime-candles';
import { getTimezoneDisplay } from '@/lib/timezone';

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
    currentPrice,
  } = useRealtimeCandles(candles, symbol, timeframe);

  // Report WS state to parent
  useEffect(() => {
    onWSStateChange?.(wsState, isRealtime, latencyMs);
  }, [wsState, isRealtime, latencyMs, onWSStateChange]);

  // Timezone display label
  const [tzDisplay] = useState(() => getTimezoneDisplay());

  // OHLC data under crosshair (for overlay display like MetaTrader)
  const [crosshairData, setCrosshairData] = useState<{
    open: number; high: number; low: number; close: number;
    volume: number; time: string; change: number;
  } | null>(null);

  // Memoize chart data transformation
  const chartData = useMemo(() => {
    const data = realtimeCandles;
    if (!data.length) return { candles: [], volume: [] };

    const candlesMapped = data.map(c => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeMapped = data.map(c => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
    }));

    return { candles: candlesMapped, volume: volumeMapped };
  }, [realtimeCandles]);

  // Get the last close for the current price line
  const lastClose = useMemo(() => {
    if (currentPrice !== null) return currentPrice;
    if (chartData.candles.length === 0) return null;
    return chartData.candles[chartData.candles.length - 1].close;
  }, [currentPrice, chartData.candles]);

  // Format price for display
  const formatPrice = useCallback((price: number): string => {
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    return price.toFixed(4);
  }, []);

  // ─── Incremental Update Logic ─────────────────────────────────────────
  const lastCandleTimeRef = useRef<number | null>(null);
  const lastCandleCountRef = useRef<number>(0);

  // Crosshair move handler
  const handleCrosshairMove = useCallback((param: any) => {
    if (!param || !param.time || !param.seriesData) {
      // Crosshair left the chart — show last candle data
      if (chartData.candles.length > 0) {
        const last = chartData.candles[chartData.candles.length - 1];
        const prevClose = chartData.candles.length > 1
          ? chartData.candles[chartData.candles.length - 2].close
          : last.open;
        const change = last.close - prevClose;
        setCrosshairData({
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
          volume: chartData.volume[chartData.volume.length - 1]?.value ?? 0,
          time: new Date((last.time as number) * 1000).toLocaleTimeString(),
          change,
        });
      }
      return;
    }

    const candleData = param.seriesData.get(candlestickSeriesRef.current);
    const volumeData = param.seriesData.get(volumeSeriesRef.current);

    if (candleData) {
      const cd = candleData as any;
      const prevClose = cd.open; // Approximate — the change from open
      setCrosshairData({
        open: cd.open,
        high: cd.high,
        low: cd.low,
        close: cd.close,
        volume: (volumeData as any)?.value ?? 0,
        time: new Date((param.time as number) * 1000).toLocaleTimeString(),
        change: cd.close - cd.open,
      });
    }
  }, [chartData.candles, chartData.volume]);

  // Create chart once on mount
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0e17' },
        textColor: '#6b7280',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.02)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.02)' },
      },
      crosshair: {
        mode: 0, // Normal mode (crosshair moves freely)
        vertLine: {
          color: 'rgba(255, 255, 255, 0.08)',
          labelBackgroundColor: '#1e293b',
          width: 1,
          style: 2, // Dashed
        },
        horzLine: {
          color: 'rgba(255, 255, 255, 0.08)',
          labelBackgroundColor: '#1e293b',
          width: 1,
          style: 2,
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.04)',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.04)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5, // Leave space on the right for the price line label
        barSpacing: 8,
        minBarSpacing: 2,
      },
      width: container.clientWidth,
      height: container.clientHeight,
    });

    // Add candlestick series with MetaTrader-like styling
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
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

    // Subscribe to crosshair move for OHLC overlay
    chart.subscribeCrosshairMove(handleCrosshairMove);

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
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [handleCrosshairMove]);

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
    } else if (isRealtime && candleCount >= prevCount) {
      // Real-time update — use incremental update for performance
      if (candleCount > prevCount) {
        // New candle added — update the series
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
          candlestickSeriesRef.current.setData(chartData.candles);
          volumeSeriesRef.current.setData(chartData.volume);
        }
      } else {
        // Fewer candles than before — full reload
        candlestickSeriesRef.current.setData(chartData.candles);
        volumeSeriesRef.current.setData(chartData.volume);
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

      if (prevCandleCountRef.current === 0 || candleCount !== prevCandleCountRef.current) {
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
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0e17]/80">
          <div className="text-gray-500 text-sm">Cargando datos del gráfico...</div>
        </div>
      )}

      {/* ─── OHLC Overlay (MetaTrader-style) ──────────────────────────────── */}
      {crosshairData && (
        <div className="absolute top-1 left-1 flex items-center gap-2 z-10 pointer-events-none select-none">
          <span className="text-[10px] font-mono text-gray-400">
            O <span className="text-gray-200">{formatPrice(crosshairData.open)}</span>
          </span>
          <span className="text-[10px] font-mono text-gray-400">
            H <span className="text-gray-200">{formatPrice(crosshairData.high)}</span>
          </span>
          <span className="text-[10px] font-mono text-gray-400">
            L <span className="text-gray-200">{formatPrice(crosshairData.low)}</span>
          </span>
          <span className="text-[10px] font-mono text-gray-400">
            C <span className={crosshairData.change >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {formatPrice(crosshairData.close)}
            </span>
          </span>
          {crosshairData.volume > 0 && (
            <span className="text-[10px] font-mono text-gray-500">
              Vol <span className="text-gray-300">{crosshairData.volume >= 1000000
                ? `${(crosshairData.volume / 1000000).toFixed(1)}M`
                : crosshairData.volume >= 1000
                ? `${(crosshairData.volume / 1000).toFixed(1)}K`
                : crosshairData.volume.toFixed(0)}</span>
            </span>
          )}
        </div>
      )}

      {/* ─── Current Price Line (MetaTrader-style) ───────────────────────── */}
      {lastClose !== null && (
        <div
          className="absolute right-0 z-10 pointer-events-none select-none"
          style={{
            // Position at the right edge, aligned with the price scale
            top: '50%', // Approximate — lightweight-charts manages the exact position
          }}
        >
          <div className={`px-1.5 py-0.5 text-[9px] font-mono font-bold whitespace-nowrap ${
            crosshairData && crosshairData.change >= 0 ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          }`}
          style={{ borderRadius: '2px 0 0 2px' }}>
            ${formatPrice(lastClose)}
          </div>
        </div>
      )}

      {/* Real-time indicator */}
      {isRealtime && (
        <div className="absolute top-1 right-12 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded px-2 py-0.5 z-10">
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

      {/* Connecting / Reconnecting indicator */}
      {(wsState === 'connecting' || wsState === 'reconnecting') && !isRealtime && (
        <div className="absolute top-1 right-12 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded px-2 py-0.5 z-10">
          <span className="relative flex h-2 w-2">
            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
          </span>
          <span className="text-[9px] text-yellow-400 font-medium">CONECTANDO</span>
        </div>
      )}

      {/* Delayed indicator — WS not connected but data available via polling */}
      {wsState === 'disconnected' && !isRealtime && realtimeCandles.length > 0 && (
        <div className="absolute top-1 right-12 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded px-2 py-0.5 z-10">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          <span className="text-[9px] text-blue-400 font-medium">DELAYED</span>
        </div>
      )}

      {/* Timezone indicator */}
      <div className="absolute bottom-1 right-1 bg-black/40 backdrop-blur-sm rounded px-1.5 py-0.5 z-10">
        <span className="text-[8px] text-gray-500 font-mono">{tzDisplay}</span>
      </div>
    </div>
  );
}
