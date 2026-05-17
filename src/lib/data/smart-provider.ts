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
 * PERFORMANCE: All operations have a hard timeout to prevent Vercel
 * serverless function timeouts. We prefer fast partial results over
 * slow complete results.
 */

/** Maximum time (ms) to wait for any single provider before falling back */
const PROVIDER_TIMEOUT = 8000;

/** Maximum time (ms) for the entire getMultipleQuotes operation */
const BATCH_TIMEOUT = 12000;

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

    const quotes: Quote[] = [];

    // Fetch crypto quotes — race CoinGecko vs Binance, with mock as safety net
    if (cryptoSymbols.length > 0) {
      try {
        const cryptoQuotes = await withTimeout(
          this.fetchCryptoQuotes(cryptoSymbols),
          BATCH_TIMEOUT,
          'fetchCryptoQuotes'
        );

        if (cryptoQuotes && cryptoQuotes.length > 0) {
          quotes.push(...cryptoQuotes);

          // Fill in any missing crypto with mock
          const receivedSymbols = new Set(cryptoQuotes.map(q => q.symbol));
          const missingCrypto = cryptoSymbols.filter(s =>
            !receivedSymbols.has(s) && !receivedSymbols.has(s.replace('USDT', '').replace('BUSD', ''))
          );

          if (missingCrypto.length > 0) {
            const mockQuotes = await this.mock.getMultipleQuotes(missingCrypto);
            quotes.push(...mockQuotes);
          }
        } else {
          // All providers failed/timed out — use mock for all crypto
          const mockQuotes = await this.mock.getMultipleQuotes(cryptoSymbols);
          quotes.push(...mockQuotes);
        }
      } catch (error) {
        console.warn('[TradeIQ] Crypto quote fetch failed entirely, using mock:', error instanceof Error ? error.message : error);
        const mockQuotes = await this.mock.getMultipleQuotes(cryptoSymbols);
        quotes.push(...mockQuotes);
      }
    }

    // Fetch stocks from Polygon or Mock (fast, mock is instant)
    if (stockSymbols.length > 0) {
      try {
        const stockResult = await withTimeout(
          this.getStockProvider().getMultipleQuotes(stockSymbols),
          PROVIDER_TIMEOUT,
          'stockQuotes'
        );
        if (stockResult && stockResult.length > 0) {
          quotes.push(...stockResult);
        } else {
          const mockQuotes = await this.mock.getMultipleQuotes(stockSymbols);
          quotes.push(...mockQuotes);
        }
      } catch {
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
          6000,
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
      6000,
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
