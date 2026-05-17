import { describe, it, expect } from 'vitest';
import { generateConfluence } from '@/lib/confluence-engine';
import type { Candle } from '@/lib/types';

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

describe('Confluence Engine', () => {
  describe('generateConfluence', () => {
    it('should generate a confluence result', () => {
      const candles = generateTestCandles(200);
      const result = generateConfluence(candles, 'AAPL', ['technical']);

      expect(result).toBeDefined();
      expect(result.symbol).toBe('AAPL');
      expect(['LONG', 'SHORT', 'NEUTRAL']).toContain(result.overallDirection);
      expect(result.confluenceScore).toBeGreaterThanOrEqual(0);
      expect(result.confluenceScore).toBeLessThanOrEqual(100);
    });

    it('should include entry, SL, and TP prices', () => {
      const candles = generateTestCandles(200);
      const result = generateConfluence(candles, 'AAPL', ['technical']);

      expect(result.entryPrice).toBeGreaterThan(0);
      expect(result.stopLoss).toBeGreaterThan(0);
      expect(result.takeProfit).toBeGreaterThan(0);
      expect(result.riskReward).toBeGreaterThan(0);
    });

    it('should work with multiple vectors', () => {
      const candles = generateTestCandles(200);
      const result = generateConfluence(candles, 'AAPL', [
        'technical', 'pattern', 'volume', 'news', 'sentiment', 'macro'
      ]);

      expect(result).toBeDefined();
      expect(result.vectorSignals.length).toBeGreaterThan(0);
    });

    it('should return NEUTRAL for no vectors', () => {
      const candles = generateTestCandles(200);
      const result = generateConfluence(candles, 'AAPL', []);

      expect(result.overallDirection).toBe('NEUTRAL');
      expect(result.confluenceScore).toBe(0);
    });

    it('should have valid risk:reward ratio', () => {
      const candles = generateTestCandles(200);
      const result = generateConfluence(candles, 'AAPL', ['technical', 'pattern', 'volume']);

      if (result.overallDirection !== 'NEUTRAL') {
        expect(result.riskReward).toBeGreaterThan(0);
        // For non-neutral, we should have some risk:reward
        const risk = Math.abs(result.entryPrice - result.stopLoss);
        const reward = Math.abs(result.takeProfit - result.entryPrice);
        expect(risk).toBeGreaterThan(0);
        expect(reward).toBeGreaterThan(0);
      }
    });

    it('should include a recommendation string', () => {
      const candles = generateTestCandles(200);
      const result = generateConfluence(candles, 'AAPL', ['technical']);

      expect(result.recommendation).toBeTypeOf('string');
      expect(result.recommendation.length).toBeGreaterThan(0);
    });

    it('should include a timestamp', () => {
      const candles = generateTestCandles(200);
      const result = generateConfluence(candles, 'AAPL', ['technical']);

      expect(result.timestamp).toBeGreaterThan(0);
    });
  });
});
