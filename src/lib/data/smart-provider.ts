import type { Candle, Quote, DataQualityReport } from '../types';
import type { MarketDataProvider, SymbolInfo } from './market-data-interface';
import { MockProvider } from './mock-provider';
import { PolygonProvider } from './polygon-provider';
import { BinanceProvider, isCryptoSymbol } from './binance-provider';
import { CoinGeckoProvider } from './coingecko-provider';
import { FinnhubProvider } from './finnhub-provider';
import { AlpacaProvider } from './alpaca-provider';
import { DataCache } from './market-data-interface';
import { validateCandleArray, cleanCandleData, validateQuote, isPriceSane, isCandleDataStale } from './validator';

/**
 * Smart Provider — routes requests to the best available data source.
 *
 * Routing logic:
 * - Crypto symbols → CoinGecko (primary, works everywhere including US)
 *                    → Binance (secondary, may be geo-blocked from US)
 *                    → Mock (fallback)
 * - Stock/ETF symbols → Alpaca (if API keys set, real-time bars + broker)
 *                      → Finnhub (if API key set, covers stocks + forex)
 *                      → PolygonProvider (if API key set, stocks only)
 *                      → MockProvider
 * - Forex symbols → Finnhub (if API key set)
 *                 → MockProvider
 * - Fallback: MockProvider for any symbol that fails
 *
 * CRITICAL: Crypto and stock fetches run IN PARALLEL to prevent
 * serverless function timeouts. If crypto takes 8s, stocks still
 * return instantly from mock.
 */

