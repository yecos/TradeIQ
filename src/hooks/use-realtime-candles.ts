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
 * The hook also tracks WebSocket connection state and provides it
 * for UI indicators.
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
  // Known crypto symbols
  const knownCrypto = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT',
    'AVAX', 'MATIC', 'LINK', 'UNI', 'ATOM', 'LTC', 'NEAR', 'AAVE', 'ARB', 'OP',
    'APT', 'SUI', 'SHIB', 'PEPE', 'FIL', 'IMX', 'INJ', 'TIA', 'SEI', 'FET'];
  const isCrypto = knownCrypto.includes(upper) || upper.endsWith('USDT') || upper.endsWith('BUSD');
  return !isCrypto;
}

/**
 * Hook that provides real-time candle updates via WebSocket.
 *
 * Automatically selects the best WebSocket provider:
 * - Crypto symbols → Binance WS (free, no key needed)
 * - Stock/ETF symbols → Alpaca WS (free, requires API key)
 *
 * @param historicalCandles - Candles from the REST API (historical)
 * @param symbol - The trading symbol (e.g., 'BTC', 'AAPL')
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
  const [wsProvider, setWsProvider] = useState<'binance' | 'alpaca' | 'none'>('none');

  // Refs for WS callback filtering — updated inside effects only
  const symbolRef = useRef(symbol);
  const timeframeRef = useRef(timeframe);

  // Sync refs to latest values (in effect, not during render)
  useEffect(() => {
    symbolRef.current = symbol;
    timeframeRef.current = timeframe;
  });

  // Reset merged candles when historical data identity changes
  const historyKey = `${symbol}:${timeframe}:${historicalCandles.length}:${historicalCandles[0]?.time ?? 0}:${historicalCandles[historicalCandles.length - 1]?.time ?? 0}`;

  useEffect(() => {
    setMergedCandles(historicalCandles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyKey]);

  // ─── Binance WS for Crypto ───
  useEffect(() => {
    if (!isWSCompatible(symbol)) {
      return;
    }

    // If Alpaca is also available but this is crypto, use Binance
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
  useEffect(() => {
    // Only use Alpaca for non-crypto symbols
    if (!isStockSymbol(symbol)) {
      return;
    }

    // Check if Alpaca keys are available
    if (!isAlpacaAvailable()) {
      return;
    }

    const alpacaWS = getAlpacaWS();
    if (!alpacaWS) {
      return;
    }

    // Subscribe to bar updates
    alpacaWS.subscribe(symbol, timeframe, (update) => {
      if (update.symbol !== symbolRef.current) {
        return;
      }

      setMergedCandles(prev => mergeLiveCandle(prev, update.candle));
    });

    // Track connection state via onStateChange callback
    // This is critical — without it, wsState would never update because
    // the bar callback only fires when data arrives (which depends on
    // correct subscription format + successful connection).
    const unsubState = alpacaWS.onStateChange((state: AlpacaWSState) => {
      // Map Alpaca WS state to our shared WSConnectionState type
      const mappedState: WSConnectionState = state.connectionState;
      setWsState(mappedState);

      // Calculate latency from last message time
      if (state.lastMessageTime) {
        setLatencyMs(Date.now() - state.lastMessageTime);
      }

      // Only set provider to 'alpaca' if connected or connecting
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isWSCompatible(symbol)) {
        const ws = getBinanceWS();
        ws.unsubscribe();
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
