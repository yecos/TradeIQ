/**
 * Alpaca Market Data Provider — using the official @alpacahq/alpaca-trade-api SDK.
 *
 * Why use the Alpaca SDK for stock data?
 * - Official SDK: type-safe, maintained, handles auth and rate limits
 * - FREE IEX feed: real-time bars, trades, quotes for US stocks
 * - Historical bars: any timeframe (1m, 5m, 15m, 1H, 4H, 1D)
 * - Crypto data: FREE (no API key needed for crypto historical bars!)
 * - Snapshot endpoint: latest trade + quote + daily bar in one call
 * - Works from US/Vercel deployments
 *
 * Free tier limits:
 * - IEX feed: ~2.5% of US equity volume (full SIP at $99/mo)
 * - Rate limit: 200 requests/min for data API
 * - Unlimited WebSocket connections
 *
 * This provider is used SERVER-SIDE only (API routes, server components).
 * For client-side real-time streaming, see alpaca-ws.ts (raw WebSocket).
 *
 * SDK docs: https://docs.alpaca.markets/docs/about-market-data-api
 * npm: https://www.npmjs.com/package/@alpacahq/alpaca-trade-api
 */

import type { Candle, Quote } from '../types';
import type { MarketDataProvider, SymbolInfo, DataCache } from './market-data-interface';

// Alpaca timeframe mapping: our format → SDK format
const ALPACA_TIMEFRAMES: Record<string, string> = {
  '1m': '1Min',
  '5m': '5Min',
  '15m': '15Min',
  '1H': '1Hour',
  '4H': '4Hour',
  '1D': '1Day',
  '1W': '1Week',
};

/**
 * Convert our interval format to milliseconds.
 */
function intervalToMs(interval: string): number {
  const map: Record<string, number> = {
    '1m': 60_000,
    '5m': 300_000,
    '15m': 900_000,
    '1H': 3_600_000,
    '4H': 14_400_000,
    '1D': 86_400_000,
    '1W': 604_800_000,
  };
  return map[interval] || 86_400_000;
}

/**
 * Estimate the number of candles that fit in `days` for a given interval.
 * FIX: Previously `days` was used as `limit`, so 1m × 1 day = 1 candle (WRONG).
 */
function estimateCandleCount(days: number, interval: string): number {
  const intervalMs = intervalToMs(interval);
  const totalMs = days * 86_400_000;
  const count = Math.ceil(totalMs / intervalMs);
  return Math.max(count, 1);
}

/**
 * AlpacaProvider — server-side market data via the official SDK.
 *
 * Uses the Alpaca Market Data API for:
 * - Historical stock/ETF bars (all timeframes)
 * - Latest stock quotes (snapshot endpoint)
 * - Symbol search (assets endpoint)
 *
 * Crypto data is also available without API keys, but we already have
 * CoinGecko + Binance for crypto, so this provider focuses on stocks.
 */
export class AlpacaProvider implements MarketDataProvider {
  readonly name = 'alpaca';
  private apiKey: string;
  private apiSecret: string;
  private isPaper: boolean;
  private cache: DataCache;
  private dataBaseUrl = 'https://data.alpaca.markets';
  private baseUrl: string;

  // Track last request time for rate limiting (200 req/min = ~3.3/sec)
  private lastRequestTime = 0;
  private minRequestInterval = 350; // ms between requests (~170/min to be safe)

  constructor(apiKey: string, apiSecret: string, cache: DataCache, isPaper: boolean = true) {
    if (!apiKey || !apiSecret) throw new Error('Alpaca API key and secret are required');

    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.isPaper = isPaper;
    this.cache = cache;
    this.baseUrl = isPaper
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';
  }

  // ─── Core MarketDataProvider interface ────────────────────────────

