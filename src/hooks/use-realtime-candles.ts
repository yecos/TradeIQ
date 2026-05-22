/**
 * useRealtimeCandles — React hook that merges REST historical candles
 * with live WebSocket updates.
 *
 * MetaTrader-like behavior:
 * - Binance WS sends kline updates every 1-2 seconds → smooth candle formation
 * - Alpaca WS sends 1m bars + individual trades → tick-by-tick close updates
 * - Updates are batched with requestAnimationFrame for 60fps smooth rendering
 * - Volume aggregation: Binance cumulative (max), Alpaca per-bar (additive)
 *
 * Architecture:
 * - Uses refs for all mutable state to avoid stale closure issues
 * - Uses requestAnimationFrame to batch state updates to ~60fps
 * - WS callbacks update refs immediately (zero latency) and schedule rAF for React
 * - Guards prevent re-subscribing when already connected to same symbol
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getBinanceWS, isWSCompatible } from '@/lib/data/binance-ws';
import { getAlpacaWS } from '@/lib/data/alpaca-ws';
import { getFinnhubWS, getFinnhubWSAsync } from '@/lib/data/finnhub-ws';
import { getTwelveDataWS } from '@/lib/data/twelvedata-ws';
import type { Candle } from '@/lib/types';
import type { WSConnectionState, WSState } from '@/lib/data/binance-ws';
import type { AlpacaWSState } from '@/lib/data/alpaca-ws';

interface UseRealtimeCandlesResult {
  candles: Candle[];
  wsState: WSConnectionState;
  isRealtime: boolean;
  latencyMs: number | null;
  wsProvider: 'binance' | 'alpaca' | 'finnhub' | 'twelvedata' | 'none';
  currentPrice: number | null;
  /** True when WS price doesn't match historical candles — triggers a re-fetch */
  priceMismatch: boolean;
}

/**
 * Merge a live candle update into the existing candle array.
 * Returns the merged array and whether a new candle was appended.
 */
function mergeLiveCandle(
  historical: Candle[],
  liveCandle: Candle,
  source: 'bar' | 'trade' = 'bar',
  wsProvider: 'binance' | 'alpaca' = 'binance'
): { candles: Candle[]; isAppend: boolean } {
  if (historical.length === 0) {
    if (source === 'trade') {
      return { candles: historical, isAppend: false };
    }
    return { candles: [liveCandle], isAppend: true };
  }

  const lastCandle = historical[historical.length - 1];

  // Same period — update the last candle in place
  if (lastCandle.time === liveCandle.time) {
    const merged = historical.slice(); // Shallow copy (same candle refs except last)
    const lastIdx = merged.length - 1;

    if (source === 'trade') {
      merged[lastIdx] = {
        time: liveCandle.time,
        open: lastCandle.open,
        high: Math.max(lastCandle.high, liveCandle.high),
        low: Math.min(lastCandle.low, liveCandle.low),
        close: liveCandle.close,
        volume: lastCandle.volume,
      };
    } else {
      const newVolume = wsProvider === 'alpaca'
        ? lastCandle.volume + liveCandle.volume
        : Math.max(lastCandle.volume, liveCandle.volume);

      merged[lastIdx] = {
        time: liveCandle.time,
        open: lastCandle.open,
        high: Math.max(lastCandle.high, liveCandle.high),
        low: Math.min(lastCandle.low, liveCandle.low),
        close: liveCandle.close,
        volume: newVolume,
      };
    }
    return { candles: merged, isAppend: false };
  }

  // New period — append
  if (liveCandle.time > lastCandle.time) {
    if (source === 'trade') {
      return {
        candles: [...historical, {
          time: liveCandle.time,
          open: liveCandle.close,
          high: liveCandle.high,
          low: liveCandle.low,
          close: liveCandle.close,
          volume: 0,
        }],
        isAppend: true,
      };
    }
    return { candles: [...historical, liveCandle], isAppend: true };
  }

  // Older than our last candle — ignore
  return { candles: historical, isAppend: false };
}

/**
 * Smart merge: combine new historical candles with existing WS-merged state.
 * Preserves WS updates to the latest candle while incorporating new closed candles.
 */
function smartMergeHistorical(newHistorical: Candle[], currentMerged: Candle[]): Candle[] {
  if (currentMerged.length === 0) return newHistorical;
  if (newHistorical.length === 0) return currentMerged;

  const mergedLast = currentMerged[currentMerged.length - 1];
  const histLast = newHistorical[newHistorical.length - 1];

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

  if (mergedLast.time > histLast.time) {
    return [...newHistorical, mergedLast];
  }

  return newHistorical;
}

