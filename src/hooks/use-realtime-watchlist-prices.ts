/**
 * useRealtimeWatchlistPrices — Hook that provides real-time price updates
 * for ALL symbols in the watchlist simultaneously.
 *
 * Data sources (priority order):
 * 1. Binance Mini-Ticker WS — ALL crypto pairs, updates every ~1s, no API key needed
 * 2. Finnhub WS — Stocks/forex, requires FINNHUB_API_KEY, supports multi-symbol
 * 3. TwelveData WS — Stocks/forex/indices fallback, requires TWELVEDATA_KEY
 *
 * The hook merges WS real-time prices with REST quote data (which provides
 * name, change, changePercent) to create a complete quote with live prices.
 *
 * Architecture:
 * - Uses refs for WS callbacks (prevents stale closures)
 * - Batches state updates with requestAnimationFrame for smooth 60fps UI
 * - Falls back gracefully: if no WS available, returns REST-only quotes
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getBinanceTickerWS, type BinanceMiniTicker } from '@/lib/data/binance-ticker-ws';
import { getFinnhubWS, type FinnhubTradeUpdate } from '@/lib/data/finnhub-ws';
import { getTwelveDataWS, type TwelveDataPriceUpdate } from '@/lib/data/twelvedata-ws';
import type { Quote } from '@/lib/types';

// ─── Types ───────────────────────────────────────────────────────────

export interface RealtimeQuote extends Omit<Quote, 'prevClose'> {
  /** Whether this price is from a live WebSocket */
  isRealtime: boolean;
  /** Last time the price was updated (epoch ms) */
  lastUpdated: number | null;
  /** Which WS provider is feeding this symbol */
  wsProvider: 'binance' | 'finnhub' | 'twelvedata' | 'none';
  /** Previous close price (from REST data) */
  prevClose?: number;
}

export interface RealtimePricesState {
  /** Map of symbol → real-time quote */
  quotes: Map<string, RealtimeQuote>;
  /** Whether at least one WS is connected */
  isLive: boolean;
  /** Number of symbols receiving live updates */
  liveCount: number;
  /** Connected WS providers */
  providers: ('binance' | 'finnhub' | 'twelvedata')[];
}

// ─── Helpers ─────────────────────────────────────────────────────────

const CRYPTO_SYMBOLS = new Set([
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT',
  'AVAX', 'MATIC', 'LINK', 'UNI', 'ATOM', 'LTC', 'NEAR', 'AAVE', 'ARB', 'OP',
  'APT', 'SUI', 'SHIB', 'PEPE', 'FIL', 'IMX', 'INJ', 'TIA', 'SEI', 'FET',
]);

function isCrypto(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  return CRYPTO_SYMBOLS.has(upper) || upper.endsWith('USDT') || upper.endsWith('BUSD');
}

/**
 * Convert Binance symbol format (BTCUSDT) to our format (BTC).
 */
function fromBinanceSymbol(bs: string): string {
  if (bs.endsWith('USDT')) return bs.slice(0, -4);
  if (bs.endsWith('BUSD')) return bs.slice(0, -4);
  return bs;
}

// ─── Hook ────────────────────────────────────────────────────────────

