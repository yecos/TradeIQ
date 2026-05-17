import type { Candle, Quote } from '../types';
import type { MarketDataProvider, SymbolInfo, DataCache } from './market-data-interface';

/**
 * Polygon.io Market Data Provider — real market data from Polygon.io API.
 * Requires POLYGON_API_KEY environment variable.
 *
 * Rate limits (free tier):
 * - 5 calls per minute
 * - 2 years of historical data
 *
 * Cache strategy:
 * - Quotes: 60s TTL (prices change frequently)
 * - Candles: 300s TTL (5min, historical data doesn't change often)
 * - Symbol search: 3600s TTL (1 hour, tickers rarely change)
 */
export class PolygonProvider implements MarketDataProvider {
  readonly name = 'polygon';
  private apiKey: string;
  private baseUrl = 'https://api.polygon.io';
  private cache: DataCache;
  private lastCallTime = 0;
  private minCallInterval = 12_000; // 12s between calls = 5 calls/min max

  constructor(apiKey: string, cache: DataCache) {
    this.apiKey = apiKey;
    this.cache = cache;
  }

  async getCandles(symbol: string, days: number = 180): Promise<Candle[]> {
    const cacheKey = `candles:${symbol}:${days}`;
    const cached = this.cache.get<Candle[]>(cacheKey);
    if (cached) return cached;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const fromDate = formatDate(startDate);
    const toDate = formatDate(endDate);

    const data = await this.fetchFromApi<PolygonAggsResponse>(
      `/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=50000`
    );

    const candles: Candle[] = (data.results || []).map((agg) => ({
      time: Math.floor(agg.t / 1000), // Polygon returns milliseconds
      open: agg.o,
      high: agg.h,
      low: agg.l,
      close: agg.c,
      volume: agg.v,
    }));

    this.cache.set(cacheKey, candles, 300_000); // 5min cache
    return candles;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const cacheKey = `quote:${symbol}`;
    const cached = this.cache.get<Quote>(cacheKey);
    if (cached) return cached;

    // Get previous close for change calculation
    const data = await this.fetchFromApi<PolygonPrevCloseResponse>(
      `/v2/aggs/ticker/${symbol}/prev?adjusted=true`
    );

    if (!data.results || data.results.length === 0) {
      throw new Error(`No quote data found for ${symbol}`);
    }

    const result = data.results[0];
    const quote: Quote = {
      symbol,
      name: await this.getSymbolName(symbol),
      price: result.c, // close price
      change: Math.round((result.c - result.o) * 100) / 100,
      changePercent: Math.round(((result.c - result.o) / result.o) * 10000) / 100,
      volume: result.v,
      high: result.h,
      low: result.l,
      open: result.o,
      prevClose: result.o, // Previous day's close = today's open reference
    };

    this.cache.set(cacheKey, quote, 60_000); // 60s cache
    return quote;
  }

  async getMultipleQuotes(symbols: string[]): Promise<Quote[]> {
    // Fetch quotes sequentially to respect rate limits
    const quotes: Quote[] = [];
    for (const symbol of symbols) {
      try {
        const quote = await this.getQuote(symbol);
        quotes.push(quote);
      } catch {
        // If one fails, skip it and continue
        console.warn(`Failed to fetch quote for ${symbol}`);
      }
    }
    return quotes;
  }

  async searchSymbols(query: string): Promise<SymbolInfo[]> {
    const cacheKey = `search:${query}`;
    const cached = this.cache.get<SymbolInfo[]>(cacheKey);
    if (cached) return cached;

    const data = await this.fetchFromApi<PolygonTickerSearchResponse>(
      `/v3/reference/tickers?search=${encodeURIComponent(query)}&active=true&limit=20`
    );

    const results: SymbolInfo[] = (data.results || []).map((ticker) => ({
      symbol: ticker.ticker,
      name: ticker.name || ticker.ticker,
      type: ticker.market === 'crypto' ? 'crypto' :
            ticker.primary_exchange ? 'stock' : 'other',
      exchange: ticker.primary_exchange || ticker.market || '',
      currency: ticker.currency_name || 'USD',
    }));

    this.cache.set(cacheKey, results, 3_600_000); // 1 hour cache
    return results;
  }

  // --- Private helpers ---

  private async getSymbolName(symbol: string): Promise<string> {
    // Try cache first
    const cacheKey = `name:${symbol}`;
    const cached = this.cache.get<string>(cacheKey);
    if (cached) return cached;

    try {
      const data = await this.fetchFromApi<PolygonTickerDetailsResponse>(
        `/v3/reference/tickers/${symbol}`
      );
      const name = data.results?.name || symbol;
      this.cache.set(cacheKey, name, 3_600_000); // 1 hour cache
      return name;
    } catch {
      return symbol;
    }
  }

  private async fetchFromApi<T>(path: string): Promise<T> {
    // Rate limiting: ensure minimum interval between API calls
    const now = Date.now();
    const elapsed = now - this.lastCallTime;
    if (elapsed < this.minCallInterval) {
      await sleep(this.minCallInterval - elapsed);
    }
    this.lastCallTime = Date.now();

    const separator = path.includes('?') ? '&' : '?';
    const url = `${this.baseUrl}${path}${separator}apiKey=${this.apiKey}`;

    const response = await fetch(url);

    if (response.status === 429) {
      // Rate limited — wait and retry once
      console.warn('Polygon API rate limited, waiting 60s...');
      await sleep(60_000);
      const retryResponse = await fetch(url);
      if (!retryResponse.ok) {
        throw new Error(`Polygon API error after retry: ${retryResponse.status}`);
      }
      return retryResponse.json() as Promise<T>;
    }

    if (!response.ok) {
      throw new Error(`Polygon API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }
}

// --- Utility functions ---

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Polygon API response types ---

interface PolygonAggResult {
  t: number;  // Timestamp (milliseconds)
  o: number;  // Open
  h: number;  // High
  l: number;  // Low
  c: number;  // Close
  v: number;  // Volume
  vw: number; // Volume-weighted average price
  n: number;  // Number of transactions
}

interface PolygonAggsResponse {
  ticker: string;
  queryCount: number;
  resultsCount: number;
  adjusted: boolean;
  results: PolygonAggResult[];
  status: string;
  request_id: string;
  count: number;
}

interface PolygonPrevCloseResponse {
  ticker: string;
  adjusted: boolean;
  queryCount: number;
  request_id: string;
  resultsCount: number;
  results: PolygonAggResult[];
  status: string;
}

interface PolygonTickerSearchResult {
  active: boolean;
  cik: string;
  composite_figi: string;
  currency_name: string;
  delisted_utc: string | null;
  last_updated_utc: string;
  market: string;
  market_cap: number | null;
  name: string | null;
  primary_exchange: string | null;
  share_class_figi: string;
  ticker: string;
  type: string;
}

interface PolygonTickerSearchResponse {
  results: PolygonTickerSearchResult[];
  status: string;
  request_id: string;
  count: number;
  next_url: string | null;
}

interface PolygonTickerDetailsResponse {
  request_id: string;
  results: {
    active: boolean;
    name: string;
    ticker: string;
    market: string;
    primary_exchange: string;
    type: string;
    currency_name: string;
    cik: string;
    composite_figi: string;
    share_class_figi: string;
    market_cap: number | null;
    phone_number: string;
    address: {
      city: string;
      state: string;
      country: string;
    } | null;
    description: string;
    homepage_url: string;
    total_employees: number | null;
    list_date: string | null;
    weighted_shares_outstanding: number | null;
  };
  status: string;
}
