import type { Candle, Quote } from '../types';
import type { MarketDataProvider, SymbolInfo } from './market-data-interface';

/**
 * CoinGecko Market Data Provider — free, real-time crypto data.
 * Works from ANY location including US servers (no geo-blocking).
 * No API key required — all endpoints used are public (free tier).
 *
 * Rate limits: ~10-30 requests/min (free tier) — we use caching to stay within limits.
 *
 * This is the recommended crypto provider when running on US-based servers
 * like Vercel, where Binance.com is geo-blocked and Binance.us has limited pairs.
 */

// Map our symbols to CoinGecko IDs
const COINGECKO_IDS: Record<string, { id: string; name: string }> = {
  'BTC': { id: 'bitcoin', name: 'Bitcoin' },
  'ETH': { id: 'ethereum', name: 'Ethereum' },
  'BNB': { id: 'binancecoin', name: 'BNB' },
  'SOL': { id: 'solana', name: 'Solana' },
  'XRP': { id: 'ripple', name: 'XRP' },
  'ADA': { id: 'cardano', name: 'Cardano' },
  'DOGE': { id: 'dogecoin', name: 'Dogecoin' },
  'DOT': { id: 'polkadot', name: 'Polkadot' },
  'AVAX': { id: 'avalanche-2', name: 'Avalanche' },
  'MATIC': { id: 'matic-network', name: 'Polygon' },
  'LINK': { id: 'chainlink', name: 'Chainlink' },
  'UNI': { id: 'uniswap', name: 'Uniswap' },
  'ATOM': { id: 'cosmos', name: 'Cosmos' },
  'LTC': { id: 'litecoin', name: 'Litecoin' },
  'NEAR': { id: 'near', name: 'NEAR Protocol' },
  'AAVE': { id: 'aave', name: 'Aave' },
  'ARB': { id: 'arbitrum', name: 'Arbitrum' },
  'OP': { id: 'optimism', name: 'Optimism' },
  'APT': { id: 'aptos', name: 'Aptos' },
  'SUI': { id: 'sui', name: 'Sui' },
};

// Reverse lookup: CoinGecko ID → our symbol
const ID_TO_SYMBOL = new Map(
  Object.entries(COINGECKO_IDS).map(([symbol, info]) => [info.id, symbol])
);

const BASE_URL = 'https://api.coingecko.com/api/v3';

/**
 * Format price with appropriate decimal precision.
 */
function formatPrice(price: number): number {
  if (price >= 1000) return Math.round(price * 100) / 100;
  if (price >= 1) return Math.round(price * 10000) / 10000;
  if (price >= 0.01) return Math.round(price * 100000) / 100000;
  return Math.round(price * 1000000) / 1000000;
}

export class CoinGeckoProvider implements MarketDataProvider {
  readonly name = 'coingecko';

  // Cache for quotes (30s TTL) — stay within rate limits
  private quoteCache = new Map<string, { data: Quote; timestamp: number }>();
  private quoteCacheTtl = 30_000; // 30 seconds

  // Cache for candles (5min TTL)
  private candleCache = new Map<string, { data: Candle[]; timestamp: number }>();
  private candleCacheTtl = 300_000; // 5 minutes

  // Batch quote cache — CoinGecko supports batch queries
  private batchCache: { data: Map<string, Quote>; timestamp: number } | null = null;
  private batchCacheTtl = 30_000; // 30 seconds

  async getCandles(symbol: string, days: number = 180, interval: string = '1D'): Promise<Candle[]> {
    const cacheKey = `${symbol}-${days}-${interval}`;
    const cached = this.candleCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.candleCacheTtl) {
      return cached.data;
    }

    const coinId = this.getCoinId(symbol);

    // CoinGecko free API only provides daily+ candles.
    // For intraday intervals (1m, 5m, 15m, 1H, 4H), throw error so SmartProvider falls back to Binance.
    const isDaily = ['1D', '1W'].includes(interval);
    if (!isDaily) {
      throw new Error('CoinGecko does not support intraday intervals on free tier. Use Binance instead.');
    }

    // CoinGecko OHLC only accepts specific day values: 1, 7, 14, 30, 90, 180, 365
    const validDays = [1, 7, 14, 30, 90, 180, 365];
    const cgDays = validDays.find(d => d >= days) || 365;

    const response = await fetch(
      `${BASE_URL}/coins/${coinId}/ohlc?vs_currency=usd&days=${cgDays}`,
      { signal: AbortSignal.timeout(15000) }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown');
      throw new Error(`CoinGecko OHLC error: ${response.status} - ${errorText}`);
    }

    const ohlcData: number[][] = await response.json();

    // CoinGecko OHLC returns sub-daily candles that we aggregate to daily
    let candles = this.aggregateToDaily(ohlcData);

    // For weekly, aggregate daily into weekly
    if (interval === '1W') {
      candles = this.aggregateToWeekly(candles);
    }

    // Trim to requested number of candles
    const trimmed = candles.slice(-days);