/**
 * Aggregate an Alpaca 1-minute bar into the selected timeframe bucket.
 */
function aggregateAlpacaBar(candle: Candle, timeframe: string): Candle {
  if (timeframe === '1m' || !timeframe) return candle;

  const tfSeconds: Record<string, number> = {
    '5m': 300, '15m': 900, '1H': 3600, '4H': 14400, '1D': 86400, '1W': 604800,
  };

  const bucketSeconds = tfSeconds[timeframe];
  if (!bucketSeconds) return candle;

  const bucketStart = Math.floor(candle.time / bucketSeconds) * bucketSeconds;
  return { ...candle, time: bucketStart };
}

function isAlpacaAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(process.env.NEXT_PUBLIC_ALPACA_API_KEY && process.env.NEXT_PUBLIC_ALPACA_API_SECRET);
}

function isStockSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  const knownCrypto = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT',
    'AVAX', 'MATIC', 'LINK', 'UNI', 'ATOM', 'LTC', 'NEAR', 'AAVE', 'ARB', 'OP',
    'APT', 'SUI', 'SHIB', 'PEPE', 'FIL', 'IMX', 'INJ', 'TIA', 'SEI', 'FET'];
  return !(knownCrypto.includes(upper) || upper.endsWith('USDT') || upper.endsWith('BUSD'));
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
  // ─── State ───────────────────────────────────────────────────────
  const [mergedCandles, setMergedCandles] = useState<Candle[]>(historicalCandles);
  const [wsState, setWsState] = useState<WSConnectionState>('disconnected');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [wsProvider, setWsProvider] = useState<'binance' | 'alpaca' | 'finnhub' | 'twelvedata' | 'none'>('none');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceMismatch, setPriceMismatch] = useState(false);

  // ─── Refs for mutable state (avoid stale closures in WS callbacks) ───
  const candlesRef = useRef<Candle[]>(historicalCandles);
  const symbolRef = useRef(symbol);
  const timeframeRef = useRef(timeframe);
  const wsProviderRef = useRef<'binance' | 'alpaca' | 'finnhub' | 'twelvedata' | 'none'>('none');

  // rAF batching
  const rafRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);

  // Track current subscription to prevent re-subscribing to same symbol
  const subscribedSymbolRef = useRef<string | null>(null);
  const subscribedTimeframeRef = useRef<string | null>(null);

  // Track key for reset detection
  const prevKeyRef = useRef(`${symbol}:${timeframe}`);

  // Track if we've already checked for price mismatch on this symbol
  const mismatchCheckedRef = useRef(false);

  // ─── rAF-batched state update ────────────────────────────────────
  // Batches React state updates to 60fps using requestAnimationFrame.
  // WS callbacks update the ref immediately (zero latency for merge logic)
  // and schedule a visual update on the next animation frame.
  const scheduleStateUpdate = useCallback(() => {
    if (dirtyRef.current && rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        setMergedCandles(candlesRef.current);
        dirtyRef.current = false;
        rafRef.current = null;
      });
    }
  }, []);

  // Update candles (called from WS callbacks) — immediate ref update + rAF visual
  const updateCandles = useCallback((newCandles: Candle[]) => {
    candlesRef.current = newCandles;
    dirtyRef.current = true;
    scheduleStateUpdate();
  }, [scheduleStateUpdate]);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Sync refs
  useEffect(() => {
    symbolRef.current = symbol;
    timeframeRef.current = timeframe;
  });

  // ─── Smart merge when historical candles update ──────────────────
  const currentKey = `${symbol}:${timeframe}`;

  useEffect(() => {
    const prevKey = prevKeyRef.current;
    prevKeyRef.current = currentKey;

    if (prevKey !== currentKey) {
      // Symbol or timeframe changed — full reset
      candlesRef.current = historicalCandles;
      setMergedCandles(historicalCandles);
      setCurrentPrice(null);
      setPriceMismatch(false);
      mismatchCheckedRef.current = false;
      dirtyRef.current = false;
    } else {
      // Same symbol/timeframe — smart merge to preserve WS updates
      const merged = smartMergeHistorical(historicalCandles, candlesRef.current);
      candlesRef.current = merged;
      setMergedCandles(merged);
    }
  }, [currentKey, historicalCandles]);

  // ─── Price Mismatch Detection ────────────────────────────────────
  // When the first WS message arrives, compare the real price with the
  // last historical candle's close. If they differ by >5%, the historical
  // data is likely from mock (fake) and needs to be re-fetched.
  const checkPriceMismatch = useCallback((wsPrice: number) => {
    if (mismatchCheckedRef.current) return;
    mismatchCheckedRef.current = true;

    const candles = candlesRef.current;
    if (candles.length === 0) return;

    const lastClose = candles[candles.length - 1].close;
    const diffPercent = Math.abs(wsPrice - lastClose) / lastClose;

    if (diffPercent > 0.05) { // >5% difference → likely mock data
      console.warn(
        `[TradeIQ] Price mismatch detected! WS=$${wsPrice.toFixed(2)} vs candle=$${lastClose.toFixed(2)} (${(diffPercent * 100).toFixed(1)}% diff). Historical candles are likely fake.`
      );
      setPriceMismatch(true);
    } else {
      setPriceMismatch(false);
    }
  }, []);

  // ─── Binance WS for Crypto ───────────────────────────────────────
  useEffect(() => {
    if (!isWSCompatible(symbol)) return;

    const ws = getBinanceWS();
    wsProviderRef.current = 'binance';
    subscribedSymbolRef.current = symbol;
    subscribedTimeframeRef.current = timeframe;

    ws.subscribe(symbol, timeframe, (update) => {
      if (update.symbol !== symbolRef.current || update.interval !== timeframeRef.current) {
        return;
      }

      // Check for price mismatch on first WS message
      checkPriceMismatch(update.candle.close);

      const result = mergeLiveCandle(candlesRef.current, update.candle, 'bar', 'binance');
      updateCandles(result.candles);
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
      subscribedSymbolRef.current = null;
      subscribedTimeframeRef.current = null;
    };
  }, [symbol, timeframe, updateCandles]);

  // ─── Alpaca WS for Stocks/ETFs ───────────────────────────────────
  useEffect(() => {
    if (!isStockSymbol(symbol)) return;
    if (!isAlpacaAvailable()) return;

    const alpacaWS = getAlpacaWS();
    if (!alpacaWS) return;

    // GUARD: Don't re-subscribe if already connected to the same symbol+timeframe
    if (subscribedSymbolRef.current === symbol && subscribedTimeframeRef.current === timeframe) {
      const state = alpacaWS.getState();
      if (state.connectionState === 'connected') {
        setWsState('connected');
        setWsProvider('alpaca');
        wsProviderRef.current = 'alpaca';
      }
      return;
    }

    wsProviderRef.current = 'alpaca';
    subscribedSymbolRef.current = symbol;
    subscribedTimeframeRef.current = timeframe;

    alpacaWS.subscribe(symbol, timeframe, (update) => {
      if (update.symbol !== symbolRef.current) return;

      const aggregatedCandle = aggregateAlpacaBar(update.candle, timeframeRef.current);
      const source = update.source === 'trade' ? 'trade' : 'bar';
      const result = mergeLiveCandle(candlesRef.current, aggregatedCandle, source, 'alpaca');
      updateCandles(result.candles);
      setCurrentPrice(update.candle.close);
    });

    const unsubState = alpacaWS.onStateChange((state: AlpacaWSState) => {
      setWsState(state.connectionState);
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
      subscribedSymbolRef.current = null;
      subscribedTimeframeRef.current = null;
    };
  }, [symbol, timeframe, updateCandles]);

  // ─── Finnhub WS for Stocks/Forex (fallback when Alpaca unavailable) ───
  useEffect(() => {
    if (!isStockSymbol(symbol)) return;
    // Skip if Alpaca WS is already connected (prefer Alpaca over Finnhub)
    if (isAlpacaAvailable() && wsProviderRef.current === 'alpaca') return;

    // Use async key resolution: tries NEXT_PUBLIC_FINNHUB_KEY first,
    // then fetches from /api/finnhub/key (server-side env passthrough)
    let cancelled = false;

    async function initFinnhubWS() {
      const finnhubWS = await getFinnhubWSAsync();
      if (!finnhubWS || cancelled) return;

      // GUARD: Don't re-subscribe if already connected
      if (subscribedSymbolRef.current === symbol && subscribedTimeframeRef.current === timeframe) {
        return;
      }

      wsProviderRef.current = 'finnhub';
      subscribedSymbolRef.current = symbol;
      subscribedTimeframeRef.current = timeframe;

      finnhubWS.subscribe(symbol, (update) => {
        if (update.symbol !== symbolRef.current) return;

        // Check for price mismatch on first WS message
        checkPriceMismatch(update.price);

        const aggregatedCandle = aggregateAlpacaBar(update.candle, timeframeRef.current);
        const result = mergeLiveCandle(candlesRef.current, aggregatedCandle, 'trade', 'alpaca');
        updateCandles(result.candles);
        setCurrentPrice(update.price);
      });

      const unsubState = finnhubWS.onStateChange((state) => {
        // Map Finnhub WS states to WSConnectionState
        const connState = state.connectionState === 'error' ? 'disconnected' : state.connectionState;
        setWsState(connState as WSConnectionState);
        if (state.lastMessageTime) {
          setLatencyMs(Date.now() - state.lastMessageTime);
        }
        if (state.connectionState === 'connected' || state.connectionState === 'connecting' || state.connectionState === 'reconnecting') {
          setWsProvider('finnhub');
          wsProviderRef.current = 'finnhub';
        }
      });

      // Store cleanup for this specific subscription
      return { finnhubWS, unsubState };
    }

    let cleanup: { finnhubWS: any; unsubState: () => void } | undefined;

    initFinnhubWS().then((result) => {
      cleanup = result;
    });

    return () => {
      cancelled = true;
      if (cleanup) {
        cleanup.finnhubWS.unsubscribe();
        cleanup.unsubState();
      }
      setWsProvider('none');
      wsProviderRef.current = 'none';
      subscribedSymbolRef.current = null;
      subscribedTimeframeRef.current = null;
    };
  }, [symbol, timeframe, updateCandles]);

  // ─── Twelve Data WS for Stocks/Forex/Indices (fallback when others unavailable) ───
  useEffect(() => {
    if (!isStockSymbol(symbol)) return;
    // Skip if Alpaca or Finnhub WS is already connected
    if (wsProviderRef.current === 'alpaca' || wsProviderRef.current === 'finnhub') return;

    const tdWS = getTwelveDataWS();
    if (!tdWS) return;

    // GUARD: Don't re-subscribe if already connected
    if (subscribedSymbolRef.current === symbol && subscribedTimeframeRef.current === timeframe) {
      return;
    }

    wsProviderRef.current = 'twelvedata';
    subscribedSymbolRef.current = symbol;
    subscribedTimeframeRef.current = timeframe;

    tdWS.subscribe(symbol, (update) => {
      if (update.symbol !== symbolRef.current) return;

      // Check for price mismatch on first WS message
      checkPriceMismatch(update.price);

      const aggregatedCandle = aggregateAlpacaBar(update.candle, timeframeRef.current);
      const result = mergeLiveCandle(candlesRef.current, aggregatedCandle, 'trade', 'alpaca');
      updateCandles(result.candles);
      setCurrentPrice(update.price);
    });

    const unsubState = tdWS.onStateChange((state) => {
      // Map Twelve Data WS states to WSConnectionState
      const connState = state.connectionState === 'error' ? 'disconnected' : state.connectionState;
      setWsState(connState as WSConnectionState);
      if (state.lastMessageTime) {
        setLatencyMs(Date.now() - state.lastMessageTime);
      }
      if (state.connectionState === 'connected' || state.connectionState === 'connecting' || state.connectionState === 'reconnecting') {
        setWsProvider('twelvedata');
        wsProviderRef.current = 'twelvedata';
      }
    });

    return () => {
      tdWS.unsubscribe();
      unsubState();
      setWsProvider('none');
      wsProviderRef.current = 'none';
      subscribedSymbolRef.current = null;
      subscribedTimeframeRef.current = null;
    };
  }, [symbol, timeframe, updateCandles]);

  // Ensure mergedCandles is always initialized from historical data
  useEffect(() => {
    if (historicalCandles.length > 0 && candlesRef.current.length === 0) {
      candlesRef.current = historicalCandles;
      setMergedCandles(historicalCandles);
    }
  }, [historicalCandles]);

  // Cleanup on unmount
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isWSCompatible(symbol)) getBinanceWS().unsubscribe();
      if (isStockSymbol(symbol)) {
        if (isAlpacaAvailable()) getAlpacaWS()?.unsubscribe();
        getFinnhubWS()?.unsubscribe();
        getTwelveDataWS()?.unsubscribe();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (isWSCompatible(symbol)) getBinanceWS().unsubscribe();
      if (isStockSymbol(symbol)) {
        if (isAlpacaAvailable()) getAlpacaWS()?.unsubscribe();
        getFinnhubWS()?.unsubscribe();
        getTwelveDataWS()?.unsubscribe();
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
    priceMismatch,
  };
}
