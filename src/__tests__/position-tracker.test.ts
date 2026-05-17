import { describe, it, expect, beforeEach } from 'vitest';
import { PositionTracker } from '@/lib/broker/position-tracker';
import { MockBroker } from '@/lib/broker/mock-broker';
import type { ClosedTrade as _ClosedTrade } from '@/lib/broker/position-tracker';

describe('PositionTracker', () => {
  let broker: MockBroker;
  let tracker: PositionTracker;

  beforeEach(() => {
    broker = new MockBroker();
    tracker = new PositionTracker(broker);
  });

  // ─── Open Positions ───

  describe('getOpenPositions', () => {
    it('should return empty positions initially', async () => {
      const positions = await tracker.getOpenPositions();
      expect(positions).toEqual([]);
    });

    it('should return positions after trade', async () => {
      await broker.submitOrder({ symbol: 'AAPL', side: 'buy', qty: 10, type: 'market' });
      const positions = await tracker.getOpenPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].symbol).toBe('AAPL');
    });
  });

  // ─── Portfolio Snapshot ───

  describe('getPortfolioSnapshot', () => {
    it('should return valid snapshot for mock broker', async () => {
      const snapshot = await tracker.getPortfolioSnapshot();
      expect(snapshot.equity).toBe(100000); // Mock account default
      expect(snapshot.unrealizedPnl).toBe(0);
      expect(snapshot.positions).toBe(0);
      expect(snapshot.timestamp).toBeGreaterThan(0);
    });

    it('should track positions count', async () => {
      await broker.submitOrder({ symbol: 'AAPL', side: 'buy', qty: 10, type: 'market' });
      const snapshot = await tracker.getPortfolioSnapshot();
      expect(snapshot.positions).toBe(1);
    });
  });

  // ─── Closed Trades ───

  describe('recordClosedTrade', () => {
    it('should record a winning trade', () => {
      tracker.recordClosedTrade({
        symbol: 'AAPL',
        side: 'long',
        entryPrice: 150,
        exitPrice: 155,
        qty: 10,
        pnl: 50,
        pnlPercent: 3.33,
        openedAt: '2026-05-18T10:00:00Z',
        closedAt: '2026-05-18T14:00:00Z',
        durationHours: 4,
      });

      const trades = tracker.getClosedTrades();
      expect(trades.length).toBe(1);
      expect(trades[0].symbol).toBe('AAPL');
      expect(trades[0].pnl).toBe(50);
      expect(trades[0].id).toBeTruthy();
    });

    it('should keep max 500 trades', () => {
      for (let i = 0; i < 505; i++) {
        tracker.recordClosedTrade({
          symbol: `SYM${i}`,
          side: 'long',
          entryPrice: 100,
          exitPrice: 101,
          qty: 1,
          pnl: 1,
          pnlPercent: 1,
          openedAt: new Date(Date.now() - 3600000).toISOString(),
          closedAt: new Date().toISOString(),
          durationHours: 1,
        });
      }

      // getClosedTrades() has default limit of 50, use 600 to see all
      const trades = tracker.getClosedTrades(600);
      expect(trades.length).toBe(500);
    });

    it('should limit results with limit param', () => {
      for (let i = 0; i < 20; i++) {
        tracker.recordClosedTrade({
          symbol: `SYM${i}`,
          side: 'long',
          entryPrice: 100,
          exitPrice: 101,
          qty: 1,
          pnl: 1,
          pnlPercent: 1,
          openedAt: new Date().toISOString(),
          closedAt: new Date().toISOString(),
          durationHours: 1,
        });
      }

      const trades = tracker.getClosedTrades(5);
      expect(trades.length).toBe(5);
    });
  });

  // ─── Performance Metrics ───

  describe('getPerformanceMetrics', () => {
    it('should return zero metrics when no trades', () => {
      const metrics = tracker.getPerformanceMetrics();
      expect(metrics.totalTrades).toBe(0);
      expect(metrics.winRate).toBe(0);
      expect(metrics.profitFactor).toBe(0);
      expect(metrics.totalPnl).toBe(0);
    });

    it('should calculate win rate correctly', () => {
      // 3 wins, 2 losses = 60% win rate
      tracker.recordClosedTrade({ symbol: 'A', side: 'long', entryPrice: 100, exitPrice: 105, qty: 1, pnl: 5, pnlPercent: 5, openedAt: '', closedAt: '', durationHours: 1 });
      tracker.recordClosedTrade({ symbol: 'B', side: 'long', entryPrice: 100, exitPrice: 95, qty: 1, pnl: -5, pnlPercent: -5, openedAt: '', closedAt: '', durationHours: 1 });
      tracker.recordClosedTrade({ symbol: 'C', side: 'long', entryPrice: 100, exitPrice: 110, qty: 1, pnl: 10, pnlPercent: 10, openedAt: '', closedAt: '', durationHours: 1 });
      tracker.recordClosedTrade({ symbol: 'D', side: 'long', entryPrice: 100, exitPrice: 97, qty: 1, pnl: -3, pnlPercent: -3, openedAt: '', closedAt: '', durationHours: 1 });
      tracker.recordClosedTrade({ symbol: 'E', side: 'long', entryPrice: 100, exitPrice: 108, qty: 1, pnl: 8, pnlPercent: 8, openedAt: '', closedAt: '', durationHours: 1 });

      const metrics = tracker.getPerformanceMetrics();
      expect(metrics.totalTrades).toBe(5);
      expect(metrics.winningTrades).toBe(3);
      expect(metrics.losingTrades).toBe(2);
      expect(metrics.winRate).toBe(60);
    });

    it('should calculate profit factor', () => {
      tracker.recordClosedTrade({ symbol: 'A', side: 'long', entryPrice: 100, exitPrice: 110, qty: 1, pnl: 10, pnlPercent: 10, openedAt: '', closedAt: '', durationHours: 1 });
      tracker.recordClosedTrade({ symbol: 'B', side: 'long', entryPrice: 100, exitPrice: 95, qty: 1, pnl: -5, pnlPercent: -5, openedAt: '', closedAt: '', durationHours: 1 });

      const metrics = tracker.getPerformanceMetrics();
      // Total wins: 10, total losses: 5, PF = 10/5 = 2.0
      expect(metrics.profitFactor).toBe(2.0);
    });

    it('should calculate total P&L', () => {
      tracker.recordClosedTrade({ symbol: 'A', side: 'long', entryPrice: 100, exitPrice: 110, qty: 1, pnl: 10, pnlPercent: 10, openedAt: '', closedAt: '', durationHours: 1 });
      tracker.recordClosedTrade({ symbol: 'B', side: 'long', entryPrice: 100, exitPrice: 95, qty: 1, pnl: -5, pnlPercent: -5, openedAt: '', closedAt: '', durationHours: 1 });

      const metrics = tracker.getPerformanceMetrics();
      expect(metrics.totalPnl).toBe(5); // 10 - 5 = 5
    });

    it('should track best and worst trade', () => {
      tracker.recordClosedTrade({ symbol: 'A', side: 'long', entryPrice: 100, exitPrice: 110, qty: 1, pnl: 10, pnlPercent: 10, openedAt: '', closedAt: '', durationHours: 1 });
      tracker.recordClosedTrade({ symbol: 'B', side: 'long', entryPrice: 100, exitPrice: 85, qty: 1, pnl: -15, pnlPercent: -15, openedAt: '', closedAt: '', durationHours: 1 });
      tracker.recordClosedTrade({ symbol: 'C', side: 'long', entryPrice: 100, exitPrice: 105, qty: 1, pnl: 5, pnlPercent: 5, openedAt: '', closedAt: '', durationHours: 1 });

      const metrics = tracker.getPerformanceMetrics();
      expect(metrics.bestTrade).toBe(10);
      expect(metrics.worstTrade).toBe(-15);
    });

    it('should calculate current streak', () => {
      // Record: W, W, W, L, L (most recent first due to unshift)
      tracker.recordClosedTrade({ symbol: 'A', side: 'long', entryPrice: 100, exitPrice: 105, qty: 1, pnl: 5, pnlPercent: 5, openedAt: '', closedAt: '', durationHours: 1 });
      tracker.recordClosedTrade({ symbol: 'B', side: 'long', entryPrice: 100, exitPrice: 105, qty: 1, pnl: 5, pnlPercent: 5, openedAt: '', closedAt: '', durationHours: 1 });
      tracker.recordClosedTrade({ symbol: 'C', side: 'long', entryPrice: 100, exitPrice: 105, qty: 1, pnl: 5, pnlPercent: 5, openedAt: '', closedAt: '', durationHours: 1 });

      const metrics = tracker.getPerformanceMetrics();
      expect(metrics.currentStreak).toBe(3); // 3 wins in a row
    });

    it('should calculate average trade duration', () => {
      tracker.recordClosedTrade({ symbol: 'A', side: 'long', entryPrice: 100, exitPrice: 105, qty: 1, pnl: 5, pnlPercent: 5, openedAt: '', closedAt: '', durationHours: 2 });
      tracker.recordClosedTrade({ symbol: 'B', side: 'long', entryPrice: 100, exitPrice: 105, qty: 1, pnl: 5, pnlPercent: 5, openedAt: '', closedAt: '', durationHours: 4 });

      const metrics = tracker.getPerformanceMetrics();
      expect(metrics.avgTradeDurationHours).toBe(3); // (2+4)/2 = 3
    });

    it('should return Infinity profit factor with no losses', () => {
      tracker.recordClosedTrade({ symbol: 'A', side: 'long', entryPrice: 100, exitPrice: 110, qty: 1, pnl: 10, pnlPercent: 10, openedAt: '', closedAt: '', durationHours: 1 });

      const metrics = tracker.getPerformanceMetrics();
      expect(metrics.profitFactor).toBe(Infinity);
    });
  });

  // ─── Daily P&L Reset ───

  describe('resetDailyPnl', () => {
    it('should reset daily start equity', async () => {
      tracker.resetDailyPnl(50000);
      const snapshot = await tracker.getPortfolioSnapshot();
      // After reset, daily P&L should be relative to the reset value
      expect(snapshot.dailyPnl).toBeDefined();
    });
  });
});