export function useRealtimeWatchlistPrices(
  baseQuotes: Quote[],
  watchlist: string[],
): RealtimePricesState {
  // Real-time price overrides from WebSocket
  const [prices, setPrices] = useState<Map<string, RealtimeQuote>>(new Map());
  const [isLive, setIsLive] = useState(false);
  const [liveCount, setLiveCount] = useState(0);
  const [providers, setProviders] = useState<('binance' | 'finnhub' | 'twelvedata')[]>([]);

  // Refs for mutable state (avoid stale closures in WS callbacks)
  const pricesRef = useRef<Map<string, RealtimeQuote>>(new Map());
  const baseQuotesRef = useRef<Map<string, Quote>>(new Map());
  const watchlistRef = useRef(watchlist);
  const rafRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);

  // Provider state refs
  const binanceConnectedRef = useRef(false);
  const finnhubConnectedRef = useRef(false);
  const twelvedataConnectedRef = useRef(false);

  // Sync refs
  watchlistRef.current = watchlist;

  // Build base quotes map
  useEffect(() => {
    const map = new Map<string, Quote>();
    for (const q of baseQuotes) {
      map.set(q.symbol.toUpperCase(), q);
    }
    baseQuotesRef.current = map;
  }, [baseQuotes]);

  // ─── rAF-batched state update ────────────────────────────────────
  const scheduleStateUpdate = useCallback(() => {
    if (dirtyRef.current && rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        setPrices(new Map(pricesRef.current));

        // Count live symbols
        let live = 0;
        for (const [, q] of pricesRef.current) {
          if (q.isRealtime) live++;
        }
        setLiveCount(live);

        // Determine providers
        const activeProviders: ('binance' | 'finnhub' | 'twelvedata')[] = [];
        if (binanceConnectedRef.current) activeProviders.push('binance');
        if (finnhubConnectedRef.current) activeProviders.push('finnhub');
        if (twelvedataConnectedRef.current) activeProviders.push('twelvedata');
        setProviders(activeProviders);
        setIsLive(activeProviders.length > 0);

        dirtyRef.current = false;
        rafRef.current = null;
      });
    }
  }, []);

  // Update a single symbol's price
  const updatePrice = useCallback((
    symbol: string,
    price: number,
    provider: 'binance' | 'finnhub' | 'twelvedata',
    extra?: { open?: number; high?: number; low?: number; volume?: number; change?: number; changePercent?: number },
  ) => {
    const upper = symbol.toUpperCase();
    const existing = pricesRef.current.get(upper);
    const base = baseQuotesRef.current.get(upper);

    const now = Date.now();

    // Compute change from day open if available
    let change = extra?.change ?? existing?.change ?? base?.change ?? 0;
    let changePercent = extra?.changePercent ?? existing?.changePercent ?? base?.changePercent ?? 0;

    // If we have day open price from WS, compute our own change
    if (extra?.open && extra.open > 0) {
      change = price - extra.open;
      changePercent = (change / extra.open) * 100;
    }

    const quote: RealtimeQuote = {
      symbol: upper,
      name: base?.name ?? existing?.name ?? upper,
      price,
      change,
      changePercent,
      open: extra?.open ?? base?.open ?? existing?.open ?? price,
      high: extra?.high ?? base?.high ?? existing?.high ?? price,
      low: extra?.low ?? base?.low ?? existing?.low ?? price,
      volume: extra?.volume ?? base?.volume ?? existing?.volume ?? 0,
      isRealtime: true,
      lastUpdated: now,
      wsProvider: provider,
    };

    pricesRef.current.set(upper, quote);
    dirtyRef.current = true;
    scheduleStateUpdate();
  }, [scheduleStateUpdate]);

  // ─── Binance Mini-Ticker WS for Crypto ───────────────────────────
  useEffect(() => {
    // Only connect if we have crypto symbols in watchlist
    const hasCrypto = watchlist.some(s => isCrypto(s));
    if (!hasCrypto) return;

    const ws = getBinanceTickerWS();

    const handleTickers = (tickers: BinanceMiniTicker[]) => {
      // Build a map of our watchlist symbols → Binance symbol format
      const watchlistUpper = new Set(watchlistRef.current.map(s => s.toUpperCase()));

      for (const ticker of tickers) {
        const symbol = fromBinanceSymbol(ticker.symbol);
        if (!watchlistUpper.has(symbol)) continue;

        updatePrice(symbol, ticker.close, 'binance', {
          open: ticker.open,
          high: ticker.high,
          low: ticker.low,
          volume: ticker.quoteVolume,
        });
      }
    };

    ws.subscribe(handleTickers);

    const unsubState = ws.onStateChange((state) => {
      binanceConnectedRef.current = state.connectionState === 'connected';
      dirtyRef.current = true;
      scheduleStateUpdate();
    });

    return () => {
      ws.unsubscribe();
      unsubState();
      binanceConnectedRef.current = false;
    };
  }, [watchlist, updatePrice, scheduleStateUpdate]);

  // ─── Finnhub WS for Stocks ───────────────────────────────────────
  useEffect(() => {
    const stockSymbols = watchlist.filter(s => !isCrypto(s));
    if (stockSymbols.length === 0) return;

    const finnhubWS = getFinnhubWS();
    if (!finnhubWS) return;

    const handleTrade = (update: FinnhubTradeUpdate) => {
      updatePrice(update.symbol, update.price, 'finnhub', {
        open: update.candle.open,
        high: update.candle.high,
        low: update.candle.low,
        volume: update.candle.volume,
      });
    };

    // Use multi-symbol subscribe
    finnhubWS.subscribeMulti(stockSymbols, handleTrade);

    const unsubState = finnhubWS.onStateChange((state) => {
      finnhubConnectedRef.current = state.connectionState === 'connected';
      dirtyRef.current = true;
      scheduleStateUpdate();
    });

    return () => {
      finnhubWS.unsubscribe();
      unsubState();
      finnhubConnectedRef.current = false;
    };
  }, [watchlist, updatePrice, scheduleStateUpdate]);

  // ─── TwelveData WS for Stocks (fallback when Finnhub unavailable) ──
  useEffect(() => {
    const stockSymbols = watchlist.filter(s => !isCrypto(s));
    if (stockSymbols.length === 0) return;

    // Skip if Finnhub is available (prefer Finnhub over TwelveData)
    if (getFinnhubWS()) return;

    const tdWS = getTwelveDataWS();
    if (!tdWS) return;

    const handlePrice = (update: TwelveDataPriceUpdate) => {
      updatePrice(update.symbol, update.price, 'twelvedata', {
        open: update.candle.open,
        high: update.candle.high,
        low: update.candle.low,
        volume: update.candle.volume,
      });
    };

    // Subscribe to each stock symbol
    for (const symbol of stockSymbols) {
      tdWS.subscribe(symbol, handlePrice);
    }

    const unsubState = tdWS.onStateChange((state) => {
      const connState = state.connectionState === 'error' ? 'disconnected' : state.connectionState;
      twelvedataConnectedRef.current = connState === 'connected';
      dirtyRef.current = true;
      scheduleStateUpdate();
    });

    return () => {
      tdWS.unsubscribe();
      unsubState();
      twelvedataConnectedRef.current = false;
    };
  }, [watchlist, updatePrice, scheduleStateUpdate]);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // ─── Merge base quotes with real-time prices ──────────────────────
  // When a symbol has no WS data yet, we use the REST quote
  const mergedQuotes = useRef<Map<string, RealtimeQuote>>(new Map());

  useEffect(() => {
    const merged = new Map<string, RealtimeQuote>();

    // Start with base quotes (REST data)
    for (const q of baseQuotes) {
      const upper = q.symbol.toUpperCase();
      const existing = prices.get(upper);

      if (existing && existing.isRealtime) {
        // Prefer real-time data but keep REST name if available
        merged.set(upper, {
          ...existing,
          name: q.name || existing.name,
        });
      } else {
        // Use REST data with isRealtime: false
        merged.set(upper, {
          ...q,
          isRealtime: false,
          lastUpdated: null,
          wsProvider: 'none',
        });
      }
    }

    // Add any real-time prices not in base quotes yet
    for (const [symbol, quote] of prices) {
      if (!merged.has(symbol)) {
        merged.set(symbol, quote);
      }
    }

    mergedQuotes.current = merged;
  }, [prices, baseQuotes]);

  return {
    quotes: mergedQuotes.current,
    isLive,
    liveCount,
    providers,
  };
}
