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
  onWSStateChange?: (state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting', isRealtime: boolean, latencyMs: number | null) => void;
  onPriceMismatch?: () => void;
}

export function TradingChart({ candles, symbol, timeframe, onWSStateChange, onPriceMismatch }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const prevSymbolRef = useRef<string>('');
  const priceLineRef = useRef<any>(null);
  const userScrolledAwayRef = useRef(false);
  const chartInitializedRef = useRef(false);
  const lastChartTimeRef = useRef<number | null>(null);
  const lastChartCloseRef = useRef<number | null>(null);

  // ─── Real-time WebSocket Integration ──────────────────────────────────
  const {
    candles: realtimeCandles,
    wsState,
    isRealtime,
    latencyMs,
    currentPrice,
    priceMismatch,
  } = useRealtimeCandles(candles, symbol, timeframe);

  // Report price mismatch to parent (triggers candle re-fetch)
  useEffect(() => {
    if (priceMismatch) {
      onPriceMismatch?.();
    }
  }, [priceMismatch, onPriceMismatch]);

  // Report WS state to parent
  useEffect(() => {
    onWSStateChange?.(wsState, isRealtime, latencyMs);
  }, [wsState, isRealtime, latencyMs, onWSStateChange]);

  // ─── Hydration-safe timezone display ─────────────────────────────
  const [tzDisplay, setTzDisplay] = useState('');
  useEffect(() => {
    setTzDisplay(getTimezoneDisplay());
  }, []);

  // ─── Hydration-safe mounted flag ─────────────────────────────────
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // OHLC data under crosshair (for overlay display like MetaTrader)
  const [crosshairData, setCrosshairData] = useState<{
    open: number; high: number; low: number; close: number;
    volume: number; time: string; change: number;
  } | null>(null);

  // ─── CRITICAL FIX: Use ref for crosshair callback to prevent chart recreation ───
  // The crosshair callback needs access to realtimeCandles but we must NOT
  // make it a dependency of the chart creation effect. Store it in a ref.
  const realtimeCandlesRef = useRef<Candle[]>(realtimeCandles);
  realtimeCandlesRef.current = realtimeCandles;

  const crosshairCallbackRef = useRef<(param: any) => void>(() => {});

  // Update the callback whenever realtimeCandles changes
  crosshairCallbackRef.current = useCallback((param: any) => {
    const currentCandles = realtimeCandlesRef.current;
    if (!param || !param.time || !param.seriesData) {
      if (currentCandles.length > 0) {
        const last = currentCandles[currentCandles.length - 1];
        setCrosshairData({
          open: last.open, high: last.high, low: last.low, close: last.close,
          volume: last.volume, time: new Date(last.time * 1000).toLocaleTimeString(),
          change: last.close - last.open,
        });
      }
      return;
    }

    const candleData = param.seriesData.get(candlestickSeriesRef.current);
    const volumeData = param.seriesData.get(volumeSeriesRef.current);

    if (candleData) {
      const cd = candleData as any;
      setCrosshairData({
        open: cd.open, high: cd.high, low: cd.low, close: cd.close,
        volume: (volumeData as any)?.value ?? 0,
        time: new Date((param.time as number) * 1000).toLocaleTimeString(),
        change: cd.close - cd.open,
      });
    }
  }, []);

  // Get the last close for the current price line
  const lastClose = useMemo(() => {
    if (currentPrice !== null) return currentPrice;
    if (realtimeCandles.length === 0) return null;
    return realtimeCandles[realtimeCandles.length - 1].close;
  }, [currentPrice, realtimeCandles]);

  // Determine if price is up or down
  const isPriceUp = useMemo(() => {
    if (realtimeCandles.length < 2) return true;
    const last = realtimeCandles[realtimeCandles.length - 1];
    return last.close >= last.open;
  }, [realtimeCandles]);

  // Format price for display
  const formatPrice = useCallback((price: number): string => {
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    return price.toFixed(4);
  }, []);

  // ─── Create chart ONCE on mount — NEVER re-create ────────────────────
  // FIX: Removed handleCrosshairMove from dependency array.
  // The chart must only be created once and destroyed on unmount.
  // The crosshair callback is accessed via ref so it's always current.
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
        mode: 0,
        vertLine: { color: 'rgba(255, 255, 255, 0.08)', labelBackgroundColor: '#1e293b', width: 1, style: 2 },
        horzLine: { color: 'rgba(255, 255, 255, 0.08)', labelBackgroundColor: '#1e293b', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.04)',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.04)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
        minBarSpacing: 2,
      },
      width: container.clientWidth,
      height: container.clientHeight,
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    // Use the ref-based callback so the chart subscription is stable
    chart.subscribeCrosshairMove((param: any) => {
      crosshairCallbackRef.current(param);
    });

    // Track user scrolling for auto-scroll behavior
    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange((range: { from: number; to: number } | null) => {
      if (!range) return;
      const dataLength = candlestickSeries.data()?.length ?? 0;
      if (dataLength === 0) return;
      userScrolledAwayRef.current = (dataLength - range.to) > 8;
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
      priceLineRef.current = null;
      chartInitializedRef.current = false;
      lastChartTimeRef.current = null;
      lastChartCloseRef.current = null;
    };
  }, []); // ← EMPTY dependency array: chart is created ONCE

  // ─── Data Update Logic ────────────────────────────────────────────────
  // KEY: Use `series.update()` for incremental changes (O(1), smooth like MetaTrader)
  // Only use `setData()` for initial load or symbol change (full recalc)

  // Initialize / symbol change
  useEffect(() => {
    const series = candlestickSeriesRef.current;
    const volSeries = volumeSeriesRef.current;
    if (!series || !volSeries) return;
    if (realtimeCandles.length === 0) return;

    const isSymbolChange = prevSymbolRef.current !== symbol;

    if (isSymbolChange || !chartInitializedRef.current) {
      const candlesMapped = realtimeCandles.map(c => ({
        time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close,
      }));
      const volumeMapped = realtimeCandles.map(c => ({
        time: c.time as Time, value: c.volume,
        color: c.close >= c.open ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
      }));

      series.setData(candlesMapped);
      volSeries.setData(volumeMapped);

      // Only fitContent on symbol change, not on every re-initialization
      if (isSymbolChange) {
        chartRef.current?.timeScale().fitContent();
      }

      prevSymbolRef.current = symbol;
      chartInitializedRef.current = true;

      const lastCandle = candlesMapped[candlesMapped.length - 1];
      lastChartTimeRef.current = lastCandle.time as number;
      lastChartCloseRef.current = lastCandle.close;
      userScrolledAwayRef.current = false;
    }
  }, [symbol, realtimeCandles.length > 0]);

  // ─── Incremental Real-time Updates ────────────────────────────────────
  // The CRITICAL path for MetaTrader-like behavior.
  // Uses `series.update()` which is O(1) and renders at 60fps.

  useEffect(() => {
    const series = candlestickSeriesRef.current;
    const volSeries = volumeSeriesRef.current;
    if (!series || !volSeries) return;
    if (!chartInitializedRef.current) return;
    if (realtimeCandles.length === 0) return;
    if (prevSymbolRef.current !== symbol) return;

    const lastCandle = realtimeCandles[realtimeCandles.length - 1];
    const lastTime = lastCandle.time;
    const lastClose = lastCandle.close;

    // Skip if nothing changed visually
    if (lastTime === lastChartTimeRef.current && lastClose === lastChartCloseRef.current) {
      return;
    }

    const candleUpdate = {
      time: lastCandle.time as Time,
      open: lastCandle.open, high: lastCandle.high,
      low: lastCandle.low, close: lastCandle.close,
    };

    const volumeUpdate = {
      time: lastCandle.time as Time,
      value: lastCandle.volume,
      color: lastCandle.close >= lastCandle.open ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
    };

    // update() modifies existing bar OR appends new bar — O(1), no flicker
    try {
      series.update(candleUpdate);
      volSeries.update(volumeUpdate);
    } catch {
      // Fallback: full setData if update fails
      const candlesMapped = realtimeCandles.map(c => ({
        time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close,
      }));
      const volumeMapped = realtimeCandles.map(c => ({
        time: c.time as Time, value: c.volume,
        color: c.close >= c.open ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
      }));
      series.setData(candlesMapped);
      volSeries.setData(volumeMapped);
    }

    lastChartTimeRef.current = lastTime;
    lastChartCloseRef.current = lastClose;

    // Auto-scroll to latest price (like MetaTrader)
    if (!userScrolledAwayRef.current) {
      try {
        chartRef.current?.timeScale().scrollToRealTime();
      } catch {
        // Ignore scroll errors
      }
    }
  }, [realtimeCandles, symbol]);

  // ─── Current Price Line ───────────────────────────────────────────
  useEffect(() => {
    if (!candlestickSeriesRef.current || lastClose === null) return;

    // Remove existing price line
    if (priceLineRef.current) {
      try {
        candlestickSeriesRef.current.removePriceLine(priceLineRef.current);
      } catch {
        // Price line may have been removed already
      }
      priceLineRef.current = null;
    }

    const lineColor = isPriceUp ? '#22c55e' : '#ef4444';
    priceLineRef.current = candlestickSeriesRef.current.createPriceLine({
      price: lastClose,
      color: lineColor,
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: '',
    });
  }, [lastClose, isPriceUp]);

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
      {mounted && crosshairData && (
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

      {/* Real-time indicator */}
      {mounted && isRealtime && (
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
      {mounted && (wsState === 'connecting' || wsState === 'reconnecting') && !isRealtime && (
        <div className="absolute top-1 right-12 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded px-2 py-0.5 z-10">
          <span className="relative flex h-2 w-2">
            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
          </span>
          <span className="text-[9px] text-yellow-400 font-medium">CONECTANDO</span>
        </div>
      )}

      {/* Delayed indicator */}
      {mounted && wsState === 'disconnected' && !isRealtime && realtimeCandles.length > 0 && (
        <div className="absolute top-1 right-12 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded px-2 py-0.5 z-10">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          <span className="text-[9px] text-blue-400 font-medium">DELAYED</span>
        </div>
      )}

      {/* Timezone indicator — suppressHydrationWarning since it differs server vs client */}
      {mounted && tzDisplay && (
        <div className="absolute bottom-1 right-1 bg-black/40 backdrop-blur-sm rounded px-1.5 py-0.5 z-10">
          <span className="text-[8px] text-gray-500 font-mono">{tzDisplay}</span>
        </div>
      )}
    </div>
  );
}
