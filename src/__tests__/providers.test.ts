import { describe, it, expect, beforeEach } from 'vitest';
import { MockProvider } from '@/lib/data/mock-provider';
import { DataCache } from '@/lib/data/market-data-interface';
// Types imported for reference but used indirectly through provider methods

describe('MockProvider', () => {
  let provider: MockProvider;

  beforeEach(() => {
    provider = new MockProvider();
  });

  describe('getCandles', () => {
    it('should return candles for a known symbol', async () => {
      const candles = await provider.getCandles('AAPL', 30);

      expect(candles).toBeInstanceOf(Array);
      expect(candles.length).toBeGreaterThan(0);
    });

    it('should return candles with valid OHLCV data', async () => {
      const candles = await provider.getCandles('NVDA', 10);

      for (const candle of candles) {
        expect(candle.time).toBeTypeOf('number');
        expect(candle.open).toBeGreaterThan(0);
        expect(candle.high).toBeGreaterThanOrEqual(candle.open);
        expect(candle.high).toBeGreaterThanOrEqual(candle.close);
        expect(candle.low).toBeLessThanOrEqual(candle.open);
        expect(candle.low).toBeLessThanOrEqual(candle.close);
        expect(candle.volume).toBeGreaterThan(0);
      }
    });

    it('should return consistent data for the same symbol', async () => {
      const candles1 = await provider.getCandles('AAPL', 30);
      const candles2 = await provider.getCandles('AAPL', 30);

      // Seeded random should produce identical results
      expect(candles1.length).toBe(candles2.length);
      expect(candles1[0].open).toBe(candles2[0].open);
    });

    it('should return different data for different symbols', async () => {
      const aapl = await provider.getCandles('AAPL', 30);
      const nvda = await provider.getCandles('NVDA', 30);

      // Different base prices should produce different data
      expect(aapl[0].open).not.toBe(nvda[0].open);
    });

    it('should return approximately the requested number of days', async () => {
      const candles = await provider.getCandles('AAPL', 90);

      expect(candles.length).toBeGreaterThanOrEqual(89);
      expect(candles.length).toBeLessThanOrEqual(92);
    });
  });

  describe('getQuote', () => {
    it('should return a valid quote for a known symbol', async () => {
      const quote = await provider.getQuote('AAPL');

      expect(quote.symbol).toBe('AAPL');
      expect(quote.name).toBe('Apple Inc.');
      expect(quote.price).toBeGreaterThan(0);
      expect(quote.change).toBeTypeOf('number');
      expect(quote.changePercent).toBeTypeOf('number');
      expect(quote.volume).toBeGreaterThan(0);
    });

    it('should return the symbol as name for unknown symbols', async () => {
      const quote = await provider.getQuote('UNKNOWN');

      expect(quote.symbol).toBe('UNKNOWN');
      expect(quote.name).toBe('UNKNOWN');
    });
  });

  describe('getMultipleQuotes', () => {
    it('should return quotes for multiple symbols', async () => {
      const quotes = await provider.getMultipleQuotes(['AAPL', 'NVDA', 'MSFT']);

      expect(quotes).toHaveLength(3);
      expect(quotes[0].symbol).toBe('AAPL');
      expect(quotes[1].symbol).toBe('NVDA');
      expect(quotes[2].symbol).toBe('MSFT');
    });

    it('should return empty array for empty input', async () => {
      const quotes = await provider.getMultipleQuotes([]);

      expect(quotes).toHaveLength(0);
    });
  });

  describe('searchSymbols', () => {
    it('should find symbols matching the query', async () => {
      const results = await provider.searchSymbols('AAPL');

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.symbol === 'AAPL')).toBe(true);
    });

    it('should find symbols by name', async () => {
      const results = await provider.searchSymbols('NVIDIA');

      expect(results.some(r => r.symbol === 'NVDA')).toBe(true);
    });

    it('should return empty for no matches', async () => {
      const results = await provider.searchSymbols('ZZZZZZZZ');

      expect(results).toHaveLength(0);
    });

    it('should return correct symbol info structure', async () => {
      const results = await provider.searchSymbols('SPY');

      const spyResult = results.find(r => r.symbol === 'SPY');
      expect(spyResult).toBeDefined();
      if (spyResult) {
        expect(spyResult.type).toBe('etf');
        expect(spyResult.currency).toBe('USD');
      }
    });
  });

  describe('provider identity', () => {
    it('should have name "mock"', () => {
      expect(provider.name).toBe('mock');
    });
  });
});

describe('DataCache', () => {
  let cache: DataCache;

  beforeEach(() => {
    cache = new DataCache(1000); // 1 second TTL for tests
  });

  it('should store and retrieve data', () => {
    cache.set('test', { value: 42 });
    const result = cache.get<{ value: number }>('test');

    expect(result).not.toBeNull();
    if (result) {
      expect(result.value).toBe(42);
    }
  });

  it('should return null for missing keys', () => {
    const result = cache.get('nonexistent');

    expect(result).toBeNull();
  });

  it('should expire entries after TTL', async () => {
    cache.set('test', { value: 42 }, 50); // 50ms TTL

    // Should exist immediately
    expect(cache.get('test')).not.toBeNull();

    // Wait for expiry
    await new Promise(resolve => setTimeout(resolve, 60));

    // Should be expired
    expect(cache.get('test')).toBeNull();
  });

  it('should clear all entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();

    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
    expect(cache.size()).toBe(0);
  });

  it('should track cache size', () => {
    expect(cache.size()).toBe(0);
    cache.set('a', 1);
    expect(cache.size()).toBe(1);
    cache.set('b', 2);
    expect(cache.size()).toBe(2);
  });

  it('should use default TTL when not specified', () => {
    const customCache = new DataCache(50); // 50ms default TTL
    customCache.set('test', 'value');

    expect(customCache.get('test')).toBe('value');

    // Wait for expiry
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(customCache.get('test')).toBeNull();
        resolve();
      }, 60);
    });
  });
});
