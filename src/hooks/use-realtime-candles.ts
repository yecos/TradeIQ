/**
 * useRealtimeCandles — React hook that merges REST historical candles
 * with live WebSocket updates.
 *
 * MetaTrader-like behavior:
 * - Binance WS sends kline updates every 1-2 seconds → smooth candle formation
 * - Alpaca WS sends 1m bars + individual trades → trades update the last candle's
 *   close in real-time between bar updates (tick-by-tick, like MetaTrader)
 * - Updates are batched with requestAnimationFrame for 60fps smooth rendering
 * - Volume aggregation: Binance sends cumulative volume (use max), Alpaca sends
 *   per-bar volume (use additive sum within a timeframe bucket)
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
  /** Current price from the latest WS update */
  currentPrice: number | null;
  /** The last updated candle (for incremental chart update) */
  lastUpdate: { candle: Candle; isAppend: boolean } | null;
}

// ─── rAF-based batching ────────────────────────────────────────────────
// Uses requestAnimationFrame to batch state updates to ~60fps.
// This is the key to making the chart feel like MetaTrader — smooth,
// responsive, and never skipping frames.

function useRafBatchedState<T>(initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initialValue);
  const pendingRef = useRef<T | null>(null);
  const rafRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (pendingRef.current !== null) {
      setValue(pendingRef.current);
      pendingRef.current = null;
    }
    rafRef.current = null;
  }, []);

  const batchedSetValue = useCallback((action: React.SetStateAction<T>) => {
    if (action instanceof Function) {
      // For function updaters, apply to pending value if exists
      // This chains multiple rapid updates correctly
      if (pendingRef.current !== null) {
        pendingRef.current = action(pendingRef.current);
      } else {
        // Compute new value from current — we'll use the latest ref
        // since value might be stale in this closure
        pendingRef.current = action(value);
      }
    } else {
      pendingRef.current = action;
    }

    // Schedule a flush on the next animation frame if not already scheduled
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flush);
    }
  }, [value, flush]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return [value, batchedSetValue];
}

/**
 * Merge a live candle update into the existing candle array.
 *
 * For Alpaca trade updates (source='trade'):
 * - open and volume are 0 — don't overwrite existing open/volume
 * - Only update close, high, low from the trade price
 *
 * For Binance and Alpaca bar updates (source='bar'):
 * - Full OHLCV update
 * - Volume: use Math.max for Binance (cumulative), additive for Alpaca (per-bar)
 */
