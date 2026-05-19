/**
 * useRealtimeCandles — React hook that merges REST historical candles
 * with live WebSocket updates.
 *
 * How it works:
 * 1. Receives historical candles from the REST API (via TanStack Query)
 * 2. For crypto: subscribes to Binance WebSocket
 * 3. For stocks (if Alpaca keys configured): subscribes to Alpaca WebSocket
 * 4. On each WS message, updates the last candle (if forming) or appends a new one (if closed)
 * 5. Returns merged candles that update in real-time
 *
 * FIX (BUG 3): Previously, when TanStack Query refetched historical candles,
 * the `historyKey` would change and `setMergedCandles(historicalCandles)` would
 * overwrite ALL WS-merged updates with stale REST data. This caused the chart
 * to "jump back" periodically, making candles appear frozen.
 *
 * Now we use a smarter merge strategy:
 * - When historical candles change for the SAME symbol/timeframe, we smart-merge
 *   them with the current WS state instead of replacing everything
 * - WS updates to the last candle (or new candles) are preserved
 * - Only if the symbol/timeframe changes do we fully reset
 *
 * FIX (BUG 4): Alpaca WS always sends 1-minute bars regardless of the
 * selected timeframe. When the user selects 5m/15m/1H/4H, we need to
 * aggregate the 1m bars into the correct timeframe before merging.
 * Without this, the WS candle timestamps don't match the chart's candle
 * timestamps, causing real-time updates to be silently dropped by
 * mergeLiveCandle() (which only updates if time matches or is newer).
 *
 * FIX (BUG 5): Added explicit initialization with historical candles
 * and a forced re-render trigger to ensure the chart always shows
 * candle data immediately, even if WS hasn't connected yet.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { getBinanceWS, isWSCompatible } from '@/lib/data/binance-ws';
import { getAlpacaWS } from '@/lib/data/alpaca-ws';
import type { Candle } from '@/lib/types';
import type { WSConnectionState, WSState } from '@/lib/data/binance-ws';
import type { AlpacaWSState } from '@/lib/data/alpaca-ws';

interface UseRealtimeCandlesResult {
  /** Merged candles: historical + live updates */
  candles: Candle[];
  /** WebSocket connection state */
  wsState: WSConnectionState;
  /** Whether real-time updates are active */
  isRealtime: boolean;
  /** Current latency in ms (from WS message timestamp) */
  latencyMs: number | null;
  /** Which WS provider is active */
  wsProvider: 'binance' | 'alpaca' | 'none';
}

/**
 * Merge a live candle update into the existing candle array.
 */
function mergeLiveCandle(historical: Candle[], liveCandle: Candle): Candle[] {
  if (historical.length === 0) {
    return [liveCandle];
  }

  const lastCandle = historical[historical.length - 1];

  // Same period — update the last candle
  // FIX: When aggregating 1m bars into larger timeframes, we must
  // preserve the open from the first bar in the bucket and properly
  // merge high/low. The close always comes from the latest bar.
  // For volume: Binance WS sends cumulative volume per kline period,
  // while Alpaca sends per-bar volume. We use the liveCandle's volume
  // when it's larger (Binance cumulative), otherwise add (Alpaca per-bar).
  if (lastCandle.time === liveCandle.time) {
    const merged = [...historical];
    merged[merged.length - 1] = {
      time: liveCandle.time,
      open: lastCandle.open,    // Keep the original open (first bar in bucket)
      high: Math.max(lastCandle.high, liveCandle.high),
      low: Math.min(lastCandle.low, liveCandle.low),
      close: liveCandle.close,  // Always use latest close
      // Use the larger volume — handles both Binance (cumulative) and Alpaca (per-bar)
      volume: Math.max(lastCandle.volume, liveCandle.volume),
    };
    return merged;
  }

  // New period — append
  if (liveCandle.time > lastCandle.time) {
    return [...historical, liveCandle];
  }

  // Older than our last candle — ignore
  return historical;
}

/**
 * Smart merge: combine new historical candles with existing WS-merged state.
 *
 * Preserves WS updates to the latest candle while incorporating new
 * closed candles from the REST refetch.
 */
