import { describe, it, expect } from 'vitest';
import { analyzeTimeframe, analyzeMultiTimeframe, DEFAULT_TIMEFRAMES } from '../lib/analysis/multi-timeframe';
import type { Candle } from '../lib/types';

// Helper to generate test candles
function generateCandles(count: number, trend: 'up' | 'down' | 'flat' = 'flat'): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < count; i++) {
    const change = trend === 'up' ? 0.5 : trend === 'down' ? -0.5 : (Math.random() - 0.5) * 2;
    price += change;
    const high = price + Math.random() * 2;
    const low = price - Math.random() * 2;

    candles.push({
      time: now - (count - i) * 3600,
      open: price - change * 0.5,
      high,
      low,
      close: price,
      volume: 1000 + Math.random() * 5000,
    });
  }

  return candles;
}

describe('Multi-Timeframe Analysis', () => {
  describe('DEFAULT_TIMEFRAMES', () => {
    it('should have 5 default timeframes', () => {
      expect(DEFAULT_TIMEFRAMES).toHaveLength(5);
    });

    it('should have correct roles', () => {
      const roles = DEFAULT_TIMEFRAMES.map(tf => tf.role);
      expect(roles).toContain('trend');
      expect(roles).toContain('confirmation');
      expect(roles).toContain('entry');
    });

    it('should have trend timeframes with higher weights', () => {
      const trendTFs = DEFAULT_TIMEFRAMES.filter(tf => tf.role === 'trend');
      const entryTFs = DEFAULT_TIMEFRAMES.filter(tf => tf.role === 'entry');

      const avgTrendWeight = trendTFs.reduce((sum, tf) => sum + tf.weight, 0) / trendTFs.length;
      const avgEntryWeight = entryTFs.reduce((sum, tf) => sum + tf.weight, 0) / entryTFs.length;

      expect(avgTrendWeight).toBeGreaterThan(avgEntryWeight);
    });

    it('should include standard timeframes (5m, 15m, 1h, 4h, 1D)', () => {
      const labels = DEFAULT_TIMEFRAMES.map(tf => tf.label);
      expect(labels).toContain('1D');
      expect(labels).toContain('4H');
      expect(labels).toContain('1H');
      expect(labels).toContain('15M');
      expect(labels).toContain('5M');
    });
  });

  describe('analyzeTimeframe', () => {
    it('should return NEUTRAL for insufficient data', () => {
      const result = analyzeTimeframe(generateCandles(10), '1h', DEFAULT_TIMEFRAMES[0]);
      expect(result.direction).toBe('NEUTRAL');
      expect(result.strength).toBe(0);
    });

    it('should detect uptrend in bullish candles', () => {
      const result = analyzeTimeframe(generateCandles(60, 'up'), '1D', DEFAULT_TIMEFRAMES[0]);
      expect(result.direction).toBe('LONG');
      expect(result.strength).toBeGreaterThan(0);
    });

    it('should detect downtrend in bearish candles', () => {
      const result = analyzeTimeframe(generateCandles(60, 'down'), '1D', DEFAULT_TIMEFRAMES[0]);
      expect(result.direction).toBe('SHORT');
      expect(result.strength).toBeGreaterThan(0);
    });

    it('should have valid structure', () => {
      const result = analyzeTimeframe(generateCandles(60, 'up'), '1h', DEFAULT_TIMEFRAMES[2]);
      expect(result).toHaveProperty('timeframe');
      expect(result).toHaveProperty('label');
      expect(result).toHaveProperty('role');
      expect(result).toHaveProperty('weight');
      expect(result).toHaveProperty('direction');
      expect(result).toHaveProperty('strength');
      expect(result).toHaveProperty('confidence');
    });

    it('should preserve config properties', () => {
      const config = DEFAULT_TIMEFRAMES[0];
      const result = analyzeTimeframe(generateCandles(60, 'up'), '1D', config);
      expect(result.label).toBe(config.label);
      expect(result.role).toBe(config.role);
      expect(result.weight).toBe(config.weight);
    });

    it('should have strength between 0 and 100', () => {
      const result = analyzeTimeframe(generateCandles(60, 'up'), '1h', DEFAULT_TIMEFRAMES[2]);
      expect(result.strength).toBeGreaterThanOrEqual(0);
      expect(result.strength).toBeLessThanOrEqual(100);
    });

    it('should have confidence between 0 and 100', () => {
      const result = analyzeTimeframe(generateCandles(60, 'up'), '1h', DEFAULT_TIMEFRAMES[2]);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });
  });

  describe('analyzeMultiTimeframe', () => {
    it('should return valid multi-timeframe result', () => {
      const tfData = [
        { timeframe: '1D', candles: generateCandles(60, 'up'), config: DEFAULT_TIMEFRAMES[0] },
        { timeframe: '4H', candles: generateCandles(50, 'up'), config: DEFAULT_TIMEFRAMES[1] },
        { timeframe: '1H', candles: generateCandles(50, 'up'), config: DEFAULT_TIMEFRAMES[2] },
      ];

      const result = analyzeMultiTimeframe(tfData);

      expect(result).toHaveProperty('timeframes');
      expect(result).toHaveProperty('trendDirection');
      expect(result).toHaveProperty('entryDirection');
      expect(result).toHaveProperty('overallDirection');
      expect(result).toHaveProperty('alignment');
      expect(result).toHaveProperty('trendStrength');
      expect(result).toHaveProperty('entryPrecision');
      expect(result).toHaveProperty('signals');
      expect(result).toHaveProperty('recommendation');
    });

    it('should detect aligned timeframes as strong confluence', () => {
      const tfData = [
        { timeframe: '1D', candles: generateCandles(60, 'up'), config: DEFAULT_TIMEFRAMES[0] },
        { timeframe: '4H', candles: generateCandles(50, 'up'), config: DEFAULT_TIMEFRAMES[1] },
        { timeframe: '1H', candles: generateCandles(50, 'up'), config: DEFAULT_TIMEFRAMES[2] },
        { timeframe: '15M', candles: generateCandles(40, 'up'), config: DEFAULT_TIMEFRAMES[3] },
        { timeframe: '5M', candles: generateCandles(40, 'up'), config: DEFAULT_TIMEFRAMES[4] },
      ];

      const result = analyzeMultiTimeframe(tfData);

      // All timeframes agree = high alignment
      expect(result.alignment).toBeGreaterThan(60);
      expect(result.overallDirection).toBe('LONG');
    });

    it('should detect trend vs entry conflict', () => {
      const tfData = [
        { timeframe: '1D', candles: generateCandles(60, 'up'), config: DEFAULT_TIMEFRAMES[0] },
        { timeframe: '5M', candles: generateCandles(40, 'down'), config: DEFAULT_TIMEFRAMES[4] },
      ];

      const result = analyzeMultiTimeframe(tfData);

      // Trend is up but entry is down = conflict
      expect(result.trendDirection).toBe('LONG');
      expect(result.entryDirection).toBe('SHORT');
      // Should have a conflict warning signal
      const conflictSignal = result.signals.find(s => s.vectorId === 'tf_conflict');
      expect(conflictSignal).toBeDefined();
    });

    it('should have alignment between 0 and 100', () => {
      const tfData = [
        { timeframe: '1D', candles: generateCandles(60, 'up'), config: DEFAULT_TIMEFRAMES[0] },
        { timeframe: '1H', candles: generateCandles(50, 'down'), config: DEFAULT_TIMEFRAMES[2] },
      ];

      const result = analyzeMultiTimeframe(tfData);
      expect(result.alignment).toBeGreaterThanOrEqual(0);
      expect(result.alignment).toBeLessThanOrEqual(100);
    });

    it('should generate recommendation string', () => {
      const tfData = [
        { timeframe: '1D', candles: generateCandles(60, 'up'), config: DEFAULT_TIMEFRAMES[0] },
      ];

      const result = analyzeMultiTimeframe(tfData);
      expect(typeof result.recommendation).toBe('string');
      expect(result.recommendation.length).toBeGreaterThan(10);
    });

    it('should have valid signal structure', () => {
      const tfData = [
        { timeframe: '1D', candles: generateCandles(60, 'up'), config: DEFAULT_TIMEFRAMES[0] },
        { timeframe: '1H', candles: generateCandles(50, 'up'), config: DEFAULT_TIMEFRAMES[2] },
      ];

      const result = analyzeMultiTimeframe(tfData);
      for (const signal of result.signals) {
        expect(['LONG', 'SHORT', 'NEUTRAL']).toContain(signal.direction);
        expect(signal.strength).toBeGreaterThanOrEqual(0);
        expect(signal.strength).toBeLessThanOrEqual(100);
        expect(typeof signal.detail).toBe('string');
      }
    });

    it('should handle single timeframe', () => {
      const tfData = [
        { timeframe: '1D', candles: generateCandles(60, 'up'), config: DEFAULT_TIMEFRAMES[0] },
      ];

      const result = analyzeMultiTimeframe(tfData);
      expect(result.timeframes).toHaveLength(1);
      expect(result.trendDirection).toBeDefined();
    });

    it('should handle empty data gracefully', () => {
      const result = analyzeMultiTimeframe([]);
      expect(result.overallDirection).toBe('NEUTRAL');
      expect(result.alignment).toBe(0);
    });

    it('should calculate trend strength from trend timeframes', () => {
      const tfData = [
        { timeframe: '1D', candles: generateCandles(60, 'up'), config: DEFAULT_TIMEFRAMES[0] },
        { timeframe: '5M', candles: generateCandles(40, 'down'), config: DEFAULT_TIMEFRAMES[4] },
      ];

      const result = analyzeMultiTimeframe(tfData);
      expect(result.trendStrength).toBeGreaterThanOrEqual(0);
      expect(result.trendStrength).toBeLessThanOrEqual(100);
    });

    it('should calculate entry precision from entry timeframes', () => {
      const tfData = [
        { timeframe: '5M', candles: generateCandles(40, 'down'), config: DEFAULT_TIMEFRAMES[4] },
        { timeframe: '15M', candles: generateCandles(40, 'down'), config: DEFAULT_TIMEFRAMES[3] },
      ];

      const result = analyzeMultiTimeframe(tfData);
      expect(result.entryPrecision).toBeGreaterThanOrEqual(0);
      expect(result.entryPrecision).toBeLessThanOrEqual(100);
    });

    it('should include multi-tf alignment signal when timeframes agree', () => {
      const tfData = [
        { timeframe: '1D', candles: generateCandles(60, 'up'), config: DEFAULT_TIMEFRAMES[0] },
        { timeframe: '4H', candles: generateCandles(50, 'up'), config: DEFAULT_TIMEFRAMES[1] },
        { timeframe: '1H', candles: generateCandles(50, 'up'), config: DEFAULT_TIMEFRAMES[2] },
      ];

      const result = analyzeMultiTimeframe(tfData);
      const mtfSignal = result.signals.find(s => s.vectorId === 'multi_tf');
      expect(mtfSignal).toBeDefined();
    });
  });
});
