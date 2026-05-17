/**
 * Finnhub Market Data Provider — FREE real-time stocks, forex, crypto.
 *
 * Why Finnhub?
 * - FREE tier: 60 calls/min + WebSocket real-time streams
 * - Covers: US stocks, forex, crypto — all from one API
 * - WebSocket: trades, quotes, news, and candle updates in real-time
 * - Works from US servers (no geo-blocking)
 * - No signup cost — just register for an API key
 *
 * Free tier limits:
 * - 60 API calls/minute
 * - WebSocket: unlimited connections (US stocks only on free)
 * - Historical candles: up to 1 year for stocks
 * - News & sentiment included
 *
 * Finnhub API docs: https://finnhub.io/docs/api
 */

import type { Candle, Quote } from '../types';
import type { MarketDataProvider, SymbolInfo } from './market-data-interface';

// Finnhub candle interval mapping
// Our format: '1m', '5m', '15m', '1H', '4H', '1D', '1W'
// Finnhub format: '1', '5', '15', '60', 'D', 'W', 'M'
function toFinnhubResolution(interval: string): string {
  const map: Record<string, string> = {
    '1m': '1',
    '5m': '5',
    '15m': '15',
    '1H': '60',
    '4H': '240',
    '1D': 'D',
    '1W': 'W',
  };
  return map[interval] || 'D';
}

/**
 * Format symbol for Finnhub API.
 * - Stocks: 'AAPL', 'MSFT' (as-is)
 * - Crypto: 'BINANCE:BTCUSDT' (exchange:pair format)
 * - Forex: 'OANDA:EUR_USD' (broker:pair format)
 */
function toFinnhubSymbol(symbol: string, type: 'stock' | 'crypto' | 'forex' = 'stock'): string {
  const upper = symbol.toUpperCase();

  if (type === 'crypto') {
    // Finnhub crypto format: BINANCE:BTCUSDT
    const pair = upper.endsWith('USDT') || upper.endsWith('BUSD') ? upper : `${upper}USDT`;
    return `BINANCE:${pair}`;
  }

  if (type === 'forex') {
    // Finnhub forex format: OANDA:EUR_USD
    // Common forex pairs
    const forexMap: Record<string, string> = {
      'EURUSD': 'OANDA:EUR_USD',
      'GBPUSD': 'OANDA:GBP_USD',
      'USDJPY': 'OANDA:USD_JPY',
      'USDCHF': 'OANDA:USD_CHF',
      'AUDUSD': 'OANDA:AUD_USD',
      'USDCAD': 'OANDA:USD_CAD',
      'NZDUSD': 'OANDA:NZD_USD',
    };
    return forexMap[upper] || `OANDA:${upper.slice(0, 3)}_${upper.slice(3)}`;
  }

  // Stocks — return as-is
  return upper;
}

/**
 * Detect symbol type based on format.
 */
function detectSymbolType(symbol: string): 'stock' | 'crypto' | 'forex' {
  const upper = symbol.toUpperCase();
  const cryptoSymbols = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT',
    'AVAX', 'MATIC', 'LINK', 'UNI', 'ATOM', 'LTC', 'NEAR', 'AAVE', 'ARB', 'OP',
    'APT', 'SUI', 'SHIB', 'PEPE', 'FIL', 'IMX', 'INJ', 'TIA', 'SEI', 'FET'];
  const forexPairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD'];

  if (cryptoSymbols.includes(upper) || upper.endsWith('USDT') || upper.endsWith('BUSD')) {
    return 'crypto';
  }
  if (forexPairs.includes(upper)) {
    return 'forex';
  }
  return 'stock';
}

interface FinnhubCandleResponse {
  s: string;   // Status: "ok" or "no_data"
  t: number[]; // Timestamps (seconds)
  o: number[]; // Open prices
  h: number[]; // High prices
  l: number[]; // Low prices
  c: number[]; // Close prices
  v: number[]; // Volumes
}

interface FinnhubQuoteResponse {
  c: number;  // Current price
  d: number;  // Change
  dp: number; // Change percent
  h: number;  // High price of the day
  l: number;  // Low price of the day
  o: number;  // Open price of the day
  pc: number; // Previous close price
  t: number;  // Timestamp
}

interface FinnhubSymbolLookup {
  count: number;
  result: {
    description: string;
    displaySymbol: string;
    symbol: string;
    type: string;
  }[];
}

