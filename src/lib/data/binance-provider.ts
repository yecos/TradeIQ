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
 * Sleep helper for rate limiting.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class BinanceProvider implements MarketDataProvider {
  readonly name = 'binance';
  private activeBaseUrl: string | null = null; // Cached working URL
  private exchangeInfoCache: Map<string, string> | null = null;
  private healthChecked = false;

  /**
   * Get the working Binance base URL.
   * Tries binance.us first (works from US), falls back to binance.com.
   */
  private async getBaseUrl(): Promise<string> {
    // If we already found a working URL, use it
    if (this.activeBaseUrl) return this.activeBaseUrl;

    // Try each URL with a lightweight health check
    for (const url of BINANCE_URLS) {
      try {
        const response = await fetch(`${url}/api/v3/ping`, {
          signal: AbortSignal.timeout(5000), // 5s timeout
        });
        if (response.ok) {
          this.activeBaseUrl = url;
          this.healthChecked = true;
          console.warn(`[TradeIQ] Binance connected: ${url}`);
          return url;
        }
      } catch {
        console.warn(`[TradeIQ] Binance ${url} unavailable, trying next...`);
      }
    }

    // If all fail, default to .us (better chance from US servers)
    console.warn('[TradeIQ] All Binance URLs failed health check, defaulting to binance.us');
    return BINANCE_URLS[0];
  }

  /**
   * Fetch from Binance with automatic URL fallback.
   */
  private async fetchFromBinance<T>(path: string): Promise<T> {
    const urls = this.activeBaseUrl
      ? [this.activeBaseUrl, ...BINANCE_URLS.filter(u => u !== this.activeBaseUrl)]
      : BINANCE_URLS;

    for (const baseUrl of urls) {
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          signal: AbortSignal.timeout(10000), // 10s timeout
        });

        if (response.ok) {
          this.activeBaseUrl = baseUrl; // Cache working URL
          return response.json() as Promise<T>;
        }

        // 451 = geo-blocked, 403 = forbidden, 429 = rate limited — try next URL
        if (response.status === 451 || response.status === 403 || response.status === 429) {
          console.warn(`[TradeIQ] Binance ${baseUrl} blocked/rate-limited (${response.status}), trying fallback...`);
          // Clear cached URL so we try the other one next time
          if (baseUrl === this.activeBaseUrl) this.activeBaseUrl = null;
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
        if (error instanceof TypeError || (error instanceof Error && (error.message.includes('fetch') || error.message.includes('abort')))) {
          console.warn(`[TradeIQ] Binance ${baseUrl} network error, trying fallback...`);
          if (baseUrl === this.activeBaseUrl) this.activeBaseUrl = null;
          continue;
        }
        // Re-throw application errors (like symbol not found)
        throw error;
      }
    }

    throw new Error('All Binance API endpoints unavailable');
  }

  async getCandles(symbol: string, days: number = 180): Promise<Candle[]> {
    const pair = toBinancePair(symbol);
    const limit = Math.min(days, 1000); // Binance max 1000 per request

    const data = await this.fetchFromBinance<BinanceKline[]>(
      `/api/v3/klines?symbol=${pair}&interval=1d&limit=${limit}`
    );

    const candles: Candle[] = data.map((k) => ({
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
    const quotes: Quote[] = [];

    for (const symbol of symbols) {
      try {
        const quote = await this.getQuote(symbol);
        quotes.push(quote);
        // Small delay between requests to avoid rate limits
        if (symbols.indexOf(symbol) < symbols.length - 1) {
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
