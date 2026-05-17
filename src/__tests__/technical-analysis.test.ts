import { describe, it, expect } from 'vitest';
import { analyzeTechnical } from '@/lib/technical-analysis';
import type { Candle } from '@/lib/types';

// Helper: Generate simple candle data for testing
function generateTestCandles(count: number, basePrice: number = 100): Candle[] {
  const candles: Candle[] = [];
  const now = Math.floor(Date.now() / 1000);
  let price = basePrice;

  for (let i = count; i >= 0; i--) {
    const change = (Math.random() - 0.5) * 2;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random();
    const low = Math.min(open, close) - Math.random();
    candles.push({
      time: now - i * 86400,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: 1000000 + Math.floor(Math.random() * 5000000),
    });
    price = close;
  }

  return candles;
}

describe('Technical Analysis', () => {
  describe('analyzeTechnical', () => {
    it('should return analysis results for sufficient data', () => {
      const candles = generateTestCandles(200);
      const result = analyzeTechnical(candles);

      expect(result).toBeDefined();
      expect(result.rsi).toBeTypeOf('number');
      expect(result.rsi).toBeGreaterThanOrEqual(0);
      expect(result.rsi).toBeLessThanOrEqual(100);
      expect(result.macd).toBeDefined();
      expect(result.macd.value).toBeTypeOf('number');
      expect(result.signals).toBeInstanceOf(Array);
    });

    it('should return valid RSI range (0-100)', () => {
      const candles = generateTestCandles(200);
      const result = analyzeTechnical(candles);

      expect(result.rsi).toBeGreaterThanOrEqual(0);
      expect(result.rsi).toBeLessThanOrEqual(100);
      expect(isNaN(result.rsi)).toBe(false);
    });

    it('should return valid MACD with signal and histogram', () => {
      const candles = generateTestCandles(200);
      const result = analyzeTechnical(candles);

      expect(result.macd.value).toBeTypeOf('number');
      expect(result.macd.signal).toBeTypeOf('number');
      expect(result.macd.histogram).toBeTypeOf('number');
      expect(isNaN(result.macd.value)).toBe(false);
    });

    it('should return valid Bollinger Bands', () => {
      const candles = generateTestCandles(200);
      const result = analyzeTechnical(candles);

      expect(result.bollingerBands).toBeDefined();
      expect(result.bollingerBands.upper).toBeTypeOf('number');
      expect(result.bollingerBands.middle).toBeTypeOf('number');
      expect(result.bollingerBands.lower).toBeTypeOf('number');
      // Upper should be >= middle >= lower
      expect(result.bollingerBands.upper).toBeGreaterThanOrEqual(result.bollingerBands.middle);
      expect(result.bollingerBands.middle).toBeGreaterThanOrEqual(result.bollingerBands.lower);
    });

    it('should return valid ATR (positive)', () => {
      const candles = generateTestCandles(200);
      const result = analyzeTechnical(candles);

      expect(result.atr).toBeTypeOf('number');
      expect(result.atr).toBeGreaterThan(0);
      expect(isNaN(result.atr)).toBe(false);
    });

    it('should handle insufficient data gracefully', () => {
      const candles = generateTestCandles(5);
      const result = analyzeTechnical(candles);

      // Should not crash, may have NaN for some indicators
      expect(result).toBeDefined();
    });
  });
});