export class FinnhubProvider implements MarketDataProvider {
  readonly name = 'finnhub';
  private apiKey: string;
  private baseUrl = 'https://finnhub.io/api/v1';

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('Finnhub API key is required');
    this.apiKey = apiKey;
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}${endpoint.includes('?') ? '&' : '?'}token=${this.apiKey}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('FINNHUB_RATE_LIMIT: Rate limit exceeded (60/min on free tier)');
      }
      throw new Error(`Finnhub API error: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  async getCandles(symbol: string, days: number = 180, interval: string = '1D'): Promise<Candle[]> {
    const symbolType = detectSymbolType(symbol);
    const finnhubSymbol = toFinnhubSymbol(symbol, symbolType);
    const resolution = toFinnhubResolution(interval);

    const now = Math.floor(Date.now() / 1000);
    const from = now - (days * 86400);

    const data = await this.fetch<FinnhubCandleResponse>(
      `/stock/candle?symbol=${encodeURIComponent(finnhubSymbol)}&resolution=${resolution}&from=${from}&to=${now}`
    );

    if (data.s !== 'ok' || !data.t || data.t.length === 0) {
      throw new Error(`FINNHUB_NO_DATA: No candle data for ${symbol}`);
    }

    return data.t.map((t, i) => ({
      time: t,
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i],
      volume: data.v[i] || 0,
    }));
  }

  async getQuote(symbol: string): Promise<Quote> {
    const symbolType = detectSymbolType(symbol);
    const finnhubSymbol = toFinnhubSymbol(symbol, symbolType);

    if (symbolType === 'crypto') {
      // Crypto quotes use a different endpoint
      return this.getCryptoQuote(symbol, finnhubSymbol);
    }

    const data = await this.fetch<FinnhubQuoteResponse>(
      `/quote?symbol=${encodeURIComponent(finnhubSymbol)}`
    );

    if (!data.c || data.c === 0) {
      throw new Error(`FINNHUB_NO_QUOTE: No quote data for ${symbol}`);
    }

    return {
      symbol: symbol.toUpperCase(),
      name: symbol.toUpperCase(),
      price: data.c,
      change: data.d || 0,
      changePercent: data.dp || 0,
      volume: 0, // Finnhub free doesn't include volume in quote
      high: data.h || data.c,
      low: data.l || data.c,
      open: data.o || data.c,
      prevClose: data.pc || data.c,
    };
  }

  private async getCryptoQuote(symbol: string, _finnhubSymbol: string): Promise<Quote> {
    // Finnhub crypto quote endpoint
    const upper = symbol.toUpperCase();
    const pair = upper.endsWith('USDT') || upper.endsWith('BUSD') ? upper : `${upper}USDT`;

    const data = await this.fetch<{
      [key: string]: {
        c: number[]; // Current price [price, timestamp]
        h: number[]; // High
        l: number[]; // Low
        o: number[]; // Open
        v: number[]; // Volume
      };
    }>(`/crypto/candle?symbol=BINANCE:${pair}&resolution=D&from=${Math.floor(Date.now() / 1000) - 86400}&to=${Math.floor(Date.now() / 1000)}`);

    const priceData = Object.values(data)[0];
    if (!priceData || !priceData.c || priceData.c.length === 0) {
      throw new Error(`FINNHUB_NO_CRYPTO: No crypto data for ${symbol}`);
    }

    const currentPrice = priceData.c[priceData.c.length - 1];
    const openPrice = priceData.o?.[0] || currentPrice;
    const change = currentPrice - openPrice;
    const changePercent = openPrice > 0 ? (change / openPrice) * 100 : 0;

    return {
      symbol: upper,
      name: upper,
      price: currentPrice,
      change,
      changePercent: Math.round(changePercent * 100) / 100,
      volume: priceData.v?.[0] || 0,
      high: priceData.h?.[0] || currentPrice,
      low: priceData.l?.[0] || currentPrice,
      open: openPrice,
      prevClose: openPrice,
    };
  }

  async getMultipleQuotes(symbols: string[]): Promise<Quote[]> {
    // Serialize requests to respect 60/min rate limit
    const quotes: Quote[] = [];
    const maxSymbols = symbols.slice(0, 10); // Limit batch size

    for (const symbol of maxSymbols) {
      try {
        const quote = await this.getQuote(symbol);
        quotes.push(quote);
        // Small delay between requests to avoid rate limits
        if (maxSymbols.indexOf(symbol) < maxSymbols.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        console.warn(`[TradeIQ] Finnhub quote failed for ${symbol}:`, error instanceof Error ? error.message : error);
      }
    }

    return quotes;
  }

  async searchSymbols(query: string): Promise<SymbolInfo[]> {
    const data = await this.fetch<FinnhubSymbolLookup>(
      `/search?q=${encodeURIComponent(query)}`
    );

    if (!data.result || data.result.length === 0) return [];

    return data.result
      .filter(item => item.type === 'Common Stock' || item.type === 'ETF' || item.type === 'Crypto' || item.type === 'Forex')
      .slice(0, 20)
      .map(item => ({
        symbol: item.displaySymbol || item.symbol,
        name: item.description || item.displaySymbol,
        type: item.type === 'Common Stock' ? 'stock' :
              item.type === 'ETF' ? 'etf' :
              item.type === 'Crypto' ? 'crypto' :
              item.type === 'Forex' ? 'forex' : 'stock',
        exchange: item.symbol.split(':')[0] || '',
        currency: 'USD',
      }));
  }

  // ─── Finnhub-Specific Methods ──────────────────────────────────────────

  /**
   * Get market news for a category.
   * Category: 'general', 'forex', 'crypto', 'merger'
   */
  async getNews(category: string = 'general'): Promise<FinnhubNewsItem[]> {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const data = await this.fetch<FinnhubNewsItem[]>(
      `/news?category=${category}&from=${weekAgo}&to=${today}`
    );

    return data || [];
  }

  /**
   * Get company news for a specific symbol.
   */
  async getCompanyNews(symbol: string): Promise<FinnhubNewsItem[]> {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const data = await this.fetch<FinnhubNewsItem[]>(
      `/company-news?symbol=${encodeURIComponent(symbol)}&from=${weekAgo}&to=${today}`
    );

    return data || [];
  }

  /**
   * Get news sentiment for a symbol (buzz, bullish/bearish %).
   */
  async getSentiment(symbol: string): Promise<FinnhubSentiment | null> {
    try {
      const data = await this.fetch<FinnhubSentimentResponse>(
        `/news-sentiment?symbol=${encodeURIComponent(symbol)}`
      );
      if (data.buzz) {
        return {
          symbol,
          buzz: data.buzz.articlesInLastWeek,
          weeklyAverage: data.buzz.articlesInLastWeek,
          bullishPercent: data.sentiment?.bullishPercent || 0,
          bearishPercent: 1 - (data.sentiment?.bullishPercent || 0),
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get economic calendar (earnings, economic events).
   */
  async getEconomicCalendar(): Promise<FinnhubEconomicEvent[]> {
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    try {
      const data = await this.fetch<FinnhubEconomicEvent[]>(
        `/calendar/economic?from=${today}&to=${nextWeek}`
      );
      return data || [];
    } catch {
      return [];
    }
  }

  /**
   * Get earnings calendar for a symbol.
   */
  async getEarnings(symbol: string): Promise<FinnhubEarnings[]> {
    try {
      const data = await this.fetch<{ earningsCalendar: FinnhubEarnings[] }>(
        `/calendar/earnings?symbol=${encodeURIComponent(symbol)}`
      );
      return data.earningsCalendar || [];
    } catch {
      return [];
    }
  }

  /**
   * Check if Finnhub is available (API key valid).
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.fetch('/quote?symbol=AAPL');
      return true;
    } catch {
      return false;
    }
  }
}

// ─── Finnhub-Specific Types ─────────────────────────────────────────────

export interface FinnhubNewsItem {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

export interface FinnhubSentiment {
  symbol: string;
  buzz: number;
  weeklyAverage: number;
  bullishPercent: number;
  bearishPercent: number;
}

interface FinnhubSentimentResponse {
  buzz: {
    articlesInLastWeek: number;
    articlesInLastWeekGlobal: number;
    buzz: number;
    weeklyAverage: number;
  };
  companyNewsScore: {
    sectorAverageBullishPercent: number;
    sectorAverageNewsScore: number;
    bullishPercent: number;
    bearishPercent: number;
    newsScore: number;
  };
  sentiment: {
    bearishPercent: number;
    bullishPercent: number;
  };
}

export interface FinnhubEconomicEvent {
  country: string;
  event: string;
  impact: string; // 'high', 'medium', 'low'
  time: string;
  actual: string | null;
  estimate: string | null;
  prev: string | null;
}

export interface FinnhubEarnings {
  symbol: string;
  name: string;
  date: string;
  epsEstimate: number | null;
  epsActual: number | null;
  hour: string; // 'bmo' (before market open), 'amc' (after market close)
}
