import type { Candle, Quote } from '../types';
import type { MarketDataProvider, SymbolInfo } from './market-data-interface';

/**
 * Binance Market Data Provider — free, real-time crypto data.
 * No API key required — all endpoints used are public.
 *
 * Rate limits: 1200 requests/min (very generous)
 * Base URL: https://api.binance.com
 *
 * Supported symbols: BTC, ETH, BNB, SOL, XRP, ADA, DOGE, DOT, AVAX, MATIC, etc.
 * All pairs are quoted in USDT.
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
  'ATOM': { name: 'Cosmos', pair: 'ATUSDT' },
  'LTC': { name: 'Litecoin', pair: 'LTCUSDT' },
  'NEAR': { name: 'NEAR Protocol', pair: 'NEARUSDT' },
  'AAVE': { name: 'Aave', pair: 'AAVEUSDT' },
  'ARB': { name: 'Arbitrum', pair: 'ARBUSDT' },
  'OP': { name: 'Optimism', pair: 'OPUSDT' },
  'APT': { name: 'Aptos', pair: 'APTUSDT' },
  'SUI': { name: 'Sui', pair: 'SUIUSDT' },
};

/**
 * Check if a symbol is likely a cryptocurrency.
 * Used by the SmartProvider to route to Binance.
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

export class BinanceProvider implements MarketDataProvider {
  readonly name = 'binance';
  private baseUrl = 'https://api.binance.com';
  private exchangeInfoCache: Map<string, string> | null = null;

  async getCandles(symbol: string, days: number = 180): Promise<Candle[]> {
    const pair = toBinancePair(symbol);
    const limit = Math.min(days, 1000); // Binance max 1000 per request

    const url = `${this.baseUrl}/api/v3/klines?symbol=${pair}&interval=1d&limit=${limit}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as BinanceKline[];

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
    const url = `${this.baseUrl}/api/v3/ticker/24hr?symbol=${pair}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as Binance24hrTicker;

    const price = parseFloat(data.lastPrice);
    const prevClose = parseFloat(data.prevClosePrice);
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol: upper,
      name,
      price: Math.round(price * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      volume: Math.floor(parseFloat(data.volume) * price), // Quote volume in USD
      high: Math.round(parseFloat(data.highPrice) * 100) / 100,
      low: Math.round(parseFloat(data.lowPrice) * 100) / 100,
      open: Math.round(parseFloat(data.openPrice) * 100) / 100,
      prevClose: Math.round(prevClose * 100) / 100,
    };
  }

  async getMultipleQuotes(symbols: string[]): Promise<Quote[]> {
    // Binance doesn't have a batch quote endpoint, so we fetch in parallel
    // (within rate limits — 1200/min is very generous)
    const quotes = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          return await this.getQuote(symbol);
        } catch {
          console.warn(`[TradeIQ] Failed to fetch Binance quote for ${symbol}`);
          return null;
        }
      })
    );

    return quotes.filter((q): q is Quote => q !== null);
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
   * This is a large response so we cache it for 1 hour.
   */
  private async getExchangeInfo(): Promise<Map<string, string>> {
    if (this.exchangeInfoCache) return this.exchangeInfoCache;

    const response = await fetch(`${this.baseUrl}/api/v3/exchangeInfo`);
    if (!response.ok) return new Map();

    const data = await response.json() as BinanceExchangeInfo;

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
 * Each kline is an array with fixed positions:
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