/** Maximum time (ms) to wait for any single provider before falling back */
const PROVIDER_TIMEOUT = 10000;

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
  private alpaca: AlpacaProvider | null = null;
  private finnhub: FinnhubProvider | null = null;
  private polygon: PolygonProvider | null = null;
  private mock: MockProvider;
  private hasAlpacaKey: boolean;
  private hasPolygonKey: boolean;
  private hasFinnhubKey: boolean;

  // Cache for crypto quotes to avoid hitting APIs on every request
  private cryptoQuoteCache = new Map<string, { data: Quote; timestamp: number }>();
  private cryptoQuoteCacheTtl = 30_000; // 30s

  // Data quality tracking
  private lastRealDataTime: number | null = null;
  private mockSymbols = new Set<string>();
  private staleSymbols = new Set<string>();

  // Track last known real prices to anchor mock candles when real candle data is unavailable
  private lastKnownPrices = new Map<string, number>();

  constructor(polygonApiKey?: string, finnhubApiKey?: string, alpacaApiKey?: string, alpacaApiSecret?: string) {
    this.coingecko = new CoinGeckoProvider();
    this.binance = new BinanceProvider();
    this.mock = new MockProvider();
    this.hasPolygonKey = Boolean(polygonApiKey && polygonApiKey.length > 0);
    this.hasFinnhubKey = Boolean(finnhubApiKey && finnhubApiKey.length > 0);
    this.hasAlpacaKey = Boolean(alpacaApiKey && alpacaApiSecret && alpacaApiKey.length > 0 && alpacaApiSecret.length > 0);

    if (this.hasAlpacaKey && alpacaApiKey && alpacaApiSecret) {
      try {
        const cache = new DataCache(30_000);
        this.alpaca = new AlpacaProvider(alpacaApiKey, alpacaApiSecret, cache, true);
        console.warn('[TradeIQ] Alpaca provider initialized — stocks will use real-time IEX data');
      } catch (error) {
        console.warn('[TradeIQ] Failed to initialize Alpaca provider:', error instanceof Error ? error.message : error);
        this.hasAlpacaKey = false;
      }
    }

    if (this.hasPolygonKey && polygonApiKey) {
      const cache = new DataCache(60_000);
      this.polygon = new PolygonProvider(polygonApiKey, cache);
    }

    if (this.hasFinnhubKey && finnhubApiKey) {
      try {
        this.finnhub = new FinnhubProvider(finnhubApiKey);
      } catch {
        console.warn('[TradeIQ] Failed to initialize Finnhub provider');
      }
    }
  }

  async getCandles(symbol: string, days: number = 180, interval: string = '1D'): Promise<Candle[]> {
    // Pre-fetch a real quote price to anchor mock candles if needed.
    // This is critical because Alpaca IEX free tier supports snapshots (quotes)
    // but NOT the bars endpoint (returns 403). By fetching the quote first,
    // we ensure mock candles start from the real price level.
    if (!isCryptoSymbol(symbol) && this.alpaca) {
      try {
        const quote = await withTimeout(
          this.alpaca.getQuote(symbol),
          3000,
          `preFetchQuote(${symbol})`
        );
        if (quote?.price) {
          this.lastKnownPrices.set(symbol.toUpperCase(), quote.price);
          this.mock.setLastKnownPrice(symbol, quote.price);
        }
      } catch {
        // Quote pre-fetch failed — will use default seed price
      }
    }

    if (isCryptoSymbol(symbol)) {
      // For daily/weekly crypto: MERGE CoinGecko (deep history) + Binance (real-time today)
      if (['1D', '1W'].includes(interval)) {
        const candles = await this.getCandlesMerged(symbol, days, interval);
        return this.validateAndCleanCandles(candles, symbol, interval);
      }
      // For intraday crypto, try Binance first (CoinGecko free doesn't support intraday)
      const providers = [this.binance, this.coingecko, this.mock];
      const candles = await this.getCandlesWithFallback(symbol, days, interval, providers);
      return this.validateAndCleanCandles(candles, symbol, interval);
    }

    // Stocks/Forex: Alpaca → Finnhub → Polygon → Mock
    const providers = this.getStockProviders();
    const candles = await this.getCandlesWithFallback(symbol, days, interval, providers);
    if (providers[0] === this.mock) this.mockSymbols.add(symbol);
    else this.mockSymbols.delete(symbol);
    return this.validateAndCleanCandles(candles, symbol, interval);
  }

  async getQuote(symbol: string): Promise<Quote> {
    if (isCryptoSymbol(symbol)) {
      const quote = await this.getCryptoQuote(symbol);
      return this.validateAndMarkQuote(quote);
    }

    // Stocks/Forex: Alpaca → Finnhub → Polygon → Mock
    const stockProviders = this.getStockProviders();
    for (const provider of stockProviders) {
      try {
        const result = await withTimeout(
          provider.getQuote(symbol),
          PROVIDER_TIMEOUT,
          `${provider.name}.getQuote(${symbol})`
        );
        if (result) {
          this.mockSymbols.delete(symbol);
          // Anchor mock candle prices to real quote — ensures consistency if candles fall back to mock
          this.lastKnownPrices.set(symbol.toUpperCase(), result.price);
          this.mock.setLastKnownPrice(symbol, result.price);
          return this.validateAndMarkQuote(result, false);
        }
      } catch {
        // Try next provider
      }
    }
    // All stock providers failed — use mock
    this.mockSymbols.add(symbol);
    const quote = await this.mock.getQuote(symbol);
    return this.validateAndMarkQuote(quote, true);
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
    if (this.hasAlpacaKey) providers.push('alpaca'); // Primary stocks (real-time)
    if (this.hasFinnhubKey) providers.push('finnhub');
    if (this.hasPolygonKey) providers.push('polygon');
    providers.push('mock'); // Always available as fallback
    return providers;
  }

  /**
   * Get a data quality report — essential for trading safety.
   * Tells the UI whether data is real, mock, or stale.
   */
  getDataQualityReport(): DataQualityReport {
    const warnings: string[] = [];

    if (!this.hasAlpacaKey && !this.hasPolygonKey && !this.hasFinnhubKey) {
      warnings.push('Stock data is simulated (no ALPACA, POLYGON_API_KEY or FINNHUB_API_KEY). Do NOT trade stocks based on this data.');
    }
    if (this.mockSymbols.size > 0) {
      warnings.push(`${this.mockSymbols.size} symbol(s) using mock data: ${[...this.mockSymbols].slice(0, 5).join(', ')}`);
    }
    if (this.staleSymbols.size > 0) {
      warnings.push(`${this.staleSymbols.size} symbol(s) with stale data: ${[...this.staleSymbols].slice(0, 5).join(', ')}`);
    }

    let source: DataQualityReport['source'] = 'real';
    if (this.mockSymbols.size > 0 && this.lastRealDataTime !== null) {
      source = 'partial';
    } else if (this.mockSymbols.size > 0) {
      source = 'mock';
    } else if (this.staleSymbols.size > 0) {
      source = 'stale';
    }

    return {
      source,
      isMockData: this.mockSymbols.size > 0,
      isStale: this.staleSymbols.size > 0,
      staleSymbols: [...this.staleSymbols],
      lastRealDataTime: this.lastRealDataTime,
      warnings,
    };
  }

  /**
   * Check if Alpaca (stock data + broker) is available.
   */
  hasAlpaca(): boolean {
    return this.hasAlpacaKey;
  }

  /**
   * Check if Polygon (stock data) is available.
   */
  hasPolygon(): boolean {
    return this.hasPolygonKey;
  }

  /**
   * Check if Finnhub (stock/forex data) is available.
   */
  hasFinnhub(): boolean {
    return this.hasFinnhubKey;
  }

  /**
   * Get the Finnhub provider instance for news/sentiment/calendar.
   */
  getFinnhub(): FinnhubProvider | null {
    return this.finnhub;
  }

  /**
   * Get the Alpaca provider instance for real-time stock data.
   */
  getAlpaca(): AlpacaProvider | null {
    return this.alpaca;
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
      this.lastKnownPrices.set(symbol.toUpperCase(), cgQuote.price);
      this.mock.setLastKnownPrice(symbol, cgQuote.price);
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
      this.lastKnownPrices.set(symbol.toUpperCase(), binQuote.price);
      this.mock.setLastKnownPrice(symbol, binQuote.price);
      return binQuote;
    }

    // Final fallback to mock
    return this.mock.getQuote(symbol);
  }

  /**
   * Merge CoinGecko (deep history) + Binance (real-time) candle data.
   *
   * CoinGecko provides excellent historical data going back months/years,
   * but its free API can lag 1-2 days behind real-time. Binance has
   * real-time data including today's candle, but limited to ~1000 candles.
   *
   * This method fetches from BOTH in parallel, then:
   * 1. Uses CoinGecko data for the deep historical portion
   * 2. Overlays Binance data for the most recent period (where it overlaps)
   * 3. The result has full depth + today's real-time data
   */
  private async getCandlesMerged(symbol: string, days: number, interval: string): Promise<Candle[]> {
    const startTime = Date.now();

    // Fetch from both providers in parallel
    const [cgResult, binResult] = await Promise.allSettled([
      withTimeout(
        this.coingecko.getCandles(symbol, days, interval),
        PROVIDER_TIMEOUT,
        `CoinGecko.getCandles(${symbol}, ${interval})`
      ),
      withTimeout(
        this.binance.getCandles(symbol, days, interval),
        PROVIDER_TIMEOUT,
        `Binance.getCandles(${symbol}, ${interval})`
      ),
    ]);

    const cgCandles = cgResult.status === 'fulfilled' && cgResult.value ? cgResult.value : null;
    const binCandles = binResult.status === 'fulfilled' && binResult.value ? binResult.value : null;

    // If both failed, fall back to mock
    if (!cgCandles && !binCandles) {
      console.warn(`[TradeIQ] Both CoinGecko and Binance failed for ${symbol} candles, using mock`);
      return this.mock.getCandles(symbol, days, interval);
    }

    // If only one succeeded, use it (with freshness check)
    if (!cgCandles && binCandles) {
      console.warn(`[TradeIQ] CoinGecko failed for ${symbol}, using Binance only (${binCandles.length} candles)`);
      return binCandles.slice(-days);
    }
    if (cgCandles && !binCandles) {
      const fresh = this.isDataFresh(cgCandles, interval);
      if (fresh) {
        console.warn(`[TradeIQ] Binance failed for ${symbol}, using CoinGecko only (${cgCandles.length} candles, data fresh)`);
        return cgCandles;
      }
      // CoinGecko data is stale and Binance failed — try to append a synthetic "today" candle
      // from the latest quote, or just return what we have
      console.warn(`[TradeIQ] CoinGecko data for ${symbol} is stale (last candle: ${new Date(cgCandles[cgCandles.length - 1].time * 1000).toISOString()}), but Binance unavailable`);
      return cgCandles;
    }

    // Both succeeded — MERGE! (at this point both are guaranteed non-null by the checks above)
    const cgData = cgCandles as Candle[];
    const binData = binCandles as Candle[];
    const merged = this.mergeCandleData(cgData, binData);
    const elapsed = Date.now() - startTime;
    console.warn(
      `[TradeIQ] Merged candles for ${symbol}: CG=${cgData.length}, BIN=${binData.length} → ${merged.length} candles (${elapsed}ms)`
    );
    return merged.slice(-days);
  }

  /**
   * Merge candle data from CoinGecko (history) and Binance (real-time).
   *
   * Strategy:
   * - For timestamps that exist in both → use Binance (more accurate, real-time)
   * - For timestamps only in CoinGecko → keep CoinGecko data
   * - For timestamps only in Binance → keep Binance data
   * - Sort by time ascending
   */
  private mergeCandleData(cgCandles: Candle[], binCandles: Candle[]): Candle[] {
    if (cgCandles.length === 0) return binCandles;
    if (binCandles.length === 0) return cgCandles;

    // Build a map of Binance candles by time for O(1) lookup
    const binMap = new Map<number, Candle>();
    for (const c of binCandles) {
      binMap.set(c.time, c);
    }

    const merged: Candle[] = [];
    const seenTimes = new Set<number>();

    // Start with all CoinGecko candles
    for (const cg of cgCandles) {
      // If Binance has data for this time, prefer Binance (real-time)
      const binCandle = binMap.get(cg.time);
      if (binCandle) {
        merged.push(binCandle);
        seenTimes.add(cg.time);
      } else {
        merged.push(cg);
        seenTimes.add(cg.time);
      }
    }

    // Add any Binance candles that weren't in CoinGecko (e.g., today's candle)
    for (const c of binCandles) {
      if (!seenTimes.has(c.time)) {
        merged.push(c);
      }
    }

    // Sort by time
    merged.sort((a, b) => a.time - b.time);
    return merged;
  }

  /**
   * Check if candle data is fresh enough (last candle within acceptable age).
   * - For daily/weekly intervals: data should be within 48 hours
   * - For intraday intervals: data should be within 24 hours
   *   (relaxed from 2h — IEX free tier data is delayed outside market hours,
   *    but the data is still valid and much better than mock)
   */
  private isDataFresh(candles: Candle[], interval: string): boolean {
    if (candles.length === 0) return false;
    const lastCandle = candles[candles.length - 1];
    const ageSeconds = Math.floor(Date.now() / 1000) - lastCandle.time;
    const maxAge = ['1D', '1W'].includes(interval) ? 48 * 3600 : 24 * 3600;
    return ageSeconds < maxAge;
  }

  private async getCandlesWithFallback(
    symbol: string,
    days: number,
    interval: string,
    providers: MarketDataProvider[]
  ): Promise<Candle[]> {
    for (const provider of providers) {
      try {
        console.warn(`[TradeIQ] Trying ${provider.name} for getCandles(${symbol}, ${interval})...`);
        const result = await withTimeout(
          provider.getCandles(symbol, days, interval),
          PROVIDER_TIMEOUT,
          `${provider.name}.getCandles(${symbol}, ${interval})`
        );
        if (result && result.length > 0) {
          const lastClose = result[result.length - 1].close;
          console.warn(`[TradeIQ] ${provider.name} returned ${result.length} candles for ${symbol} (last close: $${lastClose})`);
          // Freshness check: if data is stale, try next provider
          // But SKIP freshness check for mock — mock data is always "fresh" (generated now)
          if (provider.name !== 'mock' && !this.isDataFresh(result, interval)) {
            console.warn(
              `[TradeIQ] ${provider.name} returned stale data for ${symbol} (last candle: ${new Date(result[result.length - 1].time * 1000).toISOString()}), trying next provider...`
            );
            continue; // Try next provider
          }
          return result;
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'unknown error';
        console.warn(`[TradeIQ] ${provider.name} FAILED for getCandles(${symbol}, ${interval}): ${errMsg}`);
        // Auth errors — skip immediately, no point retrying
        if (errMsg.includes('FORBIDDEN') || errMsg.includes('AUTH') || errMsg.includes('401') || errMsg.includes('403')) {
          console.warn(`[TradeIQ] ${provider.name} auth error for ${symbol}, skipping: ${errMsg}`);
          continue;
        }
        console.warn(
          `[TradeIQ] ${provider.name} failed for getCandles(${symbol}, ${interval}):`,
          errMsg
        );
      }
    }
    // Last resort: generate mock — but first try to anchor to a real price
    // so the mock candles are in the same price range as real quotes.
    // This prevents the jarring mismatch (e.g., quote=$222, candles=$131).
    const lastPrice = this.lastKnownPrices.get(symbol.toUpperCase());
    if (lastPrice) {
      this.mock.setLastKnownPrice(symbol, lastPrice);
    } else {
      // No cached quote price — try a quick quote fetch to anchor the mock.
      // This is important when Alpaca bars fail (e.g., IEX free tier doesn't
      // support the bars endpoint, only snapshots) but quotes work.
      try {
        const quoteProvider = this.alpaca || this.finnhub || this.polygon;
        if (quoteProvider) {
          const quickQuote = await withTimeout(
            quoteProvider.getQuote(symbol),
            3000, // Short timeout — don't slow down the candle response
            `quickQuote(${symbol})`
          );
          if (quickQuote?.price) {
            this.mock.setLastKnownPrice(symbol, quickQuote.price);
            console.warn(`[TradeIQ] Anchored mock candles for ${symbol} to real price $${quickQuote.price}`);
          }
        }
      } catch {
        // Quick quote failed — use default seed price
      }
    }
    return this.mock.getCandles(symbol, days, interval);
  }

  private getStockProviders(): MarketDataProvider[] {
    const providers: MarketDataProvider[] = [];
    if (this.alpaca) providers.push(this.alpaca); // Primary — real-time bars + broker
    if (this.finnhub) providers.push(this.finnhub); // Secondary — stocks + forex
    if (this.polygon) providers.push(this.polygon); // Tertiary — stocks only
    providers.push(this.mock);
    return providers;
  }

  private getStockProvider(): MarketDataProvider {
    return this.alpaca || this.finnhub || this.polygon || this.mock;
  }

  /**
   * Validate candles and clean bad data before returning to the caller.
   * Also tracks data freshness and mock usage.
   */
  private validateAndCleanCandles(candles: Candle[], symbol: string, interval: string): Candle[] {
    if (candles.length === 0) return candles;

    // Run validation
    const validation = validateCandleArray(candles, symbol);
    if (validation.warnings.length > 0) {
      console.warn(`[TradeIQ] Candle validation warnings for ${symbol}:`, validation.warnings.slice(0, 3));
    }
    if (!validation.isValid) {
      console.warn(`[TradeIQ] Candle validation errors for ${symbol}:`, validation.errors.slice(0, 3));
      // Clean the data — remove invalid candles
      const cleaned = cleanCandleData(candles, symbol);
      if (cleaned.length < candles.length) {
        console.warn(`[TradeIQ] Cleaned ${candles.length - cleaned.length} bad candles for ${symbol}`);
      }
      candles = cleaned;
    }

    // Track staleness
    if (isCandleDataStale(candles, interval)) {
      this.staleSymbols.add(symbol);
    } else {
      this.staleSymbols.delete(symbol);
      this.lastRealDataTime = Date.now();
    }

    return candles;
  }

  /**
   * Validate a quote and mark it with isMock if needed.
   */
  private validateAndMarkQuote(quote: Quote, isMock: boolean = false): Quote {
    const validation = validateQuote(quote);
    if (validation.warnings.length > 0) {
      console.warn(`[TradeIQ] Quote validation warnings for ${quote.symbol}:`, validation.warnings.slice(0, 2));
    }
    if (!validation.isValid) {
      console.warn(`[TradeIQ] Quote validation errors for ${quote.symbol}:`, validation.errors.slice(0, 2));
    }

    // Price sanity check
    if (!isPriceSane(quote.symbol, quote.price)) {
      console.warn(`[TradeIQ] Price sanity check failed for ${quote.symbol}: $${quote.price}`);
    }

    return { ...quote, isMock };
  }
}
