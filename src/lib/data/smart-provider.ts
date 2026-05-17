import type { Candle, Quote } from '../types';
import type { MarketDataProvider, SymbolInfo } from './market-data-interface';
import { MockProvider } from './mock-provider';
import { PolygonProvider } from './polygon-provider';
import { BinanceProvider, isCryptoSymbol } from './binance-provider';
import { CoinGeckoProvider } from './coingecko-provider';
import { DataCache } from './market-data-interface';

/**
 * Smart Provider — routes requests to the best available data source.
 *
 * Routing logic:
 * - Crypto symbols → CoinGecko (primary, works everywhere including US)
 *                    → Binance (secondary, may be geo-blocked from US)
 *                    → Mock (fallback)
 * - Stock/ETF symbols → PolygonProvider (if API key set) or MockProvider
 * - Fallback: MockProvider for any symbol that fails
 *
 * CRITICAL: Crypto and stock fetches run IN PARALLEL to prevent
 * serverless function timeouts. If crypto takes 8s, stocks still
 * return instantly from mock.
 */

/** Maximum time (ms) to wait for any single provider before falling back */
const PROVIDER_TIMEOUT = 8000;

/** Maximum time (ms) for the entire getMultipleQuotes operation */
const _BATCH_TIMEOUT = 10000;

