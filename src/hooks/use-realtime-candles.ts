/**
 * useRealtimeCandles — React hook that merges REST historical candles
 * with Binance WebSocket live updates.
 *
 * How it works:
 * 1. Receives historical candles from the REST API (via TanStack Query)
 * 2. Subscribes to Binance WebSocket for the current symbol + timeframe
 * 3. On each WS message, updates the last candle (if forming) or appends a new one (if closed)
 * 4. Returns merged candles that update in real-time
 *
 * The hook also tracks WebSocket connection state and provides it
 * for UI indicators.
 *
 * IMPORTANT: Only works for crypto symbols. For stocks/ETFs,
 * the hook returns the original REST candles unchanged (no WS available).
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { getBinanceWS, isWSCompatible } from '@/lib/data/binance-ws';
import type { Candle } from '@/lib/types';
import type { WSConnectionState, WSState } from '@/lib/data/binance-ws';

interface UseRealtimeCandlesResult {
  /** Merged candles: historical + live updates */
  candles: Candle[];
  /** WebSocket connection state */
  wsState: WSConnectionState;
  /** Whether real-time updates are active */
  isRealtime: boolean;
  /** Current latency in ms (from WS message timestamp) */
  latencyMs: number | null;
}

/**
 * Merge a live candle update into the existing candle array.
 *
 * Strategy:
 * - If the live candle matches the last candle in the array (same time),
 *   replace it (the candle is still forming, price moved)
 * - If the live candle has a NEW time (a new period started),
 *   append it to the array
 * - If the live candle matches an older candle, ignore it
 */
function mergeLiveCandle(historical: Candle[], liveCandle: Candle): Candle[] {
  if (historical.length === 0) {
    return [liveCandle];
  }

  const lastCandle = historical[historical.length - 1];

  // Same period — update the last candle
  if (lastCandle.time === liveCandle.time) {
    const merged = [...historical];
    merged[merged.length - 1] = {
      time: liveCandle.time,
      open: liveCandle.open,
      high: Math.max(lastCandle.high, liveCandle.high),
      low: Math.min(lastCandle.low, liveCandle.low),
      close: liveCandle.close,
      volume: liveCandle.volume,
    };
    return merged;
  }

  // New period — the live candle is from a new time slot
  if (liveCandle.time > lastCandle.time) {
    return [...historical, liveCandle];
  }

  // Live candle is older than our last historical candle — ignore
  return historical;
}

/**
 * Hook that provides real-time candle updates via Binance WebSocket.
 *
 * Design notes:
 * - All ref reads/writes happen inside useEffect callbacks (never during render)
 * - setState is only called from WS event callbacks (external system updates)
 *   or from useEffect with proper dependency arrays
 * - Historical candle changes are detected via a computed key in a useEffect
 *
 * @param historicalCandles - Candles from the REST API (historical)
 * @param symbol - The trading symbol (e.g., 'BTC', 'ETHUSDT')
 * @param timeframe - The chart timeframe (e.g., '1m', '5m', '1D')
 * @returns Merged candles with real-time updates + WS state
 */
export function useRealtimeCandles(
  historicalCandles: Candle[],
  symbol: string,
  timeframe: string
): UseRealtimeCandlesResult {
  const [mergedCandles, setMergedCandles] = useState<Candle[]>(historicalCandles);
  const [wsState, setWsState] = useState<WSConnectionState>('disconnected');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // Refs for WS callback filtering — updated inside effects only
  const symbolRef = useRef(symbol);
  const timeframeRef = useRef(timeframe);

  // Sync refs to latest values (in effect, not during render)
  useEffect(() => {
    symbolRef.current = symbol;
    timeframeRef.current = timeframe;
  });

  // Reset merged candles when historical data identity changes
  // This happens when: new symbol, new timeframe, or REST API refetch
  const historyKey = `${symbol}:${timeframe}:${historicalCandles.length}:${historicalCandles[0]?.time ?? 0}:${historicalCandles[historicalCandles.length - 1]?.time ?? 0}`;

  useEffect(() => {
    setMergedCandles(historicalCandles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyKey]);

  // Subscribe to WebSocket for real-time updates
  useEffect(() => {
    if (!isWSCompatible(symbol)) {
      return;
    }

    const ws = getBinanceWS();

    // Subscribe to kline stream — setState from external callback is fine
    ws.subscribe(symbol, timeframe, (update) => {
      if (update.symbol !== symbolRef.current || update.interval !== timeframeRef.current) {
        return;
      }

      setMergedCandles(prev => mergeLiveCandle(prev, update.candle));
    });

    // Track connection state — setState from external callback is fine
    const unsubState = ws.onStateChange((state: WSState) => {
      setWsState(state.connectionState);
      setLatencyMs(state.latencyMs);
    });

    return () => {
      ws.unsubscribe();
      unsubState();
    };
  }, [symbol, timeframe]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const ws = getBinanceWS();
      ws.unsubscribe();
    };
  }, []);

  const isRealtime = isWSCompatible(symbol) && wsState === 'connected';

  return {
    candles: mergedCandles,
    wsState: isWSCompatible(symbol) ? wsState : 'disconnected',
    isRealtime,
    latencyMs,
  };
}