function mergeLiveCandle(
  historical: Candle[],
  liveCandle: Candle,
  source: 'bar' | 'trade' = 'bar',
  wsProvider: 'binance' | 'alpaca' = 'binance'
): { candles: Candle[]; isAppend: boolean } {
  if (historical.length === 0) {
    if (source === 'trade') {
      // Trade updates without any existing candles — can't create a candle from just a trade
      return { candles: historical, isAppend: false };
    }
    return { candles: [liveCandle], isAppend: true };
  }

  const lastCandle = historical[historical.length - 1];

  // Same period — update the last candle
  if (lastCandle.time === liveCandle.time) {
    const merged = [...historical];

    if (source === 'trade') {
      // Trade update: only update close, high, low — preserve open and volume
      merged[merged.length - 1] = {
        time: liveCandle.time,
        open: lastCandle.open,    // Preserve the bar's open
        high: Math.max(lastCandle.high, liveCandle.high),
        low: Math.min(lastCandle.low, liveCandle.low),
        close: liveCandle.close,  // Update close to trade price
        volume: lastCandle.volume, // Preserve the bar's volume
      };
    } else {
      // Bar update: full OHLCV merge
      const newVolume = wsProvider === 'alpaca'
        ? lastCandle.volume + liveCandle.volume  // Alpaca: additive (per-bar volume)
        : Math.max(lastCandle.volume, liveCandle.volume); // Binance: cumulative

      merged[merged.length - 1] = {
        time: liveCandle.time,
        open: lastCandle.open,    // Keep the original open (first bar in bucket)
        high: Math.max(lastCandle.high, liveCandle.high),
        low: Math.min(lastCandle.low, liveCandle.low),
        close: liveCandle.close,  // Always use latest close
        volume: newVolume,
      };
    }
    return { candles: merged, isAppend: false };
  }

  // New period — append
  if (liveCandle.time > lastCandle.time) {
    if (source === 'trade') {
      // Trade for a new period we don't have yet — create a minimal candle
      return {
        candles: [...historical, {
          time: liveCandle.time,
          open: liveCandle.close, // We don't know the real open, use close as approximation
          high: liveCandle.high,
          low: liveCandle.low,
          close: liveCandle.close,
          volume: 0,
        }],
        isAppend: true
      };
    }
    return { candles: [...historical, liveCandle], isAppend: true };
  }

  // Older than our last candle — ignore
  return { candles: historical, isAppend: false };
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
  if (mergedLast.time === histLast.time) {
    const merged = [...newHistorical];
    merged[merged.length - 1] = {
      time: mergedLast.time,
      open: histLast.open,
      high: Math.max(histLast.high, mergedLast.high),
      low: Math.min(histLast.low, mergedLast.low),
      close: mergedLast.close,
      volume: Math.max(histLast.volume, mergedLast.volume),
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
 */
function aggregateAlpacaBar(candle: Candle, timeframe: string): Candle {
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
 * Designed to work like MetaTrader: tick-by-tick price updates, smooth candle formation.
 */
export function useRealtimeCandles(
  historicalCandles: Candle[],
  symbol: string,
  timeframe: string
): UseRealtimeCandlesResult {
  // Use rAF-batched state for merged candles — updates at 60fps for smooth rendering
  const [mergedCandles, setMergedCandles] = useRafBatchedState<Candle[]>(historicalCandles);
  const [wsState, setWsState] = useState<WSConnectionState>('disconnected');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [wsProvider, setWsProvider] = useState<'binance' | 'alpaca' | 'none'>('none');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<{ candle: Candle; isAppend: boolean } | null>(null);

  // Refs for WS callback filtering
  const symbolRef = useRef(symbol);
  const timeframeRef = useRef(timeframe);
  const wsProviderRef = useRef<'binance' | 'alpaca' | 'none'>('none');

  // Track symbol:timeframe for reset detection
  const prevKeyRef = useRef(`${symbol}:${timeframe}`);

  // Sync refs to latest values
  useEffect(() => {
    symbolRef.current = symbol;
    timeframeRef.current = timeframe;
  });

  // Smart merge when historical candles update
  const currentKey = `${symbol}:${timeframe}`;

  useEffect(() => {
    const prevKey = prevKeyRef.current;
    prevKeyRef.current = currentKey;

    if (prevKey !== currentKey) {
      // Symbol or timeframe changed — full reset
      setMergedCandles(historicalCandles);
      setCurrentPrice(null);
      setLastUpdate(null);
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
    wsProviderRef.current = 'binance';

    ws.subscribe(symbol, timeframe, (update) => {
      if (update.symbol !== symbolRef.current || update.interval !== timeframeRef.current) {
        return;
      }

      const result = mergeLiveCandle(
        // We need the current merged candles for merging
        // Access via the ref pattern to avoid stale closures
        [], // Will be handled by the functional updater
        update.candle,
        'bar',
        'binance'
      );

      // Use functional updater to always get latest state
      setMergedCandles(prev => {
        const mergeResult = mergeLiveCandle(prev, update.candle, 'bar', 'binance');
        setLastUpdate({ candle: mergeResult.candles[mergeResult.candles.length - 1], isAppend: mergeResult.isAppend });
        return mergeResult.candles;
      });
      setCurrentPrice(update.candle.close);
    });

    const unsubState = ws.onStateChange((state: WSState) => {
      setWsState(state.connectionState);
      setLatencyMs(state.latencyMs);
      setWsProvider('binance');
      wsProviderRef.current = 'binance';
    });

    return () => {
      ws.unsubscribe();
      unsubState();
      setWsProvider('none');
      wsProviderRef.current = 'none';
    };
  }, [symbol, timeframe]);

  // ─── Alpaca WS for Stocks/ETFs ───
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

    wsProviderRef.current = 'alpaca';

    alpacaWS.subscribe(symbol, timeframe, (update) => {
      if (update.symbol !== symbolRef.current) {
        return;
      }

      if (update.source === 'trade') {
        // Trade update: tick-by-tick price change
        const aggregatedCandle = aggregateAlpacaBar(update.candle, timeframeRef.current);

        setMergedCandles(prev => {
          const result = mergeLiveCandle(prev, aggregatedCandle, 'trade', 'alpaca');
          setLastUpdate({ candle: result.candles[result.candles.length - 1], isAppend: result.isAppend });
          return result.candles;
        });
        setCurrentPrice(update.candle.close);
      } else {
        // Bar update: full 1m bar with OHLCV
        const aggregatedCandle = aggregateAlpacaBar(update.candle, timeframeRef.current);

        setMergedCandles(prev => {
          const result = mergeLiveCandle(prev, aggregatedCandle, 'bar', 'alpaca');
          setLastUpdate({ candle: result.candles[result.candles.length - 1], isAppend: result.isAppend });
          return result.candles;
        });
        setCurrentPrice(update.candle.close);
      }
    });

    const unsubState = alpacaWS.onStateChange((state: AlpacaWSState) => {
      const mappedState: WSConnectionState = state.connectionState;
      setWsState(mappedState);

      if (state.lastMessageTime) {
        setLatencyMs(Date.now() - state.lastMessageTime);
      }

      if (state.connectionState === 'connected' || state.connectionState === 'connecting' || state.connectionState === 'reconnecting') {
        setWsProvider('alpaca');
        wsProviderRef.current = 'alpaca';
      }
    });

    return () => {
      alpacaWS.unsubscribe();
      unsubState();
      setWsProvider('none');
      wsProviderRef.current = 'none';
    };
  }, [symbol, timeframe]);

  // Ensure mergedCandles is always initialized from historical data
  useEffect(() => {
    if (historicalCandles.length > 0 && mergedCandles.length === 0) {
      setMergedCandles(historicalCandles);
    }
  }, [historicalCandles]);

  // Cleanup on unmount — clean up BOTH WS providers
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isWSCompatible(symbol)) {
        const ws = getBinanceWS();
        ws.unsubscribe();
      }
      if (isStockSymbol(symbol) && isAlpacaAvailable()) {
        const alpacaWS = getAlpacaWS();
        alpacaWS?.unsubscribe();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
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
    currentPrice,
    lastUpdate,
  };
}
