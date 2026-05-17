import type { Candle, Quote } from '../types';

/**
 * Search result for a symbol lookup
 */
export interface SymbolInfo {
  symbol: string;
  name: string;
  type: string; // 'stock', 'etf', 'crypto', etc.
  exchange: string;
  currency: string;
}

/**
 * Cache entry with TTL
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // milliseconds
}

/**
 * Market Data Provider interface — abstracts the data source.
 * Implementations: MockProvider (dev), PolygonProvider (production)
 */
export interface MarketDataProvider {
  readonly name: string;

  getCandles(symbol: string, days?: number, interval?: string): Promise<Candle[]>;
  getQuote(symbol: string): Promise<Quote>;
  getMultipleQuotes(symbols: string[]): Promise<Quote[]>;
  searchSymbols(query: string): Promise<SymbolInfo[]>;
}

/**
 * Simple in-memory cache with TTL.
 * Used by providers to avoid hitting API rate limits.
 */
export class DataCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private defaultTtl: number;

  constructor(defaultTtlMs: number = 60_000) {
    this.defaultTtl = defaultTtlMs;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs ?? this.defaultTtl,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}
