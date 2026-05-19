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
  const priceLineRef = useRef<any>(null);

  // Track whether user has manually scrolled away from the latest price
  const userScrolledAwayRef = useRef(false);

  // ─── Real-time WebSocket Integration ──────────────────────────────────
  const {
    candles: realtimeCandles,
    wsState,
    isRealtime,
    latencyMs,
    currentPrice,
    lastUpdate,
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

  // Track whether the chart has been initialized with data
  const chartInitializedRef = useRef(false);
  // Track the last candle time we sent to the chart to avoid redundant updates
  const lastChartTimeRef = useRef<number | null>(null);
  const lastChartCloseRef = useRef<number | null>(null);

  // Crosshair move handler
  const handleCrosshairMove = useCallback((param: any) => {
    if (!param || !param.time || !param.seriesData) {
      // Crosshair left the chart — show last candle data
      if (realtimeCandles.length > 0) {
        const last = realtimeCandles[realtimeCandles.length - 1];
        const change = last.close - last.open;
        setCrosshairData({
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
          volume: last.volume,
          time: new Date(last.time * 1000).toLocaleTimeString(),
          change,
        });
      }
      return;
    }

    const candleData = param.seriesData.get(candlestickSeriesRef.current);
    const volumeData = param.seriesData.get(volumeSeriesRef.current);

    if (candleData) {
      const cd = candleData as any;
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
  }, [realtimeCandles]);

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
        mode: 0,
        vertLine: {
          color: 'rgba(255, 255, 255, 0.08)',
          labelBackgroundColor: '#1e293b',
          width: 1,
          style: 2,
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
        rightOffset: 5,
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

    // Track user scrolling — if they scroll away from the edge, don't auto-scroll
    const timeScale = chart.timeScale();
    timeScale.subscribeVisibleLogicalRangeChange((range: { from: number; to: number } | null) => {
      if (!range) return;
      const dataLength = candlestickSeries.data()?.length ?? 0;
      if (dataLength === 0) return;
      // If user is looking at the last few candles, consider them "at the edge"
      const distanceFromEnd = dataLength - range.to;
      userScrolledAwayRef.current = distanceFromEnd > 8;
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
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      // Note: timeScale subscriptions are cleaned up when chart.remove() is called
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
  }, [handleCrosshairMove]);

  // ─── Data Update Logic ────────────────────────────────────────────────
  // KEY INSIGHT: Use `update()` API for incremental changes (O(1), smooth)
  // Only use `setData()` for initial load or symbol change (expensive, full recalc)
  // This is what makes the chart feel like MetaTrader instead of a laggy web chart.

  // Initial data load / symbol change
  useEffect(() => {
    const series = candlestickSeriesRef.current;
    const volSeries = volumeSeriesRef.current;
    if (!series || !volSeries) return;
    if (realtimeCandles.length === 0) return;

    const isSymbolChange = prevSymbolRef.current !== symbol;

    if (isSymbolChange) {
      // Symbol changed — full data reload required
      const candlesMapped = realtimeCandles.map(c => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      const volumeMapped = realtimeCandles.map(c => ({
        time: c.time as Time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
      }));

      series.setData(candlesMapped);
      volSeries.setData(volumeMapped);

      // Fit content on first load
      chartRef.current?.timeScale().fitContent();

      prevSymbolRef.current = symbol;
      chartInitializedRef.current = true;

      // Track the last candle for incremental updates
      const lastCandle = candlesMapped[candlesMapped.length - 1];
      lastChartTimeRef.current = lastCandle.time as number;
      lastChartCloseRef.current = lastCandle.close;

      // Reset scroll tracking
      userScrolledAwayRef.current = false;
    }
  }, [symbol, realtimeCandles.length > 0 ? symbol : '']);

  // ─── Incremental Real-time Updates ────────────────────────────────────
  // This is the CRITICAL path for MetaTrader-like behavior.
  // Uses `series.update()` which is O(1) and renders at 60fps.
  // `update()` both modifies existing bars and appends new bars.

  useEffect(() => {
    const series = candlestickSeriesRef.current;
    const volSeries = volumeSeriesRef.current;
    if (!series || !volSeries) return;
    if (!chartInitializedRef.current) return;
    if (realtimeCandles.length === 0) return;

    // Check if this is a symbol change — skip incremental update
    if (prevSymbolRef.current !== symbol) return;

    const lastCandle = realtimeCandles[realtimeCandles.length - 1];
    const lastTime = lastCandle.time;
    const lastClose = lastCandle.close;

    // Skip if nothing changed (same time AND same close — no visual update needed)
    if (lastTime === lastChartTimeRef.current && lastClose === lastChartCloseRef.current) {
      return;
    }

    // Build the lightweight-charts data objects for the last candle only
    const candleUpdate = {
      time: lastCandle.time as Time,
      open: lastCandle.open,
      high: lastCandle.high,
      low: lastCandle.low,
      close: lastCandle.close,
    };

    const volumeUpdate = {
      time: lastCandle.time as Time,
      value: lastCandle.volume,
      color: lastCandle.close >= lastCandle.open ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
    };

    // Use update() — this is the MetaTrader secret:
    // - If time exists: updates the bar in place (O(1), no flicker)
    // - If time is new: appends a new bar (also O(1))
    try {
      series.update(candleUpdate);
      volSeries.update(volumeUpdate);
    } catch (e) {
      // Fallback: if update fails (e.g., out-of-order data), do a full setData
      console.warn('[TradeIQ Chart] update() failed, falling back to setData()', e);
      const candlesMapped = realtimeCandles.map(c => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      const volumeMapped = realtimeCandles.map(c => ({
        time: c.time as Time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
      }));
      series.setData(candlesMapped);
      volSeries.setData(volumeMapped);
    }

    // Update tracking refs
    lastChartTimeRef.current = lastTime;
    lastChartCloseRef.current = lastClose;

    // Auto-scroll to latest candle (like MetaTrader)
    // Only scroll if the user hasn't manually scrolled away
    if (!userScrolledAwayRef.current) {
      try {
        chartRef.current?.timeScale().scrollToRealTime();
      } catch {
        // Ignore scroll errors
      }
    }
  }, [realtimeCandles, symbol]);

  // ─── Handle re-initialization when historical data arrives after mount ───
  // This handles the case where the chart mounts before data arrives
  useEffect(() => {
    const series = candlestickSeriesRef.current;
    const volSeries = volumeSeriesRef.current;
    if (!series || !volSeries) return;
    if (realtimeCandles.length === 0) return;
    if (chartInitializedRef.current && prevSymbolRef.current === symbol) return;

    // First data arrival — initialize the chart
    const candlesMapped = realtimeCandles.map(c => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    const volumeMapped = realtimeCandles.map(c => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
    }));

    series.setData(candlesMapped);
    volSeries.setData(volumeMapped);
    chartRef.current?.timeScale().fitContent();

    prevSymbolRef.current = symbol;
    chartInitializedRef.current = true;

    const lastCandle = candlesMapped[candlesMapped.length - 1];
    lastChartTimeRef.current = lastCandle.time as number;
    lastChartCloseRef.current = lastCandle.close;

    userScrolledAwayRef.current = false;
  }, [realtimeCandles.length, symbol]);

  // ─── Current Price Line (using lightweight-charts built-in) ───────────
  // Update the price line whenever the last close changes.
  // This is MetaTrader-style: a horizontal line at the current price
  // with a label showing the price on the right price scale.
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

    // Create a new price line at the current close
    const lineColor = isPriceUp ? '#22c55e' : '#ef4444';
    priceLineRef.current = candlestickSeriesRef.current.createPriceLine({
      price: lastClose,
      color: lineColor,
      lineWidth: 1,
      lineStyle: 2, // Dashed
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