/**
 * Race a promise against a timeout — returns null if the promise takes too long.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>(resolve =>
      setTimeout(() => {
        console.warn(`[TradeIQ] ${label} timed out after ${ms}ms`);
        resolve(null);
      }, ms)
    ),
  ]);
}

export class SmartProvider implements MarketDataProvider {
  readonly name = 'smart';
  private coingecko: CoinGeckoProvider;
  private binance: BinanceProvider;
  private polygon: PolygonProvider | null = null;
  private mock: MockProvider;
  private hasPolygonKey: boolean;

  // Cache for crypto quotes to avoid hitting APIs on every request
  private cryptoQuoteCache = new Map<string, { data: Quote; timestamp: number }>();
  private cryptoQuoteCacheTtl = 30_000; // 30s

  constructor(polygonApiKey?: string) {
    this.coingecko = new CoinGeckoProvider();
    this.binance = new BinanceProvider();
    this.mock = new MockProvider();
    this.hasPolygonKey = Boolean(polygonApiKey && polygonApiKey.length > 0);

    if (this.hasPolygonKey && polygonApiKey) {
      const cache = new DataCache(60_000);
      this.polygon = new PolygonProvider(polygonApiKey, cache);
    }
  }

  async getCandles(symbol: string, days: number = 180, interval: string = '1D'): Promise<Candle[]> {
    if (isCryptoSymbol(symbol)) {
      // For intraday crypto, try Binance first (CoinGecko free doesn't support intraday)
      // For daily/weekly, try CoinGecko first (more reliable from US servers)
      const providers = ['1D', '1W'].includes(interval)
        ? [this.coingecko, this.binance, this.mock]
        : [this.binance, this.coingecko, this.mock];
      return this.getCandlesWithFallback(symbol, days, interval, providers);
    }

    // Stocks: Polygon or Mock
    const provider = this.getStockProvider();
    try {
      const result = await withTimeout(
        provider.getCandles(symbol, days, interval),
        PROVIDER_TIMEOUT,
        `${provider.name}.getCandles(${symbol})`
      );
      return result ?? this.mock.getCandles(symbol, days, interval);
    } catch {
      console.warn(`[TradeIQ] ${provider.name} failed for getCandles(${symbol}), using mock`);
      return this.mock.getCandles(symbol, days, interval);
    }
  }

  async getQuote(symbol: string): Promise<Quote> {
    if (isCryptoSymbol(symbol)) {
      return this.getCryptoQuote(symbol);
    }

    // Stocks: Polygon or Mock
    const provider = this.getStockProvider();
    try {
      const result = await withTimeout(
        provider.getQuote(symbol),
        PROVIDER_TIMEOUT,
        `${provider.name}.getQuote(${symbol})`
      );
      return result ?? this.mock.getQuote(symbol);
    } catch {
      console.warn(`[TradeIQ] ${provider.name} failed for getQuote(${symbol}), using mock`);
      return this.mock.getQuote(symbol);
    }
  }

  async getMultipleQuotes(symbols: string[]): Promise<Quote[]> {
    const startTime = Date.now();

    const cryptoSymbols = symbols.filter(isCryptoSymbol);
    const stockSymbols = symbols.filter(s => !isCryptoSymbol(s));

    // ============================================================
    // CRITICAL: Run crypto and stock fetches IN PARALLEL!
    // Previously they were sequential — if crypto took 8s from
    // CoinGecko, the 9s route timeout would expire before stocks
    // could be fetched. Now both run simultaneously, so stocks
    // (from mock) return instantly regardless of crypto latency.
    // ============================================================

    const [cryptoResult, stockResult] = await Promise.allSettled([
      // Crypto path: CoinGecko → Binance → Mock
      cryptoSymbols.length > 0
        ? this.fetchCryptoQuotes(cryptoSymbols)
        : Promise.resolve([] as Quote[]),

      // Stock path: Polygon or Mock (instant if mock)
      stockSymbols.length > 0
        ? this.fetchStockQuotes(stockSymbols)
        : Promise.resolve([] as Quote[]),
    ]);

    const quotes: Quote[] = [];

    // Collect crypto quotes
    if (cryptoResult.status === 'fulfilled' && cryptoResult.value.length > 0) {
      quotes.push(...cryptoResult.value);

      // Fill in any missing crypto with mock
      const receivedSymbols = new Set(cryptoResult.value.map(q => q.symbol));
      const missingCrypto = cryptoSymbols.filter(s =>
        !receivedSymbols.has(s) && !receivedSymbols.has(s.replace('USDT', '').replace('BUSD', ''))
      );
      if (missingCrypto.length > 0) {
        const mockQuotes = await this.mock.getMultipleQuotes(missingCrypto);
        quotes.push(...mockQuotes);
      }
    } else {
      // All crypto providers failed — use mock for ALL crypto
      if (cryptoSymbols.length > 0) {
        const mockQuotes = await this.mock.getMultipleQuotes(cryptoSymbols);
        quotes.push(...mockQuotes);
      }
    }

    // Collect stock quotes
    if (stockResult.status === 'fulfilled' && stockResult.value.length > 0) {
      quotes.push(...stockResult.value);

      // Fill in any missing stocks with mock
      const receivedStockSymbols = new Set(stockResult.value.map(q => q.symbol));
      const missingStocks = stockSymbols.filter(s => !receivedStockSymbols.has(s));
      if (missingStocks.length > 0) {
        const mockQuotes = await this.mock.getMultipleQuotes(missingStocks);
        quotes.push(...mockQuotes);
      }
    } else {
      // Stock providers failed — use mock for ALL stocks
      if (stockSymbols.length > 0) {
        const mockQuotes = await this.mock.getMultipleQuotes(stockSymbols);
        quotes.push(...mockQuotes);
      }
    }

    const elapsed = Date.now() - startTime;
    if (elapsed > 3000) {
      console.warn(`[TradeIQ] getMultipleQuotes took ${elapsed}ms for ${symbols.length} symbols`);
    }

    // Return in the same order as input
    const quoteMap = new Map(quotes.map(q => [q.symbol, q]));
    return symbols
      .map(s => {
        const upper = s.toUpperCase();
        // Try exact match first, then without USDT/BUSD suffix
        return quoteMap.get(upper) ||
               quoteMap.get(upper.replace('USDT', '').replace('BUSD', ''));
      })
      .filter((q): q is Quote => q !== undefined);
  }

  async searchSymbols(query: string): Promise<SymbolInfo[]> {
    // Search CoinGecko (crypto) and stocks in parallel
    const results = await Promise.allSettled([
      withTimeout(this.coingecko.searchSymbols(query), 5000, 'coingecko.search'),
      withTimeout(this.getStockProvider().searchSymbols(query), 5000, 'stock.search'),
    ]);

    const combined: SymbolInfo[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        combined.push(...result.value);
      }
    }

    // Deduplicate by symbol
    const seen = new Set<string>();
    return combined.filter(item => {
      if (seen.has(item.symbol)) return false;
      seen.add(item.symbol);
      return true;
    });
  }

  /**
   * Get the list of active providers for display.
   */
  getActiveProviders(): string[] {
    const providers = ['coingecko']; // Primary crypto (works everywhere)
    providers.push('binance'); // Secondary crypto
    if (this.hasPolygonKey) providers.push('polygon');
    providers.push('mock'); // Always available as fallback
    return providers;
  }

  /**
   * Check if Polygon (stock data) is available.
   */
  hasPolygon(): boolean {
    return this.hasPolygonKey;
  }

  // --- Private helpers ---

  /**
   * Fetch stock quotes — tries Polygon first, falls back to Mock (instant).
   * Runs IN PARALLEL with crypto fetches in getMultipleQuotes.
   */
  private async fetchStockQuotes(symbols: string[]): Promise<Quote[]> {
    const provider = this.getStockProvider();
    try {
      const result = await withTimeout(
        provider.getMultipleQuotes(symbols),
        5000, // 5s max — mock is instant, Polygon has its own limits
        `${provider.name}.getMultipleQuotes(stocks)`
      );
      if (result && result.length > 0) {
        return result;
      }
    } catch {
      // Provider failed, fall through to mock
    }
    // Fallback to mock
    return this.mock.getMultipleQuotes(symbols);
  }

  /**
   * Fetch crypto quotes with intelligent fallback chain.
   * 1. Try CoinGecko batch (fast, one request for all)
   * 2. If CoinGecko fails/times out, try Binance (max 5 symbols)
   * 3. Any still missing → Mock
   */
  private async fetchCryptoQuotes(symbols: string[]): Promise<Quote[]> {
    // Try CoinGecko first (batch request — very efficient)
    const cgResult = await withTimeout(
      this.coingecko.getMultipleQuotes(symbols),
      8000, // 8s max for CoinGecko
      'CoinGecko.getMultipleQuotes'
    );

    if (cgResult && cgResult.length > 0) {
      // CoinGecko returned some data — check if we got everything
      const receivedSymbols = new Set(cgResult.map(q => q.symbol));
      const missing = symbols.filter(s =>
        !receivedSymbols.has(s) && !receivedSymbols.has(s.replace('USDT', '').replace('BUSD', ''))
      );

      if (missing.length === 0) {
        return cgResult; // Got everything from CoinGecko!
      }

      // Try Binance for just the missing ones (max 5 to limit latency)
      try {
        const binanceMissing = missing.slice(0, 5);
        const binanceQuotes = await withTimeout(
          this.binance.getMultipleQuotes(binanceMissing),
          5000, // Reduced from 6s to 5s
          'Binance.getMultipleQuotes(missing)'
        );
        if (binanceQuotes && binanceQuotes.length > 0) {
          return [...cgResult, ...binanceQuotes];
        }
      } catch {
        // Binance also failed for missing ones
      }

      return cgResult; // Return what we have from CoinGecko
    }

    // CoinGecko entirely failed/timed out — try Binance for up to 5 symbols
    console.warn('[TradeIQ] CoinGecko batch failed/timed out, trying Binance...');
    const binanceSymbols = symbols.slice(0, 5);
    const binanceResult = await withTimeout(
      this.binance.getMultipleQuotes(binanceSymbols),
      5000, // Reduced from 6s
      'Binance.getMultipleQuotes'
    );

    if (binanceResult && binanceResult.length > 0) {
      return binanceResult;
    }

    // Both failed — return empty to trigger mock fallback
    throw new Error('All crypto providers failed');
  }

  private async getCryptoQuote(symbol: string): Promise<Quote> {
    // Check cache first
    const cached = this.cryptoQuoteCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < this.cryptoQuoteCacheTtl) {
      return cached.data;
    }

    // Try CoinGecko first (works from US servers)
    const cgQuote = await withTimeout(
      this.coingecko.getQuote(symbol),
      8000,
      `CoinGecko.getQuote(${symbol})`
    );

    if (cgQuote) {
      this.cryptoQuoteCache.set(symbol, { data: cgQuote, timestamp: Date.now() });
      return cgQuote;
    }

    // Try Binance
    const binQuote = await withTimeout(
      this.binance.getQuote(symbol),
      5000,
      `Binance.getQuote(${symbol})`
    );

    if (binQuote) {
      this.cryptoQuoteCache.set(symbol, { data: binQuote, timestamp: Date.now() });
      return binQuote;
    }

    // Final fallback to mock
    return this.mock.getQuote(symbol);
  }

  private async getCandlesWithFallback(
    symbol: string,
    days: number,
    interval: string,
    providers: MarketDataProvider[]
  ): Promise<Candle[]> {
    for (const provider of providers) {
      try {
        const result = await withTimeout(
          provider.getCandles(symbol, days, interval),
          PROVIDER_TIMEOUT,
          `${provider.name}.getCandles(${symbol}, ${interval})`
        );
        if (result && result.length > 0) return result;
      } catch (error) {
        console.warn(
          `[TradeIQ] ${provider.name} failed for getCandles(${symbol}, ${interval}):`,
          error instanceof Error ? error.message : 'unknown error'
        );
      }
    }
    // Last resort: generate mock
    return this.mock.getCandles(symbol, days, interval);
  }

  private getStockProvider(): MarketDataProvider {
    return this.polygon || this.mock;
  }
}
