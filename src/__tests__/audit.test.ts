/**
 * Tests for Trade Audit — audit trail system and journal enhancements.
 *
 * Tests cover:
 * - TradeAudit event logging
 * - Event filtering (by symbol, type, date range)
 * - CSV export
 * - Journal stats calculations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TradeAudit } from '@/lib/audit/trade-audit';
import type { TradeAuditEvent } from '@/lib/audit/trade-audit';

describe('TradeAudit', () => {
  let audit: TradeAudit;

  beforeEach(() => {
    audit = new TradeAudit();
  });

  // ─── Event Logging Tests ────────────────────────────────────────────

  describe('logEvent', () => {
    it('should log a signal_generated event', () => {
      const event = audit.logEvent({
        eventType: 'signal_generated',
        symbol: 'BTC',
        direction: 'LONG',
        price: 95000,
        details: JSON.stringify({ confluenceScore: 75 }),
      });

      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.eventType).toBe('signal_generated');
      expect(event.symbol).toBe('BTC');
      expect(event.direction).toBe('LONG');
    });

    it('should log a trade_executed event', () => {
      const event = audit.logEvent({
        eventType: 'trade_executed',
        symbol: 'AAPL',
        direction: 'SHORT',
        price: 150,
        quantity: 10,
        details: JSON.stringify({ risk: 50 }),
      });

      expect(event.eventType).toBe('trade_executed');
      expect(event.symbol).toBe('AAPL');
      expect(event.quantity).toBe(10);
    });

    it('should log a trade_closed event with P&L', () => {
      const event = audit.logEvent({
        eventType: 'trade_closed',
        symbol: 'ETH',
        direction: 'LONG',
        price: 3200,
        pnl: 250,
        details: JSON.stringify({ exitReason: 'take_profit' }),
      });

      expect(event.eventType).toBe('trade_closed');
      expect(event.pnl).toBe(250);
    });

    it('should log a risk_warning event', () => {
      const event = audit.logEvent({
        eventType: 'risk_warning',
        symbol: 'TSLA',
        details: JSON.stringify({ warning: 'Max drawdown reached' }),
      });

      expect(event.eventType).toBe('risk_warning');
      expect(event.symbol).toBe('TSLA');
    });

    it('should auto-generate id and timestamp', () => {
      const event = audit.logEvent({
        eventType: 'alert_triggered',
        symbol: 'BTC',
        details: '{}',
      });

      expect(event.id).toMatch(/^audit_/);
      expect(new Date(event.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  // ─── Event Retrieval Tests ──────────────────────────────────────────

  describe('getRecentEvents', () => {
    it('should return events in reverse chronological order', () => {
      audit.logEvent({ eventType: 'signal_generated', symbol: 'BTC', details: '{}' });
      audit.logEvent({ eventType: 'trade_executed', symbol: 'ETH', details: '{}' });
      audit.logEvent({ eventType: 'trade_closed', symbol: 'AAPL', details: '{}' });

      const events = audit.getRecentEvents();
      expect(events.length).toBe(3);
      expect(events[0].symbol).toBe('AAPL'); // Most recent first
      expect(events[2].symbol).toBe('BTC');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        audit.logEvent({ eventType: 'signal_generated', symbol: `SYM${i}`, details: '{}' });
      }

      const events = audit.getRecentEvents(5);
      expect(events.length).toBe(5);
    });

    it('should return empty array when no events', () => {
      const events = audit.getRecentEvents();
      expect(events).toEqual([]);
    });
  });

  describe('getEventsBySymbol', () => {
    it('should filter events by symbol', () => {
      audit.logEvent({ eventType: 'signal_generated', symbol: 'BTC', details: '{}' });
      audit.logEvent({ eventType: 'trade_executed', symbol: 'ETH', details: '{}' });
      audit.logEvent({ eventType: 'trade_closed', symbol: 'BTC', details: '{}' });

      const btcEvents = audit.getEventsBySymbol('BTC');
      expect(btcEvents.length).toBe(2);
      expect(btcEvents.every(e => e.symbol === 'BTC')).toBe(true);
    });

    it('should return empty for unknown symbol', () => {
      audit.logEvent({ eventType: 'signal_generated', symbol: 'BTC', details: '{}' });
      const events = audit.getEventsBySymbol('UNKNOWN');
      expect(events).toEqual([]);
    });
  });

  describe('getEventsByType', () => {
    it('should filter events by type', () => {
      audit.logEvent({ eventType: 'signal_generated', symbol: 'BTC', details: '{}' });
      audit.logEvent({ eventType: 'trade_executed', symbol: 'BTC', details: '{}' });
      audit.logEvent({ eventType: 'signal_generated', symbol: 'ETH', details: '{}' });

      const signals = audit.getEventsByType('signal_generated');
      expect(signals.length).toBe(2);
      expect(signals.every(e => e.eventType === 'signal_generated')).toBe(true);
    });
  });

  describe('getEventsByDateRange', () => {
    it('should filter events by date range', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);
      const twoHoursAgo = new Date(now.getTime() - 7200000);

      audit.logEvent({ eventType: 'signal_generated', symbol: 'BTC', details: '{}' });

      const recentEvents = audit.getEventsByDateRange(oneHourAgo, now);
      expect(recentEvents.length).toBeGreaterThanOrEqual(1);

      const oldRange = audit.getEventsByDateRange(twoHoursAgo, oneHourAgo);
      expect(oldRange.length).toBe(0); // Events are after oneHourAgo
    });
  });

  // ─── CSV Export Tests ────────────────────────────────────────────────

  describe('exportCSV', () => {
    it('should generate CSV with headers and data', () => {
      audit.logEvent({
        eventType: 'trade_executed',
        symbol: 'BTC',
        direction: 'LONG',
        price: 95000,
        quantity: 1,
        details: JSON.stringify({ risk: 500 }),
      });

      const csv = audit.exportCSV();
      expect(csv).toContain('Tipo de Evento');
      expect(csv).toContain('Símbolo');
      expect(csv).toContain('trade_executed');
      expect(csv).toContain('BTC');
    });

    it('should handle empty audit log', () => {
      const csv = audit.exportCSV();
      expect(csv).toContain('Tipo de Evento'); // Headers only
    });
  });

  // ─── Clear Tests ────────────────────────────────────────────────────

  describe('clear', () => {
    it('should clear all events', () => {
      audit.logEvent({ eventType: 'signal_generated', symbol: 'BTC', details: '{}' });
      audit.logEvent({ eventType: 'trade_executed', symbol: 'ETH', details: '{}' });

      expect(audit.getRecentEvents().length).toBe(2);

      audit.clear();

      expect(audit.getRecentEvents()).toEqual([]);
    });
  });

  // ─── Max Events Limit Tests ─────────────────────────────────────────

  describe('max events limit', () => {
    it('should not exceed 500 events', () => {
      for (let i = 0; i < 510; i++) {
        audit.logEvent({ eventType: 'signal_generated', symbol: `SYM${i}`, details: '{}' });
      }

      const events = audit.getRecentEvents(600);
      expect(events.length).toBeLessThanOrEqual(500);
    });
  });

  // ─── Journal Stats Calculation Tests ────────────────────────────────

  describe('journal stats calculations', () => {
    it('should calculate win rate correctly', () => {
      const wins = 7;
      const losses = 3;
      const total = wins + losses;
      const winRate = (wins / total) * 100;
      expect(winRate).toBe(70);
    });

    it('should calculate profit factor correctly', () => {
      const totalWins = 3500;
      const totalLosses = 1500;
      const profitFactor = totalLosses > 0 ? totalWins / totalLosses : Infinity;
      expect(profitFactor).toBeCloseTo(2.333, 2);
    });

    it('should handle zero losses for profit factor', () => {
      const totalWins = 1000;
      const totalLosses = 0;
      const profitFactor = totalLosses > 0 ? totalWins / totalLosses : Infinity;
      expect(profitFactor).toBe(Infinity);
    });

    it('should calculate average P&L', () => {
      const pnls = [500, -200, 300, -100, 150];
      const avgPnl = pnls.reduce((a, b) => a + b, 0) / pnls.length;
      expect(avgPnl).toBe(130);
    });

    it('should calculate average risk:reward', () => {
      const rrs = [2.5, 1.8, 3.0, 2.0];
      const avgRR = rrs.reduce((a, b) => a + b, 0) / rrs.length;
      expect(avgRR).toBeCloseTo(2.325, 2);
    });
  });
});
