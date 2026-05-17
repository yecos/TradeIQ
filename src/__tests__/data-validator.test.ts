import { describe, it, expect } from 'vitest';
import { validateCandle, validateCandleArray, validateQuote, isPriceSane, isCandleDataStale, cleanCandleData } from '../lib/data/validator';
import type { Candle, Quote } from '../lib/types';

function makeCandle(overrides: Partial<Candle> = {}): Candle {
  return {
    time: Math.floor(Date.now() / 1000) - 86400,
    open: 100,
    high: 105,
    low: 97,
    close: 103,
    volume: 1000000,
    ...overrides,
  };
}

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    symbol: 'BTC',
    name: 'Bitcoin',
    price: 67000,
    change: 1500,
    changePercent: 2.29,
    volume: 5000000000,
    high: 67500,
    low: 65000,
    open: 65500,
    prevClose: 65500,
    ...overrides,
  };
}

describe('Market Data Validator', () => {
  describe('validateCandle', () => {
    it('should validate a correct candle', () => {
      const result = validateCandle(makeCandle());
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject candle with NaN close', () => {
      const result = validateCandle(makeCandle({ close: NaN }));
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('NaN'))).toBe(true);
    });

    it('should reject candle with zero price', () => {
      const result = validateCandle(makeCandle({ close: 0 }));
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('zero or negative'))).toBe(true);
    });

    it('should reject candle with negative volume', () => {
      const result = validateCandle(makeCandle({ volume: -100 }));
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('negative'))).toBe(true);
    });

    it('should reject candle with future timestamp', () => {
      const result = validateCandle(makeCandle({ time: Math.floor(Date.now() / 1000) + 200000 }));
      expect(result.warnings.some(e => e.includes('future'))).toBe(true);
    });

    it('should warn on OHLC inconsistency', () => {
      const result = validateCandle(makeCandle({ high: 90, low: 110 }));
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('validateCandleArray', () => {
    it('should validate a correct series', () => {
      const candles = Array.from({ length: 30 }, (_, i) => makeCandle({ time: Math.floor(Date.now() / 1000) - (30 - i) * 86400 }));
      const result = validateCandleArray(candles, 'BTC');
      expect(result.isValid).toBe(true);
    });

    it('should reject empty array', () => {
      const result = validateCandleArray([]);
      expect(result.isValid).toBe(false);
    });

    it('should detect gaps in series', () => {
      const candles: Candle[] = [];
      const now = Math.floor(Date.now() / 1000);
      // Create series with many gaps
      for (let i = 0; i < 20; i++) {
        candles.push(makeCandle({ time: now - (20 - i) * 86400 * 5 })); // 5-day gaps
      }
      const result = validateCandleArray(candles, 'BTC');
      expect(result.warnings.some(w => w.includes('gaps'))).toBe(true);
    });

    it('should detect out-of-order candles', () => {
      const candles = [
        makeCandle({ time: 200 }),
        makeCandle({ time: 100 }),
        makeCandle({ time: 300 }),
      ];
      const result = validateCandleArray(candles, 'BTC');
      expect(result.warnings.some(w => w.includes('out-of-order'))).toBe(true);
    });
  });

  describe('validateQuote', () => {
    it('should validate a correct quote', () => {
      const result = validateQuote(makeQuote());
      expect(result.isValid).toBe(true);
    });

    it('should reject quote with NaN price', () => {
      const result = validateQuote(makeQuote({ price: NaN }));
      expect(result.isValid).toBe(false);
    });

    it('should reject quote with zero price', () => {
      const result = validateQuote(makeQuote({ price: 0 }));
      expect(result.isValid).toBe(false);
    });

    it('should reject quote with negative volume', () => {
      const result = validateQuote(makeQuote({ volume: -1 }));
      expect(result.isValid).toBe(false);
    });
  });

  describe('isPriceSane', () => {
    it('should accept valid BTC price', () => {
      expect(isPriceSane('BTC', 67000)).toBe(true);
    });

    it('should reject BTC price of $0.01', () => {
      expect(isPriceSane('BTC', 0.01)).toBe(false);
    });

    it('should reject BTC price of $10,000,000', () => {
      expect(isPriceSane('BTC', 10_000_000)).toBe(false);
    });

    it('should reject negative prices', () => {
      expect(isPriceSane('BTC', -100)).toBe(false);
    });

    it('should reject NaN prices', () => {
      expect(isPriceSane('BTC', NaN)).toBe(false);
    });

    it('should accept unknown symbol within generic range', () => {
      expect(isPriceSane('UNKNOWN', 50)).toBe(true);
    });

    it('should reject unknown symbol with absurd price', () => {
      expect(isPriceSane('UNKNOWN', 20_000_000)).toBe(false);
    });
  });

  describe('isCandleDataStale', () => {
    it('should detect stale daily data', () => {
      const oldTime = Math.floor(Date.now() / 1000) - 200 * 3600; // 200 hours ago
      const candles = [makeCandle({ time: oldTime })];
      expect(isCandleDataStale(candles, '1D')).toBe(true);
    });

    it('should accept fresh data', () => {
      const recentTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const candles = [makeCandle({ time: recentTime })];
      expect(isCandleDataStale(candles, '1D')).toBe(false);
    });

    it('should return true for empty array', () => {
      expect(isCandleDataStale([], '1D')).toBe(true);
    });
  });

  describe('cleanCandleData', () => {
    it('should remove invalid candles', () => {
      const candles = [
        makeCandle({ close: 100 }),
        makeCandle({ close: NaN }),
        makeCandle({ close: 0 }),
        makeCandle({ close: 105 }),
      ];
      const cleaned = cleanCandleData(candles, 'BTC');
      expect(cleaned.length).toBeLessThan(candles.length);
      expect(cleaned.every(c => isFinite(c.close) && c.close > 0)).toBe(true);
    });

    it('should preserve all valid candles', () => {
      const candles = Array.from({ length: 10 }, () => makeCandle());
      const cleaned = cleanCandleData(candles, 'BTC');
      expect(cleaned.length).toBe(10);
    });

    it('should sort candles by time', () => {
      const candles = [
        makeCandle({ time: 300 }),
        makeCandle({ time: 100 }),
        makeCandle({ time: 200 }),
      ];
      const cleaned = cleanCandleData(candles, 'BTC');
      expect(cleaned[0].time).toBeLessThan(cleaned[1].time);
      expect(cleaned[1].time).toBeLessThan(cleaned[2].time);
    });
  });
});
