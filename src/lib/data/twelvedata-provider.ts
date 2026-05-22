/**
 * Twelve Data Provider — Stocks, Forex, Crypto, Indices.
 *
 * Why Twelve Data?
 * - FREE tier: 800 API credits/day, 8 credits/min
 * - Covers: US stocks, forex, crypto, indices, ETFs
 * - WebSocket: real-time price streaming
 * - Historical data: up to 30 years daily, intraday for all timeframes
 * - Works from US servers (no geo-blocking)
 *
 * Twelve Data API docs: https://twelvedata.com/docs
 *
 * Rate limits (free tier):
 * - 800 API credits/day (~1 credit per basic call)
 * - 8 credits/min
 * - WS: 2 connections, 20 symbols per connection
 */

import type { Candle, Quote } from '../types';
import type { MarketDataProvider, SymbolInfo } from './market-data-interface';

// ─── Interval Mapping ────────────────────────────────────────────────

function toTwelveDataInterval(interval: string): string {
  const map: Record<string, string> = {
    '1m': '1min',
    '5m': '5min',
    '15m': '15min',
    '1H': '1h',
    '4H': '4h',
    '1D': '1day',
    '1W': '1week',
  };
  return map[interval] || '1day';
}

/**
 * Format symbol for Twelve Data API.
 * - Stocks: 'AAPL' (as-is)
 * - Crypto: 'BTC/USD'
 * - Forex: 'EUR/USD'
 * - Indices: 'SPX' (S&P 500), 'NDX' (Nasdaq), 'DJI' (Dow Jones)
 */
function toTwelveDataSymbol(symbol: string): string {
  const upper = symbol.toUpperCase();

  // Known crypto symbols → BTC/USD format
  const cryptoSymbols = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT',
    'AVAX', 'MATIC', 'LINK', 'UNI', 'ATOM', 'LTC', 'NEAR', 'AAVE', 'ARB', 'OP',
    'APT', 'SUI', 'SHIB', 'PEPE', 'FIL', 'IMX', 'INJ', 'TIA', 'SEI', 'FET'];
  if (cryptoSymbols.includes(upper)) {
    return `${upper}/USD`;
  }

  // Known forex pairs → EUR/USD format
  const forexMap: Record<string, string> = {
    'EURUSD': 'EUR/USD',
    'GBPUSD': 'GBP/USD',
    'USDJPY': 'USD/JPY',
    'USDCHF': 'USD/CHF',
    'AUDUSD': 'AUD/USD',
    'USDCAD': 'USD/CAD',
    'NZDUSD': 'NZD/USD',
  };
  if (forexMap[upper]) {
    return forexMap[upper];
  }

  // Known indices
  const indicesMap: Record<string, string> = {
    'SPY': 'SPY',    // S&P 500 ETF (proxy)
    'QQQ': 'QQQ',    // Nasdaq 100 ETF (proxy)
    'DIA': 'DIA',    // Dow Jones ETF (proxy)
  };
  if (indicesMap[upper]) {
    return indicesMap[upper];
  }

  // Default: return as-is (stocks)
  return upper;
}

/**
 * Detect if a symbol is forex.
 */
function isForexSymbol(symbol: string): boolean {
  const forexPairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD'];
  return forexPairs.includes(symbol.toUpperCase());
}

// ─── API Response Types ──────────────────────────────────────────────

interface TwelveDataCandleResponse {
  meta: {
    symbol: string;
    interval: string;
    currency: string;
    exchange: string;
    type: string;
  };
  values: {
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }[];
  status: string;
}

interface TwelveDataQuoteResponse {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  datetime: string;
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  previous_close: string;
  change: string;
  percent_change: string;
}

interface TwelveDataSymbolSearch {
  data: {
    symbol: string;
    name: string;
    currency: string;
    exchange: string;
    mic_code: string;
    type: string;
  }[];
  status: string;
}

// ─── Twelve Data Provider ────────────────────────────────────────────