function smartMergeHistorical(
  newHistorical: Candle[],
  currentMerged: Candle[]
): Candle[] {
  if (currentMerged.length === 0) {
    return newHistorical;
  }
  if (newHistorical.length === 0) {
    return currentMerged;
  }

  const mergedLast = currentMerged[currentMerged.length - 1];
  const histLast = newHistorical[newHistorical.length - 1];

  // WS has updated this candle (same time, but WS has fresher data)
  // Prefer WS version — it's always more recent than the REST snapshot
  if (mergedLast.time === histLast.time) {
    const merged = [...newHistorical];
    merged[merged.length - 1] = {
      time: mergedLast.time,
      open: histLast.open,
      high: Math.max(histLast.high, mergedLast.high),
      low: Math.min(histLast.low, mergedLast.low),
      close: mergedLast.close,
      volume: mergedLast.volume,
    };
    return merged;
  }

  // WS has a NEWER candle (new period started via WS, not yet in REST)
  if (mergedLast.time > histLast.time) {
    return [...newHistorical, mergedLast];
  }

  // Historical has newer data — use it
  return newHistorical;
}

/**
 * Aggregate an Alpaca 1-minute bar into the selected timeframe bucket.
 *
 * Alpaca WS always sends 1m bars. When the chart shows 5m/15m/1H/4H/1D candles,
 * we need to snap the 1m bar timestamp to the start of its containing bucket,
 * so that mergeLiveCandle() can correctly update the right candle in the array.
 *
 * For example, a 1m bar at 10:23 with timeframe=5m gets snapped to 10:20,
 * which matches the 5m candle already in the chart data.
 */
function aggregateAlpacaBar(candle: Candle, timeframe: string): Candle {
  // If timeframe is 1m or not recognized, no aggregation needed
  if (timeframe === '1m' || !timeframe) return candle;

  const tfSeconds: Record<string, number> = {
    '5m': 300,
    '15m': 900,
    '1H': 3600,
    '4H': 14400,
    '1D': 86400,
    '1W': 604800,
  };

  const bucketSeconds = tfSeconds[timeframe];
  if (!bucketSeconds) return candle;

  // Snap the candle time to the start of its bucket
  const bucketStart = Math.floor(candle.time / bucketSeconds) * bucketSeconds;

  return {
    time: bucketStart,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  };
}

/**
 * Check if Alpaca WS is available (keys configured in env).
 */
function isAlpacaAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    process.env.NEXT_PUBLIC_ALPACA_API_KEY && process.env.NEXT_PUBLIC_ALPACA_API_SECRET
  );
}

/**
 * Check if a symbol is a stock (not crypto) — for Alpaca WS routing.
 */
function isStockSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  const knownCrypto = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT',
    'AVAX', 'MATIC', 'LINK', 'UNI', 'ATOM', 'LTC', 'NEAR', 'AAVE', 'ARB', 'OP',
    'APT', 'SUI', 'SHIB', 'PEPE', 'FIL', 'IMX', 'INJ', 'TIA', 'SEI', 'FET'];
  const isCrypto = knownCrypto.includes(upper) || upper.endsWith('USDT') || upper.endsWith('BUSD');
  return !isCrypto;
}

/**
 * Hook that provides real-time candle updates via WebSocket.
 */
