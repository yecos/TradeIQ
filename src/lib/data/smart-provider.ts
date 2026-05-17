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
 * IMPORTANT: CoinGecko is the primary crypto provider because it works from
 * ANY location (including US-based servers like Vercel). Binance is kept as
 * secondary because binance.com is geo-blocked from US and binance.us has
 * limited trading pairs.
 */
export class SmartProvider implements MarketDataProvider {
  readonly name = 'smart';
  private coingecko: CoinGeckoProvider;
  private binance: BinanceProvider;
  private polygon: PolygonProvider | null = null;
  private mock: MockProvider;
  private hasPolygonKey: boolean;

  // Cache for crypto quotes to avoid hitting APIs on every request
  private cryptoQuoteCache = new Map<string, { data: Quote; timestamp: number }>();
  private cryptoQuoteCacheTtl = 15_000; // 15s

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

  async getCandles(symbol: string, days: number = 180): Promise<Candle[]> {
    if (isCryptoSymbol(symbol)) {
      // Try CoinGecko first (works from US), then Binance, then Mock
      return this.getCandlesWithFallback(symbol, days, [
        this.coingecko,
        this.binance,
        this.mock,
      ]);
    }

    // Stocks: Polygon or Mock
    const provider = this.getStockProvider();
    try {
      return await provider.getCandles(symbol, days);
    } catch {
      console.warn(`[TradeIQ] ${provider.name} failed for getCandles(${symbol}), using mock`);
      return this.mock.getCandles(symbol, days);
    }
  }

  async getQuote(symbol: string): Promise<Quote> {
    if (isCryptoSymbol(symbol)) {
      return this.getCryptoQuote(symbol);
    }

    // Stocks: Polygon or Mock
    const provider = this.getStockProvider();
    try {
      return await provider.getQuote(symbol);
    } catch {
      console.warn(`[TradeIQ] ${provider.name} failed for getQuote(${symbol}), using mock`);
      return this.mock.getQuote(symbol);
    }
  }

  async getMultipleQuotes(symbols: string[]): Promise<Quote[]> {
    const cryptoSymbols = symbols.filter(isCryptoSymbol);
    const stockSymbols = symbols.filter(s => !isCryptoSymbol(s));

    const quotes: Quote[] = [];

    // Fetch all crypto from CoinGecko in ONE batch request (very efficient)
    if (cryptoSymbols.length > 0) {
      try {
        const cryptoQuotes = await this.coingecko.getMultipleQuotes(cryptoSymbols);
        quotes.push(...cryptoQuotes);

        // Fill in any missing crypto from Binance or Mock
        const receivedSymbols = new Set(cryptoQuotes.map(q => q.symbol));
        const missingCrypto = cryptoSymbols.filter(s => !receivedSymbols.has(s));

        if (missingCrypto.length > 0) {
          // Try Binance for missing ones
          try {
            const binanceQuotes = await this.binance.getMultipleQuotes(missingCrypto);
            quotes.push(...binanceQuotes);

            const stillMissing = missingCrypto.filter(
              s => !binanceQuotes.some(q => q.symbol === s)
            );
            // Final fallback to Mock for anything still missing
            if (stillMissing.length > 0) {
              const mockQuotes = await this.mock.getMultipleQuotes(stillMissing);
              quotes.push(...mockQuotes);
            }
          } catch {
            // Binance failed, use mock for all missing
            const mockQuotes = await this.mock.getMultipleQuotes(missingCrypto);
            quotes.push(...mockQuotes);
          }
        }
      } catch {
        // CoinGecko entirely failed — fall back to Binance then Mock
        console.warn('[TradeIQ] CoinGecko batch failed, trying Binance...');
        try {
          const binanceQuotes = await this.binance.getMultipleQuotes(cryptoSymbols);
          quotes.push(...binanceQuotes);

          const receivedSymbols = new Set(binanceQuotes.map(q => q.symbol));
          const missingCrypto = cryptoSymbols.filter(s => !receivedSymbols.has(s));
          if (missingCrypto.length > 0) {
            const mockQuotes = await this.mock.getMultipleQuotes(missingCrypto);
            quotes.push(...mockQuotes);
          }
        } catch {
          // Both CoinGecko and Binance failed — use mock
          console.warn('[TradeIQ] Both CoinGecko and Binance failed, using mock for crypto');
          const mockQuotes = await this.mock.getMultipleQuotes(cryptoSymbols);
          quotes.push(...mockQuotes);
        }
      }
    }

    // Fetch stocks from Polygon or Mock
    if (stockSymbols.length > 0) {
      try {
        const stockQuotes = await this.getStockProvider().getMultipleQuotes(stockSymbols);
        quotes.push(...stockQuotes);
      } catch {
        const mockQuotes = await this.mock.getMultipleQuotes(stockSymbols);
        quotes.push(...mockQuotes);
      }
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
      this.coingecko.searchSymbols(query),
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

  private async getCryptoQuote(symbol: string): Promise<Quote> {
    // Check cache first
    const cached = this.cryptoQuoteCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < this.cryptoQuoteCacheTtl) {
      return cached.data;
    }

    // Try CoinGecko first (works from US servers)
    try {
      const quote = await this.coingecko.getQuote(symbol);
      this.cryptoQuoteCache.set(symbol, { data: quote, timestamp: Date.now() });
      return quote;
    } catch {
      console.warn(`[TradeIQ] CoinGecko failed for ${symbol}, trying Binance...`);
    }

    // Try Binance
    try {
      const quote = await this.binance.getQuote(symbol);
      this.cryptoQuoteCache.set(symbol, { data: quote, timestamp: Date.now() });
      return quote;
    } catch {
      console.warn(`[TradeIQ] Binance also failed for ${symbol}, using mock`);
    }

    // Final fallback to mock
    return this.mock.getQuote(symbol);
  }

  private async getCandlesWithFallback(
    symbol: string,
    days: number,
    providers: MarketDataProvider[]
  ): Promise<Candle[]> {
    for (const provider of providers) {
      try {
        const candles = await provider.getCandles(symbol, days);
        if (candles.length > 0) return candles;
      } catch (error) {
        console.warn(
          `[TradeIQ] ${provider.name} failed for getCandles(${symbol}):`,
          error instanceof Error ? error.message : 'unknown error'
        );
      }
    }
    // Last resort: generate mock
    return this.mock.getCandles(symbol, days);
  }

  private getStockProvider(): MarketDataProvider {
    return this.polygon || this.mock;
  }
}
