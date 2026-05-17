import type { Candle, Quote } from '../types';
import type { MarketDataProvider, SymbolInfo } from './market-data-interface';
import { MockProvider } from './mock-provider';
import { PolygonProvider } from './polygon-provider';
import { BinanceProvider, isCryptoSymbol } from './binance-provider';
import { DataCache } from './market-data-interface';

/**
 * Smart Provider — routes requests to the best available data source.
 *
 * Routing logic:
 * - Crypto symbols (BTC, ETH, etc.) → BinanceProvider (free, real-time)
 * - Stock/ETF symbols (AAPL, NVDA, etc.) → PolygonProvider (if API key set) or MockProvider
 * - Fallback: MockProvider for any symbol that fails
 *
 * This is the main provider used by the application. It combines multiple
 * data sources transparently so the user always gets the best available data.
 */
export class SmartProvider implements MarketDataProvider {
  readonly name = 'smart';
  private binance: BinanceProvider;
  private polygon: PolygonProvider | null = null;
  private mock: MockProvider;
  private hasPolygonKey: boolean;

  constructor(polygonApiKey?: string) {
    this.binance = new BinanceProvider();
    this.mock = new MockProvider();
    this.hasPolygonKey = Boolean(polygonApiKey && polygonApiKey.length > 0);

    if (this.hasPolygonKey && polygonApiKey) {
      const cache = new DataCache(60_000);
      this.polygon = new PolygonProvider(polygonApiKey, cache);
    }
  }

  async getCandles(symbol: string, days: number = 180): Promise<Candle[]> {
    const provider = this.getProviderForSymbol(symbol);
    try {
      return await provider.getCandles(symbol, days);
    } catch {
      // Fallback to mock on failure
      console.warn(`[TradeIQ] ${provider.name} failed for getCandles(${symbol}), using mock`);
      return this.mock.getCandles(symbol, days);
    }
  }

  async getQuote(symbol: string): Promise<Quote> {
    const provider = this.getProviderForSymbol(symbol);
    try {
      return await provider.getQuote(symbol);
    } catch {
      console.warn(`[TradeIQ] ${provider.name} failed for getQuote(${symbol}), using mock`);
      return this.mock.getQuote(symbol);
    }
  }

  async getMultipleQuotes(symbols: string[]): Promise<Quote[]> {
    // Group symbols by provider for batch efficiency
    const cryptoSymbols = symbols.filter(isCryptoSymbol);
    const stockSymbols = symbols.filter(s => !isCryptoSymbol(s));

    const quotes: Quote[] = [];

    // Fetch crypto from Binance (parallel)
    if (cryptoSymbols.length > 0) {
      try {
        const cryptoQuotes = await this.binance.getMultipleQuotes(cryptoSymbols);
        quotes.push(...cryptoQuotes);
      } catch {
        // Fallback to mock for failed crypto
        const mockQuotes = await Promise.all(
          cryptoSymbols.map(s => this.mock.getQuote(s).catch(() => null))
        );
        quotes.push(...mockQuotes.filter((q): q is Quote => q !== null));
      }
    }

    // Fetch stocks from Polygon or Mock
    if (stockSymbols.length > 0) {
      try {
        const stockQuotes = await this.getStockProvider().getMultipleQuotes(stockSymbols);
        quotes.push(...stockQuotes);
      } catch {
        const mockQuotes = await Promise.all(
          stockSymbols.map(s => this.mock.getQuote(s).catch(() => null))
        );
        quotes.push(...mockQuotes.filter((q): q is Quote => q !== null));
      }
    }

    // Return in the same order as input
    const quoteMap = new Map(quotes.map(q => [q.symbol, q]));
    return symbols
      .map(s => quoteMap.get(s.toUpperCase().replace('USDT', '').replace('BUSD', '')) || quoteMap.get(s))
      .filter((q): q is Quote => q !== null);
  }

  async searchSymbols(query: string): Promise<SymbolInfo[]> {
    // Search both crypto and stocks in parallel
    const results = await Promise.allSettled([
      this.binance.searchSymbols(query),
      this.getStockProvider().searchSymbols(query),
    ]);

    const combined: SymbolInfo[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
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
    const providers = ['binance']; // Always available (free)
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

  private getProviderForSymbol(symbol: string): MarketDataProvider {
    if (isCryptoSymbol(symbol)) {
      return this.binance;
    }
    return this.getStockProvider();
  }

  private getStockProvider(): MarketDataProvider {
    return this.polygon || this.mock;
  }
}
