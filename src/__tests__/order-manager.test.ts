import { describe, it, expect, beforeEach } from 'vitest';
import { OrderManager } from '@/lib/broker/order-manager';
import { MockBroker } from '@/lib/broker/mock-broker';
import type { ConfluenceResult } from '@/lib/types';

// Helper to create a valid confluence signal
function createConfluence(overrides: Partial<ConfluenceResult> = {}): ConfluenceResult {
  return {
    symbol: 'AAPL',
    overallDirection: 'LONG',
    confluenceScore: 65,
    entryPrice: 150,
    stopLoss: 147,
    takeProfit: 156,
    riskReward: 2.0,
    vectorSignals: [{
      vectorId: 'technical',
      vectorName: 'Technical',
      direction: 'LONG',
      strength: 70,
      confidence: 75,
      detail: 'RSI oversold, MACD bullish crossover',
    }],
    recommendation: 'LONG signal with 65% confluence',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('OrderManager', () => {
  let broker: MockBroker;
  let orderManager: OrderManager;

  beforeEach(() => {
    broker = new MockBroker();
    // Default config allows trading with 1% risk per trade
    orderManager = new OrderManager(broker, {
      tradingEnabled: true,
      maxRiskPerTradePercent: 1.0,
      minAccountEquity: 1000,
      maxDrawdownPercent: 10,
      maxDailyLossPercent: 3,
      maxOpenPositions: 3,
      tradingHours: null,
    });
  });

  // ─── assessTrade ───

  describe('assessTrade', () => {
    it('should allow a valid LONG trade', async () => {
      const confluence = createConfluence();
      const assessment = await orderManager.assessTrade(confluence);

      expect(assessment.allowed).toBe(true);
      expect(assessment.positionSize).toBeGreaterThan(0);
      expect(assessment.reason).toBeNull();
    });

    it('should allow a valid SHORT trade', async () => {
      const confluence = createConfluence({
        overallDirection: 'SHORT',
        entryPrice: 150,
        stopLoss: 153,
        takeProfit: 144,
      });
      const assessment = await orderManager.assessTrade(confluence);

      expect(assessment.allowed).toBe(true);
      expect(assessment.positionSize).toBeGreaterThan(0);
    });

    it('should deny NEUTRAL direction', async () => {
      const confluence = createConfluence({ overallDirection: 'NEUTRAL' });
      const assessment = await orderManager.assessTrade(confluence);

      expect(assessment.allowed).toBe(false);
      expect(assessment.reason).toContain('NEUTRAL');
    });

    it('should deny when trading is disabled', async () => {
      orderManager.updateRiskConfig({ tradingEnabled: false });
      const confluence = createConfluence();
      const assessment = await orderManager.assessTrade(confluence);

      expect(assessment.allowed).toBe(false);
      expect(assessment.reason).toContain('disabled');
    });

    it('should deny when confluence is too low', async () => {
      const confluence = createConfluence({ confluenceScore: 20 });
      const assessment = await orderManager.assessTrade(confluence);

      expect(assessment.allowed).toBe(false);
      expect(assessment.reason).toContain('Confluence too low');
    });

    it('should warn on low confluence (30-50%)', async () => {
      const confluence = createConfluence({ confluenceScore: 45 });
      const assessment = await orderManager.assessTrade(confluence);

      expect(assessment.allowed).toBe(true);
      expect(assessment.warnings.some(w => w.includes('Low confluence'))).toBe(true);
    });

    it('should warn on low R:R ratio', async () => {
      const confluence = createConfluence({ riskReward: 1.0 });
      const assessment = await orderManager.assessTrade(confluence);

      expect(assessment.allowed).toBe(true);
      expect(assessment.warnings.some(w => w.includes('Risk:Reward'))).toBe(true);
    });
  });

  // ─── executeTrade ───

  describe('executeTrade', () => {
    it('should execute a valid LONG trade', async () => {
      const confluence = createConfluence();
      const result = await orderManager.executeTrade(confluence);

      expect(result.executed).toBe(true);
      expect(result.order).not.toBeNull();
      expect(result.order?.symbol).toBe('AAPL');
      expect(result.order?.side).toBe('buy');
      expect(result.risk.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should execute a valid SHORT trade', async () => {
      const confluence = createConfluence({
        overallDirection: 'SHORT',
        entryPrice: 150,
        stopLoss: 153,
        takeProfit: 144,
      });
      const result = await orderManager.executeTrade(confluence);

      expect(result.executed).toBe(true);
      expect(result.order?.side).toBe('sell');
    });

    it('should not execute a denied trade', async () => {
      const confluence = createConfluence({ overallDirection: 'NEUTRAL' });
      const result = await orderManager.executeTrade(confluence);

      expect(result.executed).toBe(false);
      expect(result.order).toBeNull();
      expect(result.error).toBeTruthy();
    });

    it('should return error when trading disabled', async () => {
      orderManager.updateRiskConfig({ tradingEnabled: false });
      const confluence = createConfluence();
      const result = await orderManager.executeTrade(confluence);

      expect(result.executed).toBe(false);
      expect(result.error).toContain('disabled');
    });

    it('should include timestamp in result', async () => {
      const confluence = createConfluence();
      const before = Date.now();
      const result = await orderManager.executeTrade(confluence);
      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });

    it('should handle broker errors gracefully', async () => {
      // Create a broken broker that throws
      const brokenBroker = new MockBroker();
      // Override submitOrder to throw
      const originalSubmit = brokenBroker.submitOrder.bind(brokenBroker);
      brokenBroker.submitOrder = async () => { throw new Error('Broker unavailable'); };

      const om = new OrderManager(brokenBroker, {
        tradingEnabled: true,
        minAccountEquity: 1000,
      });
      const confluence = createConfluence();
      const result = await om.executeTrade(confluence);

      expect(result.executed).toBe(false);
      expect(result.error).toContain('Broker unavailable');
    });
  });

  // ─── Risk config management ───

  describe('riskConfig', () => {
    it('should return default risk config', () => {
      const config = orderManager.getRiskConfig();
      expect(config.tradingEnabled).toBe(true);
      expect(config.maxRiskPerTradePercent).toBe(1.0);
    });

    it('should update risk config', () => {
      orderManager.updateRiskConfig({ maxRiskPerTradePercent: 2.0 });
      const config = orderManager.getRiskConfig();
      expect(config.maxRiskPerTradePercent).toBe(2.0);
    });

    it('should respect updated risk config in assessments', async () => {
      const confluence = createConfluence();

      // With 1% risk
      const assessment1 = await orderManager.assessTrade(confluence);
      orderManager.updateRiskConfig({ maxRiskPerTradePercent: 2.0 });
      const assessment2 = await orderManager.assessTrade(confluence);

      // Higher risk % should allow larger position
      expect(assessment2.positionSize).toBeGreaterThanOrEqual(assessment1.positionSize);
    });
  });

  // ─── Position sizing ───

  describe('position sizing', () => {
    it('should calculate position based on risk % and stop distance', async () => {
      // Mock account has $100,000 equity, 1% risk = $1,000
      // Stop distance: $150 - $147 = $3
      // Position size: $1000 / $3 = 333 shares
      const confluence = createConfluence({
        entryPrice: 150,
        stopLoss: 147,
      });
      const assessment = await orderManager.assessTrade(confluence);

      expect(assessment.allowed).toBe(true);
      expect(assessment.positionSize).toBe(333); // 1000/3 = 333.33, floor to 333
      expect(assessment.riskAmount).toBe(1000); // 1% of 100k
    });

    it('should deny when position size is less than 1', async () => {
      // Very small risk amount vs large stop distance
      orderManager.updateRiskConfig({
        maxRiskPerTradePercent: 0.001, // 0.001% of 100k = $1
      });
      const confluence = createConfluence({
        entryPrice: 50000, // e.g. BTC
        stopLoss: 49000,
      });
      const assessment = await orderManager.assessTrade(confluence);

      expect(assessment.allowed).toBe(false);
      expect(assessment.reason).toContain('Cannot afford');
    });
  });
});