export class TwelveDataProvider implements MarketDataProvider {
  readonly name = 'twelvedata';
  private apiKey: string;
  private baseUrl = 'https://api.twelvedata.com';

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('Twelve Data API key is required');
    this.apiKey = apiKey;
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}${endpoint.includes('?') ? '&' : '?'}apikey=${this.apiKey}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('TWELVEDATA_RATE_LIMIT: Rate limit exceeded (8 credits/min, 800/day on free tier)');
      }
      throw new Error(`Twelve Data API error: ${response.status}`);
    }

    const data = await response.json() as T & { status?: string; message?: string; code?: number };

    // Twelve Data returns errors with status: "error"
    if (data && typeof data === 'object' && 'status' in data && data.status === 'error') {
      const errMsg = 'message' in data ? data.message : 'Unknown Twelve Data error';
      throw new Error(`TWELVEDATA_ERROR: ${errMsg}`);
    }

    return data as T;
  }

  async getCandles(symbol: string, days: number = 180, interval: string = '1D'): Promise<Candle[]> {
    const tdSymbol = toTwelveDataSymbol(symbol);
    const tdInterval = toTwelveDataInterval(interval);

    // Calculate outputsize (number of candles)
    const outputsize = Math.min(days, 5000); // Twelve Data max

    const data = await this.fetch<TwelveDataCandleResponse>(
      `/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=${tdInterval}&outputsize=${outputsize}`
    );

    if (!data.values || data.values.length === 0) {
      throw new Error(`TWELVEDATA_NO_DATA: No candle data for ${symbol}`);
    }

    return data.values.map(v => ({
      time: Math.floor(new Date(v.datetime).getTime() / 1000),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseInt(v.volume) || 0,
    })).sort((a, b) => a.time - b.time);
  }

  async getQuote(symbol: string): Promise<Quote> {
    const tdSymbol = toTwelveDataSymbol(symbol);

    const data = await this.fetch<TwelveDataQuoteResponse>(
      `/quote?symbol=${encodeURIComponent(tdSymbol)}`
    );

    if (!data.close || parseFloat(data.close) === 0) {
      throw new Error(`TWELVEDATA_NO_QUOTE: No quote data for ${symbol}`);
    }

    const price = parseFloat(data.close);
    const prevClose = parseFloat(data.previous_close) || price;
    const change = parseFloat(data.change) || (price - prevClose);
    const changePercent = parseFloat(data.percent_change) || (prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0);

    return {
      symbol: symbol.toUpperCase(),
      name: data.name || symbol.toUpperCase(),
      price,
      change,
      changePercent: Math.round(changePercent * 100) / 100,
      volume: parseInt(data.volume) || 0,
      high: parseFloat(data.high) || price,
      low: parseFloat(data.low) || price,
      open: parseFloat(data.open) || price,
      prevClose,
    };
  }

  async getMultipleQuotes(symbols: string[]): Promise<Quote[]> {
    // Twelve Data supports batch quotes with comma-separated symbols
    const tdSymbols = symbols.map(toTwelveDataSymbol);
    const maxSymbols = tdSymbols.slice(0, 10); // Limit batch size

    try {
      const data = await this.fetch<Record<string, TwelveDataQuoteResponse>>(
        `/quote?symbol=${maxSymbols.map(s => encodeURIComponent(s)).join(',')}`
      );

      const quotes: Quote[] = [];
      for (const [tdSymbol, quoteData] of Object.entries(data)) {
        if (!quoteData || typeof quoteData !== 'object' || !quoteData.close) continue;

        const originalSymbol = symbols.find(s => toTwelveDataSymbol(s) === tdSymbol) || tdSymbol;
        const price = parseFloat(quoteData.close);
        const prevClose = parseFloat(quoteData.previous_close) || price;

        quotes.push({
          symbol: originalSymbol.toUpperCase(),
          name: quoteData.name || originalSymbol.toUpperCase(),
          price,
          change: parseFloat(quoteData.change) || (price - prevClose),
          changePercent: parseFloat(quoteData.percent_change) || 0,
          volume: parseInt(quoteData.volume) || 0,
          high: parseFloat(quoteData.high) || price,
          low: parseFloat(quoteData.low) || price,
          open: parseFloat(quoteData.open) || price,
          prevClose,
        });
      }

      return quotes;
    } catch {
      // Batch failed — try one by one (slower but more reliable)
      const quotes: Quote[] = [];
      for (const symbol of symbols.slice(0, 5)) {
        try {
          const quote = await this.getQuote(symbol);
          quotes.push(quote);
          // Small delay to respect rate limit
          await new Promise(resolve => setTimeout(resolve, 250));
        } catch {
          // Skip failed symbols
        }
      }
      return quotes;
    }
  }

  async searchSymbols(query: string): Promise<SymbolInfo[]> {
    const data = await this.fetch<TwelveDataSymbolSearch>(
      `/symbol_search?symbol=${encodeURIComponent(query)}`
    );

    if (!data.data || data.data.length === 0) return [];

    return data.data
      .filter(item => ['Common Stock', 'ETF', 'Index', 'Currency Pair', 'Cryptocurrency'].includes(item.type))
      .slice(0, 20)
      .map(item => ({
        symbol: item.symbol,
        name: item.name || item.symbol,
        type: item.type === 'Common Stock' ? 'stock' :
              item.type === 'ETF' ? 'etf' :
              item.type === 'Index' ? 'index' :
              item.type === 'Currency Pair' ? 'forex' :
              item.type === 'Cryptocurrency' ? 'crypto' : 'stock',
        exchange: item.exchange || item.mic_code || '',
        currency: item.currency || 'USD',
      }));
  }

  /**
   * Check if Twelve Data is available (API key valid).
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