  async getCandles(symbol: string, days: number = 180, interval: string = '1D'): Promise<Candle[]> {
    const cacheKey = `alpaca:candles:${symbol}:${interval}:${days}`;
    const cached = this.cache.get<Candle[]>(cacheKey);
    if (cached) return cached;

    await this.rateLimit();

    const alpacaTimeframe = ALPACA_TIMEFRAMES[interval] || '1Day';
    const now = new Date();
    const start = new Date(now.getTime() - days * 86400_000);

    // FIX: Convert days + interval to proper candle count.
    // Previously `days` was used as `limit`, so 1m × 1 day = 1 candle (WRONG).
    const candleLimit = Math.min(estimateCandleCount(days, interval), 10000);

    // Use the Alpaca Market Data REST API directly
    // GET /v2/stocks/{symbol}/bars
    const url = `${this.dataBaseUrl}/v2/stocks/${encodeURIComponent(symbol.toUpperCase())}/bars` +
      `?timeframe=${alpacaTimeframe}` +
      `&start=${start.toISOString()}` +
      `&end=${now.toISOString()}` +
      `&limit=${candleLimit}` +
      `&adjustment=split`;

    const data = await this.fetchFromAlpaca<AlpacaBarsResponse>(url);

    if (!data.bars || data.bars.length === 0) {
      throw new Error(`ALPACA_NO_DATA: No candle data for ${symbol}`);
    }

    const candles: Candle[] = data.bars.map(bar => ({
      time: Math.floor(new Date(bar.t).getTime() / 1000),
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
    }));

    // Cache: 30s for intraday, 5min for daily+
    const ttl = ['1D', '1W'].includes(interval) ? 300_000 : 30_000;
    this.cache.set(cacheKey, candles, ttl);

    return candles;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const cacheKey = `alpaca:quote:${symbol}`;
    const cached = this.cache.get<Quote>(cacheKey);
    if (cached) return cached;

    await this.rateLimit();

    // Use snapshot endpoint — returns latest trade, quote, and daily bar
    // GET /v2/stocks/{symbol}/snapshot
    const url = `${this.dataBaseUrl}/v2/stocks/${encodeURIComponent(symbol.toUpperCase())}/snapshot`;

    const data = await this.fetchFromAlpaca<AlpacaSnapshotResponse>(url);

    if (!data.latestTrade || !data.latestTrade.p) {
      throw new Error(`ALPACA_NO_QUOTE: No quote data for ${symbol}`);
    }

    const price = data.latestTrade.p;
    const dailyBar = data.dailyBar;
    const prevDailyBar = data.prevDailyBar;
    const prevClose = prevDailyBar?.c || dailyBar?.o || price;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    const quote: Quote = {
      symbol: symbol.toUpperCase(),
      name: symbol.toUpperCase(),
      price,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      volume: dailyBar?.v || 0,
      high: dailyBar?.h || price,
      low: dailyBar?.l || price,
      open: dailyBar?.o || price,
      prevClose,
    };

    // Cache quotes for 10 seconds
    this.cache.set(cacheKey, quote, 10_000);

    return quote;
  }

  async getMultipleQuotes(symbols: string[]): Promise<Quote[]> {
    // Try batch snapshot endpoint first (more efficient)
    // GET /v2/stocks/snapshots?symbols=AAPL,MSFT,...
    const cacheKey = `alpaca:snapshots:${symbols.sort().join(',')}`;
    const cached = this.cache.get<Quote[]>(cacheKey);
    if (cached) return cached;

    await this.rateLimit();

    const symbolsParam = symbols.map(s => s.toUpperCase()).join(',');
    const url = `${this.dataBaseUrl}/v2/stocks/snapshots?symbols=${encodeURIComponent(symbolsParam)}`;

    try {
      const data = await this.fetchFromAlpaca<Record<string, AlpacaSnapshotResponse>>(url);

      const quotes: Quote[] = [];

      for (const [sym, snapshot] of Object.entries(data)) {
        if (!snapshot.latestTrade || !snapshot.latestTrade.p) continue;

        const price = snapshot.latestTrade.p;
        const dailyBar = snapshot.dailyBar;
        const prevDailyBar = snapshot.prevDailyBar;
        const prevClose = prevDailyBar?.c || dailyBar?.o || price;
        const change = price - prevClose;
        const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

        quotes.push({
          symbol: sym,
          name: sym,
          price,
          change: Math.round(change * 100) / 100,
          changePercent: Math.round(changePercent * 100) / 100,
          volume: dailyBar?.v || 0,
          high: dailyBar?.h || price,
          low: dailyBar?.l || price,
          open: dailyBar?.o || price,
          prevClose,
        });
      }

      // Cache for 10 seconds
      this.cache.set(cacheKey, quotes, 10_000);

      return quotes;
    } catch {
      // Fallback: fetch individually (slower but more reliable)
      const quotes: Quote[] = [];
      for (const symbol of symbols.slice(0, 10)) {
        try {
          const quote = await this.getQuote(symbol);
          quotes.push(quote);
          // Small delay to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 400));
        } catch {
          console.warn(`[TradeIQ] Alpaca quote failed for ${symbol}`);
        }
      }
      return quotes;
    }
  }