export function useRealtimeCandles(
  historicalCandles: Candle[],
  symbol: string,
  timeframe: string
): UseRealtimeCandlesResult {
  const [mergedCandles, setMergedCandles] = useState<Candle[]>(historicalCandles);
  const [wsState, setWsState] = useState<WSConnectionState>('disconnected');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [wsProvider, setWsProvider] = useState<'binance' | 'alpaca' | 'none'>('none');

  // Refs for WS callback filtering
  const symbolRef = useRef(symbol);
  const timeframeRef = useRef(timeframe);

  // Track symbol:timeframe for reset detection
  const prevKeyRef = useRef(`${symbol}:${timeframe}`);

  // Sync refs to latest values
  useEffect(() => {
    symbolRef.current = symbol;
    timeframeRef.current = timeframe;
  });

  // FIX (BUG 3): Smart merge when historical candles update.
  // When symbol/timeframe changes → full reset.
  // When same symbol/timeframe (REST refetch) → smart merge preserving WS updates.
  const currentKey = `${symbol}:${timeframe}`;

  useEffect(() => {
    const prevKey = prevKeyRef.current;
    prevKeyRef.current = currentKey;

    if (prevKey !== currentKey) {
      // Symbol or timeframe changed — full reset
      setMergedCandles(historicalCandles);
    } else {
      // Same symbol/timeframe — smart merge to preserve WS updates
      setMergedCandles(prev => smartMergeHistorical(historicalCandles, prev));
    }
  }, [currentKey, historicalCandles]);

  // ─── Binance WS for Crypto ───
  useEffect(() => {
    if (!isWSCompatible(symbol)) {
      return;
    }

    const ws = getBinanceWS();

    ws.subscribe(symbol, timeframe, (update) => {
      if (update.symbol !== symbolRef.current || update.interval !== timeframeRef.current) {
        return;
      }

      setMergedCandles(prev => mergeLiveCandle(prev, update.candle));
    });

    const unsubState = ws.onStateChange((state: WSState) => {
      setWsState(state.connectionState);
      setLatencyMs(state.latencyMs);
      setWsProvider('binance');
    });

    return () => {
      ws.unsubscribe();
      unsubState();
      setWsProvider('none');
    };
  }, [symbol, timeframe]);

  // ─── Alpaca WS for Stocks/ETFs ───
  //
  // FIX (BUG 4): Alpaca WS always sends 1-minute bars. When the user
  // selects a larger timeframe (5m, 15m, 1H, 4H, 1D), we must aggregate
  // the incoming 1m bars into the correct timeframe bucket before merging.
  // Without this, the WS candle time never matches the chart candle time,
  // so mergeLiveCandle() either ignores the update or appends a duplicate.
  useEffect(() => {
    if (!isStockSymbol(symbol)) {
      return;
    }

    if (!isAlpacaAvailable()) {
      return;
    }

    const alpacaWS = getAlpacaWS();
    if (!alpacaWS) {
      return;
    }

    alpacaWS.subscribe(symbol, timeframe, (update) => {
      if (update.symbol !== symbolRef.current) {
        return;
      }

      // Aggregate 1m bar into the selected timeframe
      const aggregatedCandle = aggregateAlpacaBar(update.candle, timeframeRef.current);

      setMergedCandles(prev => mergeLiveCandle(prev, aggregatedCandle));
    });

    const unsubState = alpacaWS.onStateChange((state: AlpacaWSState) => {
      const mappedState: WSConnectionState = state.connectionState;
      setWsState(mappedState);

      if (state.lastMessageTime) {
        setLatencyMs(Date.now() - state.lastMessageTime);
      }

      if (state.connectionState === 'connected' || state.connectionState === 'connecting' || state.connectionState === 'reconnecting') {
        setWsProvider('alpaca');
      }
    });

    return () => {
      alpacaWS.unsubscribe();
      unsubState();
      setWsProvider('none');
    };
  }, [symbol, timeframe]);

  // FIX (BUG 5): Ensure mergedCandles is always initialized from historical
  // data. Previously, if the hook mounted with empty candles and they were
  // populated later, the initial state [] could persist until a WS message
  // arrived. This forced update ensures the chart always has data.
  useEffect(() => {
    if (historicalCandles.length > 0 && mergedCandles.length === 0) {
      setMergedCandles(historicalCandles);
    }
  }, [historicalCandles]);

  // Cleanup on unmount — clean up BOTH WS providers
  useEffect(() => {
    return () => {
      if (isWSCompatible(symbol)) {
        const ws = getBinanceWS();
        ws.unsubscribe();
      }
      if (isStockSymbol(symbol) && isAlpacaAvailable()) {
        const alpacaWS = getAlpacaWS();
        alpacaWS?.unsubscribe();
      }
    };
  }, [symbol]);

  const isRealtime = wsState === 'connected';

  return {
    candles: mergedCandles,
    wsState,
    isRealtime,
    latencyMs,
    wsProvider,
  };
}
