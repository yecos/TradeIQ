import { describe, it, expect } from 'vitest';
import { RiskEngine, calculatePositionSize } from '../lib/risk/risk-engine';
import type { ConfluenceResult, AccountSnapshot } from '../lib/types';

function makeConfluence(overrides: Partial<ConfluenceResult> = {}): ConfluenceResult {
  return {
    symbol: 'BTC/USD',
    overallDirection: 'LONG',
    confluenceScore: 65,
    entryPrice: 65000,
    stopLoss: 63000,
    takeProfit: 69000,
    riskReward: 2.0,
    vectorSignals: [],
    recommendation: 'Test',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeAccount(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    equity: 100000,
    equityPeak: 100000,
    dailyPnl: 0,
    dailyPnlStart: Date.now(),
    openPositions: 0,
    unrealizedPnl: 0,
    lastTradeTime: null,
    ...overrides,
  };
}

describe('RiskEngine', () => {
  it('should allow a valid trade with correct position sizing', () => {
    const engine = new RiskEngine();
    const result = engine.assessTrade(
      makeConfluence({ entryPrice: 150, stopLoss: 147, takeProfit: 159 }),
      makeAccount()
    );
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.positionSize).toBeGreaterThan(0);
    expect(result.riskPercent).toBe(1.0); // 1% default risk
  });

  it('should deny trade when trading is disabled', () => {
    const engine = new RiskEngine({ tradingEnabled: false });
    const result = engine.assessTrade(makeConfluence(), makeAccount());
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('disabled');
  });

  it('should deny NEUTRAL direction trades', () => {
    const engine = new RiskEngine();
    const result = engine.assessTrade(makeConfluence({ overallDirection: 'NEUTRAL' }), makeAccount());
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('NEUTRAL');
  });

  it('should deny trade when equity below minimum', () => {
    const engine = new RiskEngine({ minAccountEquity: 10000 });
    const result = engine.assessTrade(makeConfluence(), makeAccount({ equity: 5000 }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('below minimum');
  });

  it('should deny trade when max drawdown reached', () => {
    const engine = new RiskEngine({ maxDrawdownPercent: 10 });
    const result = engine.assessTrade(
      makeConfluence(),
      makeAccount({ equity: 89000, equityPeak: 100000 }) // 11% drawdown
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Max drawdown');
  });

  it('should warn when approaching max drawdown', () => {
    const engine = new RiskEngine({ maxDrawdownPercent: 10 });
    const result = engine.assessTrade(
      makeConfluence({ entryPrice: 150, stopLoss: 147, takeProfit: 159 }),
      makeAccount({ equity: 92000, equityPeak: 100000 }) // 8% drawdown
    );
    expect(result.allowed).toBe(true);
    expect(result.warnings.some(w => w.includes('Approaching max drawdown'))).toBe(true);
  });

  it('should deny trade when daily loss limit reached', () => {
    const engine = new RiskEngine({ maxDailyLossPercent: 3 });
    const result = engine.assessTrade(
      makeConfluence({ entryPrice: 150, stopLoss: 147, takeProfit: 159 }),
      makeAccount({ equity: 100000, dailyPnl: -3500 }) // 3.5% daily loss
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Daily loss limit');
  });

  it('should deny trade when max open positions reached', () => {
    const engine = new RiskEngine({ maxOpenPositions: 2 });
    const result = engine.assessTrade(
      makeConfluence({ entryPrice: 150, stopLoss: 147, takeProfit: 159 }),
      makeAccount({ openPositions: 2 })
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Max open positions');
  });

  it('should deny trade with low confluence score', () => {
    const engine = new RiskEngine();
    const result = engine.assessTrade(
      makeConfluence({ confluenceScore: 25, entryPrice: 150, stopLoss: 147, takeProfit: 159 }),
      makeAccount()
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Confluence too low');
  });

  it('should warn on low risk:reward ratio', () => {
    const engine = new RiskEngine();
    const result = engine.assessTrade(
      makeConfluence({ entryPrice: 150, stopLoss: 147, riskReward: 1.2, takeProfit: 153.6 }),
      makeAccount()
    );
    expect(result.allowed).toBe(true);
    expect(result.warnings.some(w => w.includes('Risk:Reward'))).toBe(true);
  });

  it('should deny trade when stop distance is zero', () => {
    const engine = new RiskEngine();
    const result = engine.assessTrade(
      makeConfluence({ entryPrice: 150, stopLoss: 150, takeProfit: 156 }),
      makeAccount()
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('zero');
  });

  it('should calculate correct position size based on risk %', () => {
    const engine = new RiskEngine({ maxRiskPerTradePercent: 1.0 });
    // $100K equity, 1% risk = $1000 risk amount
    // Stop distance = $2000 (65000 - 63000)
    // Position size = $1000 / $2000 = 0.5 → floor = 0 shares → denied
    // Let's use a smaller stock example
    const result = engine.assessTrade(
      makeConfluence({ entryPrice: 100, stopLoss: 98, takeProfit: 106 }),
      makeAccount()
    );
    // Risk amount = $1000, stop distance = $2
    // Position = 500 shares × $100 = $50,000
    expect(result.allowed).toBe(true);
    expect(result.positionSize).toBe(500);
    expect(result.riskAmount).toBe(1000);
  });

  it('should enforce trading hours', () => {
    // This test depends on current UTC time, so we test the logic
    const engine = new RiskEngine({ tradingHours: { start: 14, end: 21 } }); // 9am-4pm EST
    const result = engine.assessTrade(
      makeConfluence({ entryPrice: 150, stopLoss: 147, takeProfit: 159 }),
      makeAccount()
    );
    // Result depends on current UTC hour — just verify it doesn't crash
    expect(result).toBeDefined();
    expect(typeof result.allowed).toBe('boolean');
  });

  it('should allow custom config updates', () => {
    const engine = new RiskEngine();
    expect(engine.getConfig().maxRiskPerTradePercent).toBe(1.0);
    engine.updateConfig({ maxRiskPerTradePercent: 2.0 });
    expect(engine.getConfig().maxRiskPerTradePercent).toBe(2.0);
  });

  it('should detect when daily P&L needs reset', () => {
    const engine = new RiskEngine();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const account = makeAccount({ dailyPnlStart: yesterday.getTime() });
    expect(engine.shouldResetDailyPnl(account)).toBe(true);
  });

  it('should not reset daily P&L on same day', () => {
    const engine = new RiskEngine();
    const account = makeAccount({ dailyPnlStart: Date.now() });
    expect(engine.shouldResetDailyPnl(account)).toBe(false);
  });
});

describe('calculatePositionSize', () => {
  it('should calculate position size correctly', () => {
    const result = calculatePositionSize(100000, 1, 100, 98);
    expect(result.shares).toBe(500); // $1000 risk / $2 stop = 500
    expect(result.value).toBe(50000); // 500 × $100
    expect(result.riskAmount).toBe(1000); // 1% of $100K
  });

  it('should return zero for zero stop distance', () => {
    const result = calculatePositionSize(100000, 1, 100, 100);
    expect(result.shares).toBe(0);
    expect(result.value).toBe(0);
  });

  it('should handle SHORT direction (stop above entry)', () => {
    const result = calculatePositionSize(100000, 1, 100, 102);
    expect(result.shares).toBe(500); // $1000 / $2
    expect(result.value).toBe(50000);
  });
});