  async searchSymbols(query: string): Promise<SymbolInfo[]> {
    const cacheKey = `alpaca:search:${query}`;
    const cached = this.cache.get<SymbolInfo[]>(cacheKey);
    if (cached) return cached;

    await this.rateLimit();

    // Use the assets endpoint to search for stocks/ETFs
    // GET /v2/assets?status=active&asset_class=us_equity
    const url = `${this.baseUrl}/v2/assets?status=active`;

    try {
      const data = await this.fetchFromAlpaca<AlpacaAsset[]>(url);

      const upperQuery = query.toUpperCase();
      const results = data
        .filter(asset =>
          asset.symbol.toUpperCase().includes(upperQuery) ||
          asset.name.toUpperCase().includes(upperQuery)
        )
        .filter(asset => asset.tradable)
        .slice(0, 20)
        .map(asset => ({
          symbol: asset.symbol,
          name: asset.name,
          type: asset.asset_class === 'us_equity' ? 'stock' :
                asset.asset_class === 'crypto' ? 'crypto' : 'stock',
          exchange: asset.exchange,
          currency: 'USD',
        }));

      // Cache search results for 5 minutes
      this.cache.set(cacheKey, results, 300_000);

      return results;
    } catch {
      // Assets endpoint might not be available on free tier
      return [];
    }
  }

  // ─── Alpaca-Specific Methods ──────────────────────────────────────

  /**
   * Get the latest trade for a symbol.
   * Useful for getting the most recent price with timestamp.
   */
  async getLatestTrade(symbol: string): Promise<{ price: number; size: number; timestamp: string }> {
    await this.rateLimit();

    const url = `${this.dataBaseUrl}/v2/stocks/${encodeURIComponent(symbol.toUpperCase())}/trades/latest`;
    const data = await this.fetchFromAlpaca<{ trade: { p: number; s: number; t: string } }>(url);

    return {
      price: data.trade.p,
      size: data.trade.s,
      timestamp: data.trade.t,
    };
  }

  /**
   * Get the latest quote (bid/ask) for a symbol.
   */
  async getLatestQuote(symbol: string): Promise<{ bid: number; ask: number; bidSize: number; askSize: number; timestamp: string }> {
    await this.rateLimit();

    const url = `${this.dataBaseUrl}/v2/stocks/${encodeURIComponent(symbol.toUpperCase())}/quotes/latest`;
    const data = await this.fetchFromAlpaca<{ quote: { bp: number; ap: number; bs: number; as: number; t: string } }>(url);

    return {
      bid: data.quote.bp,
      ask: data.quote.ap,
      bidSize: data.quote.bs,
      askSize: data.quote.as,
      timestamp: data.quote.t,
    };
  }

