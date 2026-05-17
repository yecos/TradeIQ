/**
 * Tests for Alert System — AlertEngine logic and alert validation.
 *
 * Tests cover:
 * - Condition evaluation (price, change%, volume, confluence)
 * - Alert creation factories
 * - Operator behavior (>=, <=, ==, !=, crosses_above, crosses_below)
 * - Alert severity classification
 * - Batch evaluation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AlertEngine } from '@/lib/alerts/alert-engine';
import type { AlertCondition } from '@/lib/alerts/alert-engine';

describe('AlertEngine', () => {
  const engine = new AlertEngine();

  beforeEach(() => {
    engine.resetPreviousValues();
  });

  // ─── Condition Evaluation Tests ────────────────────────────────────────

  describe('evaluateCondition', () => {
    it('should evaluate >= operator correctly', () => {
      const condition: AlertCondition = { field: 'price', operator: '>=', value: 100 };
      expect(engine.evaluateCondition(condition, { price: 100 })).toBe(true);
      expect(engine.evaluateCondition(condition, { price: 101 })).toBe(true);
      expect(engine.evaluateCondition(condition, { price: 99 })).toBe(false);
    });

    it('should evaluate <= operator correctly', () => {
      const condition: AlertCondition = { field: 'price', operator: '<=', value: 100 };
      expect(engine.evaluateCondition(condition, { price: 100 })).toBe(true);
      expect(engine.evaluateCondition(condition, { price: 99 })).toBe(true);
      expect(engine.evaluateCondition(condition, { price: 101 })).toBe(false);
    });

    it('should evaluate == operator correctly', () => {
      const condition: AlertCondition = { field: 'confluence_score', operator: '==', value: 75 };
      expect(engine.evaluateCondition(condition, { confluenceScore: 75 })).toBe(true);
      expect(engine.evaluateCondition(condition, { confluenceScore: 74 })).toBe(false);
      expect(engine.evaluateCondition(condition, { confluenceScore: 76 })).toBe(false);
    });

    it('should evaluate != operator correctly', () => {
      const condition: AlertCondition = { field: 'volume', operator: '!=', value: 0 };
      expect(engine.evaluateCondition(condition, { volume: 100 })).toBe(true);
      expect(engine.evaluateCondition(condition, { volume: 0 })).toBe(false);
    });

    it('should return false when field data is missing', () => {
      const condition: AlertCondition = { field: 'price', operator: '>=', value: 100 };
      expect(engine.evaluateCondition(condition, {})).toBe(false);
      expect(engine.evaluateCondition(condition, { volume: 500 })).toBe(false);
    });

    it('should handle change_percent field', () => {
      const condition: AlertCondition = { field: 'change_percent', operator: '>=', value: 5 };
      expect(engine.evaluateCondition(condition, { changePercent: 5 })).toBe(true);
      expect(engine.evaluateCondition(condition, { changePercent: 4.9 })).toBe(false);
      expect(engine.evaluateCondition(condition, { changePercent: 10 })).toBe(true);
    });

    it('should handle volume field', () => {
      const condition: AlertCondition = { field: 'volume', operator: '>=', value: 1000000 };
      expect(engine.evaluateCondition(condition, { volume: 1500000 })).toBe(true);
      expect(engine.evaluateCondition(condition, { volume: 500000 })).toBe(false);
    });

    it('should handle confluence_score field', () => {
      const condition: AlertCondition = { field: 'confluence_score', operator: '>=', value: 70 };
      expect(engine.evaluateCondition(condition, { confluenceScore: 80 })).toBe(true);
      expect(engine.evaluateCondition(condition, { confluenceScore: 60 })).toBe(false);
    });

    it('should detect crosses_above when value transitions above threshold', () => {
      const condition: AlertCondition = { field: 'price', operator: 'crosses_above', value: 100 };

      // First evaluation: no previous value, so just check if current >= threshold
      expect(engine.evaluateCondition(condition, { price: 105 })).toBe(true);
      // Reset to test with previous value
      engine.resetPreviousValues();

      // Set previous value below threshold
      engine.evaluateCondition(condition, { price: 95 });
      // Now price crosses above 100
      expect(engine.evaluateCondition(condition, { price: 105 })).toBe(true);
    });

    it('should NOT trigger crosses_above when value stays above threshold', () => {
      const condition: AlertCondition = { field: 'price', operator: 'crosses_above', value: 100 };
      engine.resetPreviousValues();

      // Set previous value above threshold
      engine.evaluateCondition(condition, { price: 105 });
      // Price stays above
      expect(engine.evaluateCondition(condition, { price: 110 })).toBe(false);
    });

    it('should detect crosses_below when value transitions below threshold', () => {
      const condition: AlertCondition = { field: 'price', operator: 'crosses_below', value: 100 };
      engine.resetPreviousValues();

      // Set previous value above threshold
      engine.evaluateCondition(condition, { price: 105 });
      // Now price crosses below 100
      expect(engine.evaluateCondition(condition, { price: 95 })).toBe(true);
    });

    it('should NOT trigger crosses_below when value stays below threshold', () => {
      const condition: AlertCondition = { field: 'price', operator: 'crosses_below', value: 100 };
      engine.resetPreviousValues();

      // Set previous value below threshold
      engine.evaluateCondition(condition, { price: 95 });
      // Price stays below
      expect(engine.evaluateCondition(condition, { price: 90 })).toBe(false);
    });
  });

  // ─── Alert Factory Tests ───────────────────────────────────────────────

  describe('createPriceTargetAlert', () => {
    it('should create a price target alert with >= operator', () => {
      const alert = engine.createPriceTargetAlert('BTC', 100000, '>=');
      expect(alert.type).toBe('price_target');
      expect(alert.symbol).toBe('BTC');
      expect(alert.title).toContain('BTC');
      expect(alert.condition.field).toBe('price');
      expect(alert.condition.operator).toBe('>=');
      expect(alert.condition.value).toBe(100000);
      expect(alert.severity).toBe('info');
    });

    it('should create a price target alert with <= operator', () => {
      const alert = engine.createPriceTargetAlert('AAPL', 150, '<=');
      expect(alert.condition.operator).toBe('<=');
      expect(alert.condition.value).toBe(150);
    });

    it('should create a price target alert with crosses_above operator', () => {
      const alert = engine.createPriceTargetAlert('ETH', 3000, 'crosses_above');
      expect(alert.condition.operator).toBe('crosses_above');
      expect(alert.symbol).toBe('ETH');
    });

    it('should create a price target alert with crosses_below operator', () => {
      const alert = engine.createPriceTargetAlert('SOL', 100, 'crosses_below');
      expect(alert.condition.operator).toBe('crosses_below');
    });
  });

  describe('createConfluenceAlert', () => {
    it('should create a confluence alert with warning severity', () => {
      const alert = engine.createConfluenceAlert('BTC', 70);
      expect(alert.type).toBe('confluence');
      expect(alert.symbol).toBe('BTC');
      expect(alert.condition.field).toBe('confluence_score');
      expect(alert.condition.operator).toBe('>=');
      expect(alert.condition.value).toBe(70);
      expect(alert.severity).toBe('warning');
    });

    it('should create a high confluence alert', () => {
      const alert = engine.createConfluenceAlert('NVDA', 85);
      expect(alert.condition.value).toBe(85);
    });
  });

  describe('createRiskEventAlert', () => {
    it('should create a risk event alert with warning severity', () => {
      const alert = engine.createRiskEventAlert('BTC', 'Max drawdown reached', 'warning');
      expect(alert.type).toBe('risk_event');
      expect(alert.symbol).toBe('BTC');
      expect(alert.severity).toBe('warning');
      expect(alert.message).toContain('Max drawdown');
      expect(alert.isTriggered).toBe(true);
    });

    it('should create a critical risk event alert', () => {
      const alert = engine.createRiskEventAlert('AAPL', 'Daily loss limit breached', 'critical');
      expect(alert.severity).toBe('critical');
      expect(alert.isTriggered).toBe(true);
      expect(alert.triggeredAt).toBeDefined();
    });
  });

  describe('createTradeAlert', () => {
    it('should create a trade executed alert for LONG', () => {
      const alert = engine.createTradeAlert('BTC', 'LONG', 95000);
      expect(alert.type).toBe('trade_executed');
      expect(alert.symbol).toBe('BTC');
      expect(alert.message).toContain('Compra');
      expect(alert.severity).toBe('info');
      expect(alert.isTriggered).toBe(true);
    });

    it('should create a trade executed alert for SHORT', () => {
      const alert = engine.createTradeAlert('AAPL', 'SHORT', 150);
      expect(alert.message).toContain('Venta');
      expect(alert.isTriggered).toBe(true);
    });
  });

  // ─── Batch Evaluation Tests ────────────────────────────────────────────

  describe('evaluateAlerts', () => {
    it('should return IDs of triggered alerts', () => {
      const alert1 = { ...engine.createPriceTargetAlert('BTC', 100000, '>='), id: 'alert-1', isTriggered: false };
      const alert2 = { ...engine.createPriceTargetAlert('BTC', 90000, '<='), id: 'alert-2', isTriggered: false };
      const alert3 = { ...engine.createConfluenceAlert('BTC', 70), id: 'alert-3', isTriggered: false };

      const triggeredIds = engine.evaluateAlerts([alert1, alert2, alert3], {
        price: 105000,
        confluenceScore: 75,
      });

      expect(triggeredIds).toContain('alert-1');  // BTC >= 100000 ✓
      expect(triggeredIds).not.toContain('alert-2');  // BTC <= 90000 ✗
      expect(triggeredIds).toContain('alert-3');  // confluence >= 70 ✓
    });

    it('should skip already triggered alerts', () => {
      const alert = { ...engine.createPriceTargetAlert('BTC', 100000, '>='), id: 'alert-1', isTriggered: true };

      const triggeredIds = engine.evaluateAlerts([alert], { price: 105000 });
      expect(triggeredIds).not.toContain('alert-1');
    });

    it('should handle empty alerts array', () => {
      const results = engine.evaluateAlerts([], { price: 100 });
      expect(results).toEqual([]);
    });
  });

  // ─── Alert Default State Tests ─────────────────────────────────────────

  describe('alert defaults', () => {
    it('should create price target alerts as unread and untriggered', () => {
      const alert = engine.createPriceTargetAlert('BTC', 100000, '>=');
      expect(alert.isRead).toBe(false);
      expect(alert.isTriggered).toBe(false);
      expect(alert.triggeredAt).toBeUndefined();
    });

    it('should create confluence alerts as unread and untriggered', () => {
      const alert = engine.createConfluenceAlert('BTC', 70);
      expect(alert.isRead).toBe(false);
      expect(alert.isTriggered).toBe(false);
    });

    it('should create risk events as triggered immediately', () => {
      const alert = engine.createRiskEventAlert('BTC', 'test', 'warning');
      expect(alert.isTriggered).toBe(true);
      expect(alert.triggeredAt).toBeDefined();
    });

    it('should create trade alerts as triggered immediately', () => {
      const alert = engine.createTradeAlert('BTC', 'LONG', 95000);
      expect(alert.isTriggered).toBe(true);
      expect(alert.triggeredAt).toBeDefined();
    });
  });

  // ─── Condition JSON Serialization Tests ────────────────────────────────

  describe('condition serialization', () => {
    it('should serialize and deserialize conditions correctly', () => {
      const condition: AlertCondition = {
        field: 'price',
        operator: '>=',
        value: 100000,
      };

      const json = JSON.stringify(condition);
      const parsed = JSON.parse(json) as AlertCondition;

      expect(parsed.field).toBe('price');
      expect(parsed.operator).toBe('>=');
      expect(parsed.value).toBe(100000);
    });

    it('should handle complex condition serialization', () => {
      const condition: AlertCondition = {
        field: 'confluence_score',
        operator: 'crosses_above',
        value: 75.5,
      };

      const json = JSON.stringify(condition);
      const parsed = JSON.parse(json) as AlertCondition;

      expect(parsed.field).toBe('confluence_score');
      expect(parsed.operator).toBe('crosses_above');
      expect(parsed.value).toBe(75.5);
    });
  });

  // ─── Severity Classification Tests ─────────────────────────────────────

  describe('severity classification', () => {
    it('should assign info severity to price target alerts', () => {
      const alert = engine.createPriceTargetAlert('BTC', 100000, '>=');
      expect(alert.severity).toBe('info');
    });

    it('should assign warning severity to confluence alerts', () => {
      const alert = engine.createConfluenceAlert('BTC', 70);
      expect(alert.severity).toBe('warning');
    });

    it('should allow custom severity for risk alerts', () => {
      const warning = engine.createRiskEventAlert('BTC', 'test', 'warning');
      expect(warning.severity).toBe('warning');

      const critical = engine.createRiskEventAlert('BTC', 'test', 'critical');
      expect(critical.severity).toBe('critical');
    });

    it('should assign info severity to trade alerts', () => {
      const alert = engine.createTradeAlert('BTC', 'LONG', 95000);
      expect(alert.severity).toBe('info');
    });
  });
});
