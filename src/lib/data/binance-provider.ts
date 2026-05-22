import type { Candle, Quote } from '../types';
import type { MarketDataProvider, SymbolInfo } from './market-data-interface';

/**
 * Binance Market Data Provider — free, real-time crypto data.
 * No API key required — all endpoints used are public.
 *
 * Rate limits: 1200 requests/min (binance.com), 120/min (binance.us)
 *
 * URL strategy (optimized for Vercel/US deployments):
 * - Primary: https://api.binance.us (US-compliant, works from Vercel/AWS)
 * - Fallback: https://api.binance.com (global, may be geo-blocked from US)
 *
 * IMPORTANT: binance.us has fewer trading pairs than binance.com.
 * If a pair is not found on binance.us, the SmartProvider will fall back
 * to CoinGecko (which works everywhere).
 *
 * PERFORMANCE: All timeouts are kept short (3-5s) to prevent serverless
 * function timeouts on Vercel. We prefer fast failure + fallback over
 * slow success.
 */

// Well-known crypto symbols with metadata
const CRYPTO_SEEDS: Record<string, { name: string; pair: string }> = {
  'BTC': { name: 'Bitcoin', pair: 'BTCUSDT' },
  'ETH': { name: 'Ethereum', pair: 'ETHUSDT' },
  'BNB': { name: 'BNB', pair: 'BNBUSDT' },
  'SOL': { name: 'Solana', pair: 'SOLUSDT' },
  'XRP': { name: 'XRP', pair: 'XRPUSDT' },
  'ADA': { name: 'Cardano', pair: 'ADAUSDT' },
  'DOGE': { name: 'Dogecoin', pair: 'DOGEUSDT' },
  'DOT': { name: 'Polkadot', pair: 'DOTUSDT' },
  'AVAX': { name: 'Avalanche', pair: 'AVAXUSDT' },
  'MATIC': { name: 'Polygon', pair: 'MATICUSDT' },
  'LINK': { name: 'Chainlink', pair: 'LINKUSDT' },
  'UNI': { name: 'Uniswap', pair: 'UNIUSDT' },
  'ATOM': { name: 'Cosmos', pair: 'ATOMUSDT' },
  'LTC': { name: 'Litecoin', pair: 'LTCUSDT' },
  'NEAR': { name: 'NEAR Protocol', pair: 'NEARUSDT' },
  'AAVE': { name: 'Aave', pair: 'AAVEUSDT' },
  'ARB': { name: 'Arbitrum', pair: 'ARBUSDT' },
  'OP': { name: 'Optimism', pair: 'OPUSDT' },
  'APT': { name: 'Aptos', pair: 'APTUSDT' },
  'SUI': { name: 'Sui', pair: 'SUIUSDT' },
};

// US-first URL order: try binance.us first (works from Vercel/AWS),
// then binance.com as fallback
const BINANCE_URLS = [
  'https://api.binance.us',
  'https://api.binance.com',
];

/**
 * Check if a symbol is likely a cryptocurrency.
 * Used by the SmartProvider to route to crypto providers.
 */
export function isCryptoSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  return upper in CRYPTO_SEEDS || upper.endsWith('USDT') || upper.endsWith('BUSD');
}

/**
 * Get the Binance trading pair for a symbol.
 * E.g., 'BTC' → 'BTCUSDT', 'ETH' → 'ETHUSDT'
 */
function toBinancePair(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper.endsWith('USDT') || upper.endsWith('BUSD')) return upper;
  const seed = CRYPTO_SEEDS[upper];
  return seed?.pair || `${upper}USDT`;
}

/**
 * Format price with appropriate decimal precision.
 * BTC → 2 decimals, ETH → 2, small caps → 4-6
 */
function formatPrice(price: number): number {
  if (price >= 1000) return Math.round(price * 100) / 100;
  if (price >= 1) return Math.round(price * 10000) / 10000;
  if (price >= 0.01) return Math.round(price * 100000) / 100000;
  return Math.round(price * 1000000) / 1000000;
}

/**
 * Convert our timeframe format to Binance interval format.
 * Our format: '1m', '5m', '15m', '1H', '4H', '1D', '1W'
 * Binance format: '1m', '5m', '15m', '1h', '4h', '1d', '1w'
 */
function toBinanceInterval(interval: string): string {
  const map: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '1H': '1h',
    '4H': '4h',
    '1D': '1d',
    '1W': '1w',
  };
  return map[interval] || '1d';
}

/**
 * Convert our interval format to milliseconds.
 * Used for calculating proper candle counts and start times.
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
 *
 * Previously, `days` was used directly as the Binance `limit` parameter.
 * This meant 1m × 1 day = limit=1 (only 1 candle!), which broke intraday charts.
 *
 * Now we calculate: candle_count ≈ (days × seconds_per_day) / seconds_per_interval
 * Capped at 1000 (Binance max per request).
 */