    this.candleCache.set(cacheKey, { data: trimmed, timestamp: Date.now() });
    return trimmed;
  }

  async getQuote(symbol: string): Promise<Quote> {
    // Check single quote cache
    const cached = this.quoteCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < this.quoteCacheTtl) {
      return cached.data;
    }

    // Use batch endpoint (more efficient)
    const allQuotes = await this.getAllQuotesBatch();
    const quote = allQuotes.get(symbol);
    if (quote) {
      this.quoteCache.set(symbol, { data: quote, timestamp: Date.now() });
      return quote;
    }

    throw new Error(`CoinGecko: no quote data for ${symbol}`);
  }

  async getMultipleQuotes(symbols: string[]): Promise<Quote[]> {
    const allQuotes = await this.getAllQuotesBatch();
    return symbols
      .map(s => allQuotes.get(s))
      .filter((q): q is Quote => q !== undefined);
  }

  async searchSymbols(query: string): Promise<SymbolInfo[]> {
    const upper = query.toUpperCase();
    const results: SymbolInfo[] = [];

    for (const [symbol, info] of Object.entries(COINGECKO_IDS)) {
      if (symbol.includes(upper) || info.name.toUpperCase().includes(upper)) {
        results.push({
          symbol,
          name: info.name,
          type: 'crypto',
          exchange: 'CoinGecko',
          currency: 'USD',
        });
      }
    }

    return results;
  }

  // --- Private helpers ---

  private getCoinId(symbol: string): string {
    const upper = symbol.toUpperCase().replace('USDT', '').replace('BUSD', '');
    const info = COINGECKO_IDS[upper];
    if (info) return info.id;
    // Fallback: try lowercase symbol as CoinGecko ID
    return symbol.toLowerCase();
  }

  /**
   * Fetch all tracked crypto quotes in a single batch request.
   * CoinGecko's /simple/price supports multiple IDs — much more efficient
   * than individual requests.
   */
  private async getAllQuotesBatch(): Promise<Map<string, Quote>> {
    // Check batch cache
    if (this.batchCache && Date.now() - this.batchCache.timestamp < this.batchCacheTtl) {
      return this.batchCache.data;
    }

    const allIds = Object.values(COINGECKO_IDS).map(info => info.id).join(',');
    const url = `${BASE_URL}/simple/price?ids=${allIds}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_high_24hr=true&include_low_24hr=true`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`CoinGecko batch price error: ${response.status}`);
    }

    const data: Record<string, CoinGeckoPriceData> = await response.json();

    const quoteMap = new Map<string, Quote>();

    for (const [coinId, priceData] of Object.entries(data)) {
      const symbol = ID_TO_SYMBOL.get(coinId);
      if (!symbol) continue;

      const name = COINGECKO_IDS[symbol]?.name || symbol;
      const price = priceData.usd || 0;
      const changePercent = priceData.usd_24h_change || 0;
      const change = price * (changePercent / 100);

      quoteMap.set(symbol, {
        symbol,
        name,
        price: formatPrice(price),
        change: formatPrice(change),
        changePercent: Math.round(changePercent * 100) / 100,
        volume: Math.floor(priceData.usd_24h_vol || 0),
        high: formatPrice(priceData.usd_24h_high || price),
        low: formatPrice(priceData.usd_24h_low || price),
        open: formatPrice(price - change),
        prevClose: formatPrice(price - change),
      });
    }

    this.batchCache = { data: quoteMap, timestamp: Date.now() };
    return quoteMap;
  }

  /**
   * Aggregate sub-daily OHLC data into daily candles.
   * CoinGecko returns 4h or 30min candles depending on the days parameter.
   */
  private aggregateToDaily(ohlcData: number[][]): Candle[] {
    if (ohlcData.length === 0) return [];

    // Group by UTC day
    const dailyMap = new Map<number, { open: number; high: number; low: number; close: number; time: number }>();

    for (const [timestamp, open, high, low, close] of ohlcData) {
      const date = new Date(timestamp);
      const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
      const dayTimestamp = Math.floor(dayStart / 1000);

      const existing = dailyMap.get(dayTimestamp);
      if (existing) {
        existing.high = Math.max(existing.high, high);
        existing.low = Math.min(existing.low, low);
        existing.close = close;
      } else {
        dailyMap.set(dayTimestamp, {
          open,
          high,
          low,
          close,
          time: dayTimestamp,
        });
      }
    }

    // Convert to sorted Candle array with estimated volumes
    const candles = Array.from(dailyMap.values())
      .sort((a, b) => a.time - b.time)
      .map(c => ({
        time: c.time,
        open: formatPrice(c.open),
        high: formatPrice(c.high),
        low: formatPrice(c.low),
        close: formatPrice(c.close),
        // CoinGecko OHLC doesn't include volume, so we estimate from price range
        // Typical crypto daily volume is roughly proportional to volatility × market cap
        volume: Math.floor(
          ((c.high - c.low) / c.close) * c.close * 500000 +
          c.close * 10000
        ),
      }));

    return candles;
  }

  /**
   * Aggregate daily candles into weekly candles.
   */
  private aggregateToWeekly(dailyCandles: Candle[]): Candle[] {
    if (dailyCandles.length === 0) return [];

    const weeklyMap = new Map<number, { open: number; high: number; low: number; close: number; volume: number; time: number }>();

    for (const c of dailyCandles) {
      const date = new Date(c.time * 1000);
      // Get Monday of the week
      const dayOfWeek = date.getUTCDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(date);
      monday.setUTCDate(date.getUTCDate() + mondayOffset);
      const weekStart = Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate());
      const weekTimestamp = Math.floor(weekStart / 1000);

      const existing = weeklyMap.get(weekTimestamp);
      if (existing) {
        existing.high = Math.max(existing.high, c.high);
        existing.low = Math.min(existing.low, c.low);
        existing.close = c.close;
        existing.volume += c.volume;
      } else {
        weeklyMap.set(weekTimestamp, {
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          time: weekTimestamp,
        });
      }
    }

    return Array.from(weeklyMap.values())
      .sort((a, b) => a.time - b.time)
      .map(c => ({
        time: c.time,
        open: formatPrice(c.open),
        high: formatPrice(c.high),
        low: formatPrice(c.low),
        close: formatPrice(c.close),
        volume: c.volume,
      }));
  }
}

// CoinGecko API response types

interface CoinGeckoPriceData {
  usd?: number;
  usd_24h_change?: number;
  usd_24h_vol?: number;
  usd_24h_high?: number;
  usd_24h_low?: number;
}
