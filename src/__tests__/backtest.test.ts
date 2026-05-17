import { describe, it, expect } from 'vitest';
import { runBacktest } from '@/lib/backtest/engine';
import { calculateMetrics } from '@/lib/backtest/metrics';
import type { Candle } from '@/lib/types';
import type { BacktestTrade, EquityPoint } from '@/lib/backtest/types';

function generateTestCandles(count: number, basePrice: number = 100): Candle[] {
  const candles: Candle[] = [];
  const now = Math.floor(Date.now() / 1000);
  let price = basePrice;

  for (let i = count; i >= 0; i--) {
    const change = (Math.random() - 0.5) * 3;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * 1.5;
    const low = Math.min(open, close) - Math.random() * 1.5;
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

describe('Backtest Engine', () => {
  describe('runBacktest', () => {
    it('should return a valid backtest result', () => {
      const candles = generateTestCandles(200);
      const result = runBacktest(candles, { symbol: 'TEST' });

      expect(result).toBeDefined();
      expect(result.config.symbol).toBe('TEST');
      expect(result.trades).toBeInstanceOf(Array);
      expect(result.equityCurve).toBeInstanceOf(Array);
      expect(result.metrics).toBeDefined();
    });

    it('should return empty result for insufficient data', () => {
      const candles = generateTestCandles(20);
      const result = runBacktest(candles, { symbol: 'TEST' });

      expect(result.metrics.totalTrades).toBe(0);
      expect(result.trades).toHaveLength(0);
    });

    it('should have valid metrics structure', () => {
      const candles = generateTestCandles(200);
      const result = runBacktest(candles, { symbol: 'TEST' });

      const m = result.metrics;
      expect(m).toHaveProperty('totalTrades');
      expect(m).toHaveProperty('wins');
      expect(m).toHaveProperty('losses');
      expect(m).toHaveProperty('winRate');
      expect(m).toHaveProperty('profitFactor');
      expect(m).toHaveProperty('maxDrawdown');
      expect(m).toHaveProperty('sharpeRatio');
      expect(m).toHaveProperty('totalPnl');
      expect(m).toHaveProperty('totalPnlPercent');
    });

    it('should have valid equity curve', () => {
      const candles = generateTestCandles(200);
      const result = runBacktest(candles, { symbol: 'TEST' });

      expect(result.equityCurve.length).toBeGreaterThan(0);

      for (const point of result.equityCurve) {
        expect(point.date).toBeTypeOf('string');
        expect(point.equity).toBeTypeOf('number');
        expect(point.drawdown).toBeTypeOf('number');
      }
    });

    it('should respect minimum confluence score', () => {
      const candles = generateTestCandles(200);
      const result1 = runBacktest(candles, { symbol: 'TEST', minConfluenceScore: 20 });
      const result2 = runBacktest(candles, { symbol: 'TEST', minConfluenceScore: 70 });

      // Higher threshold should produce fewer or equal trades
      expect(result2.metrics.totalTrades).toBeLessThanOrEqual(result1.metrics.totalTrades);
    });

    it('should have trades with correct structure when trades exist', () => {
      const candles = generateTestCandles(300);
      const result = runBacktest(candles, {
        symbol: 'TEST',
        minConfluenceScore: 20, // Lower threshold to get more trades
      });

      for (const trade of result.trades) {
        expect(trade.id).toBeTypeOf('number');
        expect(trade.entryDate).toBeTypeOf('string');
        expect(['LONG', 'SHORT']).toContain(trade.direction);
        expect(trade.entryPrice).toBeGreaterThan(0);
        expect(trade.stopLoss).toBeGreaterThan(0);
        expect(trade.takeProfit).toBeGreaterThan(0);
        expect(trade.confluenceScore).toBeGreaterThanOrEqual(0);
        expect(['win', 'loss', 'breakeven', 'open']).toContain(trade.result);
      }
    });

    it('should use initial capital from config', () => {
      const candles = generateTestCandles(200);
      const result = runBacktest(candles, {
        symbol: 'TEST',
        initialCapital: 50000,
      });

      expect(result.config.initialCapital).toBe(50000);
    });

    it('should generate dates in the result', () => {
      const candles = generateTestCandles(200);
      const result = runBacktest(candles, { symbol: 'TEST' });

      expect(result.startDate).toBeTruthy();
      expect(result.endDate).toBeTruthy();
      expect(result.runTimestamp).toBeGreaterThan(0);
    });
  });
});

describe('Backtest Metrics', () => {
  it('should calculate metrics for empty trades', () => {
    const metrics = calculateMetrics([], [], 10000);

    expect(metrics.totalTrades).toBe(0);
    expect(metrics.wins).toBe(0);
    expect(metrics.losses).toBe(0);
    expect(metrics.winRate).toBe(0);
    expect(metrics.totalPnl).toBe(0);
  });

  it('should calculate win rate correctly', () => {
    const trades: BacktestTrade[] = [
      { id: 1, entryDate: '2024-01-01', exitDate: '2024-01-05', direction: 'LONG', entryPrice: 100, exitPrice: 105, stopLoss: 95, takeProfit: 110, confluenceScore: 50, pnl: 5, pnlPercent: 5, result: 'win', holdingDays: 4, vectorsUsed: [] },
      { id: 2, entryDate: '2024-01-06', exitDate: '2024-01-10', direction: 'LONG', entryPrice: 100, exitPrice: 95, stopLoss: 95, takeProfit: 110, confluenceScore: 50, pnl: -5, pnlPercent: -5, result: 'loss', holdingDays: 4, vectorsUsed: [] },
      { id: 3, entryDate: '2024-01-11', exitDate: '2024-01-15', direction: 'SHORT', entryPrice: 100, exitPrice: 95, stopLoss: 105, takeProfit: 90, confluenceScore: 60, pnl: 5, pnlPercent: 5, result: 'win', holdingDays: 4, vectorsUsed: [] },
    ];

    const equityCurve: EquityPoint[] = [
      { date: '2024-01-01', equity: 10000, drawdown: 0 },
      { date: '2024-01-05', equity: 10050, drawdown: 0 },
      { date: '2024-01-10', equity: 10000, drawdown: -0.5 },
      { date: '2024-01-15', equity: 10050, drawdown: 0 },
    ];

    const metrics = calculateMetrics(trades, equityCurve, 10000);

    expect(metrics.totalTrades).toBe(3);
    expect(metrics.wins).toBe(2);
    expect(metrics.losses).toBe(1);
    expect(metrics.winRate).toBeCloseTo(66.67, 1);
  });
});