  /**
   * Get historical crypto bars (FREE — no API key needed for this!).
   * However, we keep CoinGecko + Binance as primary for crypto.
   */
  async getCryptoCandles(symbol: string, days: number = 180, interval: string = '1D'): Promise<Candle[]> {
    const cacheKey = `alpaca:crypto:${symbol}:${interval}:${days}`;
    const cached = this.cache.get<Candle[]>(cacheKey);
    if (cached) return cached;

    await this.rateLimit();

    const alpacaTimeframe = ALPACA_TIMEFRAMES[interval] || '1Day';
    const now = new Date();
    const start = new Date(now.getTime() - days * 86400_000);

    // Crypto uses a different endpoint
    // Format: BTC/USD → BTCUSD or BTC/USDT
    const cryptoSymbol = symbol.toUpperCase().replace('USDT', '/USDT').replace('BUSD', '/BUSD');
    // If no / present, add /USD
    const alpacaCryptoSymbol = cryptoSymbol.includes('/') ? cryptoSymbol : `${cryptoSymbol}/USD`;

    const url = `${this.dataBaseUrl}/v1beta3/crypto/us/bars` +
      `?symbols=${encodeURIComponent(alpacaCryptoSymbol)}` +
      `&timeframe=${alpacaTimeframe}` +
      `&start=${start.toISOString()}` +
      `&end=${now.toISOString()}` +
      `&limit=${Math.min(estimateCandleCount(days, interval), 10000)}`;

    const data = await this.fetchFromAlpaca<AlpacaCryptoBarsResponse>(url);

    const bars = data.bars?.[alpacaCryptoSymbol];
    if (!bars || bars.length === 0) {
      throw new Error(`ALPACA_NO_CRYPTO: No crypto data for ${symbol}`);
    }

    const candles: Candle[] = bars.map(bar => ({
      time: Math.floor(new Date(bar.t).getTime() / 1000),
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
    }));

    const ttl = ['1D', '1W'].includes(interval) ? 300_000 : 30_000;
    this.cache.set(cacheKey, candles, ttl);

    return candles;
  }

  /**
   * Check if Alpaca API is reachable and keys are valid.
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.rateLimit();
      const url = `${this.baseUrl}/v2/account`;
      await this.fetchFromAlpaca(url);
      return true;
    } catch {
      return false;
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  /**
   * Fetch from Alpaca API with proper authentication headers.
   */
  private async fetchFromAlpaca<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'APCA-API-KEY-ID': this.apiKey,
        'APCA-API-SECRET-KEY': this.apiSecret,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('ALPACA_AUTH: Invalid API key or secret');
      }
      if (response.status === 403) {
        throw new Error('ALPACA_FORBIDDEN: subscription does not permit this data endpoint (bars require paid plan, use snapshots instead)');
      }
      if (response.status === 429) {
        throw new Error('ALPACA_RATE_LIMIT: Rate limit exceeded (200/min)');
      }
      if (response.status === 404) {
        throw new Error(`ALPACA_NOT_FOUND: Resource not found (${url})`);
      }
      throw new Error(`ALPACA_ERROR: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Simple rate limiter — ensures we don't exceed 200 req/min.
   * Waits if needed to maintain minimum interval between requests.
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - elapsed));
    }
    this.lastRequestTime = Date.now();
  }
}

// ─── Alpaca API Response Types ────────────────────────────────────

interface AlpacaBarsResponse {
  bars: {
    t: string;   // Timestamp ISO string
    o: number;   // Open
    h: number;   // High
    l: number;   // Low
    c: number;   // Close
    v: number;   // Volume
    n: number;   // Trade count
    vw: number;  // VWAP
  }[];
  symbol: string;
  next_page_token?: string;
}

interface AlpacaCryptoBarsResponse {
  bars: {
    [symbol: string]: {
      t: string;
      o: number;
      h: number;
      l: number;
      c: number;
      v: number;
      n: number;
      vw: number;
    }[];
  };
  next_page_token?: string;
}

interface AlpacaSnapshotResponse {
  latestTrade: {
    p: number;   // Price
    s: number;   // Size
    t: string;   // Timestamp
    i: number;   // Trade ID
  } | null;
  latestQuote: {
    bp: number;  // Bid price
    bs: number;  // Bid size
    ap: number;  // Ask price
    as: number;  // Ask size
    t: string;   // Timestamp
  } | null;
  minuteBar: {
    t: string;
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  } | null;
  dailyBar: {
    t: string;
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  } | null;
  prevDailyBar: {
    t: string;
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  } | null;
}

interface AlpacaAsset {
  id: string;
  class: string;
  exchange: string;
  symbol: string;
  name: string;
  status: string;
  tradable: boolean;
  marginable: boolean;
  shortable: boolean;
  easy_to_borrow: boolean;
  fractionable: boolean;
  asset_class: string;
  maintenance_requirement?: number;
}