function estimateCandleCount(days: number, interval: string): number {
  const intervalMs = intervalToMs(interval);
  const totalMs = days * 86_400_000; // days × ms per day
  const count = Math.ceil(totalMs / intervalMs);
  return Math.max(count, 1);
}

/**
 * Sleep helper for rate limiting.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class BinanceProvider implements MarketDataProvider {
  readonly name = 'binance';
  private activeBaseUrl: string | null = null; // Cached working URL
  private exchangeInfoCache: Map<string, string> | null = null;
  private lastHealthCheck = 0; // Timestamp of last successful health check
  private healthCheckInterval = 300_000; // Re-check every 5 minutes (not every request!)

  /**
   * Get the working Binance base URL.
   * Tries binance.us first (works from US), falls back to binance.com.
   * Caches the working URL for 5 minutes to avoid health-checking on every request.
   */
  private async getBaseUrl(): Promise<string> {
    // If we recently found a working URL, use it
    if (this.activeBaseUrl && (Date.now() - this.lastHealthCheck < this.healthCheckInterval)) {
      return this.activeBaseUrl;
    }

    // Try each URL with a lightweight health check
    for (const url of BINANCE_URLS) {
      try {
        const response = await fetch(`${url}/api/v3/ping`, {
          signal: AbortSignal.timeout(3000), // 3s timeout for health check (reduced from 5s)
        });
        if (response.ok) {
          this.activeBaseUrl = url;
          this.lastHealthCheck = Date.now();
          return url;
        }
      } catch {
        // URL unavailable, try next
      }
    }

    // If all fail, default to .us (better chance from US servers)
    return BINANCE_URLS[0];
  }

  /**
   * Fetch from Binance with automatic URL fallback.
   * Short timeouts to prevent serverless function timeouts.
   */
  private async fetchFromBinance<T>(path: string): Promise<T> {
    const urls = this.activeBaseUrl
      ? [this.activeBaseUrl, ...BINANCE_URLS.filter(u => u !== this.activeBaseUrl)]
      : BINANCE_URLS;

    for (const baseUrl of urls) {
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          signal: AbortSignal.timeout(5000), // 5s timeout (reduced from 10s)
        });

        if (response.ok) {
          this.activeBaseUrl = baseUrl; // Cache working URL
          this.lastHealthCheck = Date.now();
          return response.json() as Promise<T>;
        }

        // 451 = geo-blocked, 403 = forbidden, 429 = rate limited — try next URL
        if (response.status === 451 || response.status === 403 || response.status === 429) {
          // Clear cached URL so we try the other one next time
          if (baseUrl === this.activeBaseUrl) {
            this.activeBaseUrl = null;
            this.lastHealthCheck = 0;
          }
          continue;
        }

        // 400 = bad request (symbol not found on this exchange)
        if (response.status === 400) {
          const body = await response.text();
          if (body.includes('Invalid symbol')) {
            throw new Error(`BINANCE_SYMBOL_NOT_FOUND: Symbol not available on ${baseUrl}`);
          }
        }

        throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
      } catch (error) {
        // Network errors — try next URL
        if (error instanceof TypeError || (error instanceof Error && (error.message.includes('fetch') || error.message.includes('abort') || error.message.includes('timeout')))) {
          if (baseUrl === this.activeBaseUrl) {
            this.activeBaseUrl = null;
            this.lastHealthCheck = 0;
          }
          continue;
        }
        // Re-throw application errors (like symbol not found)
        throw error;
      }
    }

    throw new Error('All Binance API endpoints unavailable');
  }

  async getCandles(symbol: string, days: number = 180, interval: string = '1d'): Promise<Candle[]> {
    const pair = toBinancePair(symbol);
    const binanceInterval = toBinanceInterval(interval);

    // FIX: Convert days + interval to proper candle count.
    // Previously `days` was used as `limit`, so 1m × 1 day = 1 candle (WRONG).
    // Now we estimate how many candles fit in `days` based on the interval.
    const limit = Math.min(estimateCandleCount(days, interval), 1000); // Binance max 1000 per request

    // Calculate the start time so Binance returns candles from the correct lookback window.
    // Use the actual desired start time (not limit-based calculation).
    // This ensures we get the most recent data when limit is capped at 1000.
    const now = Date.now();
    const startMs = now - days * 86400_000;

    const data = await this.fetchFromBinance<BinanceKline[]>(
      `/api/v3/klines?symbol=${pair}&interval=${binanceInterval}&limit=${limit}&startTime=${startMs}`
    );

    const candles: Candle[] = data
      .map((k) => ({
        time: Math.floor(k[0] / 1000), // Open time in ms → seconds
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));

    return candles;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const pair = toBinancePair(symbol);
    const upper = symbol.toUpperCase().replace('USDT', '').replace('BUSD', '');
    const name = CRYPTO_SEEDS[upper]?.name || upper;

    // 24hr ticker gives us everything we need
    const data = await this.fetchFromBinance<Binance24hrTicker>(
      `/api/v3/ticker/24hr?symbol=${pair}`
    );

    const price = parseFloat(data.lastPrice);
    const prevClose = parseFloat(data.prevClosePrice);
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol: upper,
      name,
      price: formatPrice(price),
      change: formatPrice(change),
      changePercent: Math.round(changePercent * 100) / 100,
      volume: Math.floor(parseFloat(data.quoteVolume) || parseFloat(data.volume) * price),
      high: formatPrice(parseFloat(data.highPrice)),
      low: formatPrice(parseFloat(data.lowPrice)),
      open: formatPrice(parseFloat(data.openPrice)),
      prevClose: formatPrice(prevClose),
    };
  }

  async getMultipleQuotes(symbols: string[]): Promise<Quote[]> {
    // IMPORTANT: Serialize requests instead of Promise.all to prevent:
    // 1. Server crashes from too many concurrent fetches
    // 2. Rate limiting (especially binance.us: 120/min)
    // 3. Memory pressure from many concurrent responses
    //
    // LIMIT: Max 5 symbols to prevent excessive latency.
    // SmartProvider should use CoinGecko for batch, Binance only for small fallbacks.
    const maxSymbols = symbols.slice(0, 5);
    const quotes: Quote[] = [];

    for (const symbol of maxSymbols) {
      try {
        const quote = await this.getQuote(symbol);
        quotes.push(quote);
        // Small delay between requests to avoid rate limits
        if (maxSymbols.indexOf(symbol) < maxSymbols.length - 1) {
          await sleep(100);
        }
      } catch (error) {
        console.warn(`[TradeIQ] Failed to fetch Binance quote for ${symbol}:`, error instanceof Error ? error.message : error);
        // Don't add null — let SmartProvider handle fallback per-symbol
      }
    }

    return quotes;
  }

  async searchSymbols(query: string): Promise<SymbolInfo[]> {
    const upper = query.toUpperCase();

    // First, search in known crypto seeds (instant, no API call)
    const localResults: SymbolInfo[] = [];
    for (const [symbol, seed] of Object.entries(CRYPTO_SEEDS)) {
      if (symbol.includes(upper) || seed.name.toUpperCase().includes(upper)) {
        localResults.push({
          symbol,
          name: seed.name,
          type: 'crypto',
          exchange: 'Binance',
          currency: 'USDT',
        });
      }
    }

    if (localResults.length > 0) return localResults;

    // If not found locally, try Binance exchange info
    try {
      const pairMap = await this.getExchangeInfo();
      const results: SymbolInfo[] = [];

      for (const [pair, baseAsset] of pairMap) {
        if (pair.includes(upper) || baseAsset.includes(upper)) {
          results.push({
            symbol: baseAsset,
            name: baseAsset, // Binance doesn't provide names in exchangeInfo
            type: 'crypto',
            exchange: 'Binance',
            currency: 'USDT',
          });
        }
      }

      return results.slice(0, 20);
    } catch {
      return localResults;
    }
  }

  /**
   * Fetch and cache Binance exchange info for symbol lookup.
   */
  private async getExchangeInfo(): Promise<Map<string, string>> {
    if (this.exchangeInfoCache) return this.exchangeInfoCache;

    const data = await this.fetchFromBinance<BinanceExchangeInfo>(
      '/api/v3/exchangeInfo'
    );

    const map = new Map<string, string>();
    for (const s of data.symbols) {
      if (s.status === 'TRADING' && s.quoteAsset === 'USDT') {
        map.set(s.symbol, s.baseAsset);
      }
    }

    this.exchangeInfoCache = map;
    return map;
  }
}

// --- Binance API response types ---

/**
 * Binance Kline (candlestick) response.
 * [0] Open time, [1] Open, [2] High, [3] Low, [4] Close,
 * [5] Volume, [6] Close time, [7] Quote asset volume,
 * [8] Number of trades, [9] Taker buy base, [10] Taker buy quote
 */
type BinanceKline = [
  number,  // 0: Open time (ms)
  string,  // 1: Open
  string,  // 2: High
  string,  // 3: Low
  string,  // 4: Close
  string,  // 5: Volume
  number,  // 6: Close time (ms)
  string,  // 7: Quote asset volume
  number,  // 8: Number of trades
  string,  // 9: Taker buy base asset volume
  string,  // 10: Taker buy quote asset volume
  string,  // 11: Ignore
];

interface Binance24hrTicker {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  prevClosePrice: string;
  lastPrice: string;
  lastQty: string;
  bidPrice: string;
  askPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  count: number;
}

interface BinanceExchangeInfoSymbol {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
}

interface BinanceExchangeInfo {
  symbols: BinanceExchangeInfoSymbol[];
}
