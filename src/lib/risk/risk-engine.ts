import type { ConfluenceResult } from '../types';

/**
 * Risk Management Engine — protects capital by enforcing trading limits.
 *
 * Core rules:
 * 1. Risk per trade: max % of account equity (default 1-2%)
 * 2. Daily loss limit: stop trading after losing X% in a day
 * 3. Max drawdown halt: stop trading if total drawdown exceeds X%
 * 4. Max open positions: limit concurrent exposure
 * 5. Position sizing: calculate shares/contracts based on ATR stop distance
 * 6. Trading schedule: only trade during allowed hours
 */

export interface RiskConfig {
  /** Max risk per trade as % of account equity (default: 1%) */
  maxRiskPerTradePercent: number;
  /** Max daily loss as % of account equity (default: 3%) */
  maxDailyLossPercent: number;
  /** Max total drawdown as % of account equity (default: 10%) */
  maxDrawdownPercent: number;
  /** Max simultaneous open positions (default: 3) */
  maxOpenPositions: number;
  /** Minimum account equity to allow trading (default: $1000) */
  minAccountEquity: number;
  /** Allowed trading hours (UTC) — null = always allowed */
  tradingHours: { start: number; end: number } | null;
  /** Enable/disable trading (master switch) */
  tradingEnabled: boolean;
}

export interface RiskAssessment {
  /** Whether the trade is allowed */
  allowed: boolean;
  /** Reason if not allowed */
  reason: string | null;
  /** Calculated position size in shares/contracts */
  positionSize: number;
  /** Position size in dollar value */
  positionValue: number;
  /** Risk amount in dollars for this trade */
  riskAmount: number;
  /** Risk as % of equity */
  riskPercent: number;
  /** Current daily P&L */
  dailyPnl: number;
  /** Current drawdown from equity peak */
  currentDrawdown: number;
  /** Number of open positions */
  openPositions: number;
  /** Warnings (trade allowed but with cautions) */
  warnings: string[];
}

export interface AccountSnapshot {
  equity: number;
  equityPeak: number;
  dailyPnl: number;
  dailyPnlStart: number; // Timestamp when daily P&L was reset
  openPositions: number;
  unrealizedPnl: number;
  lastTradeTime: number | null;
}

const DEFAULT_CONFIG: RiskConfig = {
  maxRiskPerTradePercent: 1.0,
  maxDailyLossPercent: 3.0,
  maxDrawdownPercent: 10.0,
  maxOpenPositions: 3,
  minAccountEquity: 1000,
  tradingHours: null,
  tradingEnabled: true,
};

/**
 * Risk Engine — evaluates every trade before execution.
 *
 * Usage:
 *   const engine = new RiskEngine(config);
 *   const assessment = engine.assessTrade(confluence, account);
 *   if (assessment.allowed) { executeTrade(assessment.positionSize); }
 */
export class RiskEngine {
  private config: RiskConfig;

  constructor(config: Partial<RiskConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getConfig(): RiskConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<RiskConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Assess whether a trade should be allowed based on risk rules.
   * Returns position size and risk metrics if allowed.
   */
  assessTrade(confluence: ConfluenceResult, account: AccountSnapshot): RiskAssessment {
    const warnings: string[] = [];

    // ─── Rule 0: Master switch ───
    if (!this.config.tradingEnabled) {
      return this.deny('Trading is disabled. Enable trading in risk settings.', account);
    }

    // ─── Rule 1: Direction check ───
    if (confluence.overallDirection === 'NEUTRAL') {
      return this.deny('Signal direction is NEUTRAL. No trade recommended.', account);
    }

    // ─── Rule 2: Minimum equity ───
    if (account.equity < this.config.minAccountEquity) {
      return this.deny(
        `Account equity ($${account.equity.toFixed(2)}) below minimum ($${this.config.minAccountEquity}). Deposit more funds.`,
        account
      );
    }

    // ─── Rule 3: Max drawdown halt ───
    const currentDrawdown = this.calculateDrawdown(account);
    if (currentDrawdown >= this.config.maxDrawdownPercent) {
      return this.deny(
        `Max drawdown reached (${currentDrawdown.toFixed(1)}% ≥ ${this.config.maxDrawdownPercent}%). Trading halted. Review strategy.`,
        account
      );
    }
    if (currentDrawdown >= this.config.maxDrawdownPercent * 0.8) {
      warnings.push(`Approaching max drawdown: ${currentDrawdown.toFixed(1)}% / ${this.config.maxDrawdownPercent}%`);
    }

    // ─── Rule 4: Daily loss limit ───
    const dailyLossPercent = Math.abs(Math.min(0, account.dailyPnl)) / account.equity * 100;
    if (dailyLossPercent >= this.config.maxDailyLossPercent) {
      return this.deny(
        `Daily loss limit reached (${dailyLossPercent.toFixed(1)}% ≥ ${this.config.maxDailyLossPercent}%). Stop trading for today.`,
        account
      );
    }
    if (dailyLossPercent >= this.config.maxDailyLossPercent * 0.7) {
      warnings.push(`Approaching daily loss limit: ${dailyLossPercent.toFixed(1)}% / ${this.config.maxDailyLossPercent}%`);
    }

    // ─── Rule 5: Max open positions ───
    if (account.openPositions >= this.config.maxOpenPositions) {
      return this.deny(
        `Max open positions reached (${account.openPositions} / ${this.config.maxOpenPositions}). Close a position first.`,
        account
      );
    }

    // ─── Rule 6: Trading hours ───
    if (this.config.tradingHours) {
      const nowUTC = new Date().getUTCHours();
      const { start, end } = this.config.tradingHours;
      const withinHours = start < end
        ? (nowUTC >= start && nowUTC < end)
        : (nowUTC >= start || nowUTC < end); // Overnight session
      if (!withinHours) {
        return this.deny(
          `Outside trading hours (${start}:00-${end}:00 UTC). Current: ${nowUTC}:00 UTC.`,
          account
        );
      }
    }

    // ─── Rule 7: Confluence score check ───
    if (confluence.confluenceScore < 30) {
      return this.deny(
        `Confluence too low (${confluence.confluenceScore}%). Minimum 30% required.`,
        account
      );
    }
    if (confluence.confluenceScore < 50) {
      warnings.push(`Low confluence (${confluence.confluenceScore}%). Consider higher threshold.`);
    }

    // ─── Calculate position size ───
    const riskAmount = account.equity * (this.config.maxRiskPerTradePercent / 100);
    const stopDistance = Math.abs(confluence.entryPrice - confluence.stopLoss);

    let positionSize = 0;
    let positionValue = 0;
    let riskPercent = 0;

    if (stopDistance > 0) {
      positionSize = Math.floor(riskAmount / stopDistance);
      positionValue = positionSize * confluence.entryPrice;
      riskPercent = (riskAmount / account.equity) * 100;

      // Don't risk more than available equity
      if (positionValue > account.equity * 0.95) {
        positionSize = Math.floor((account.equity * 0.95) / confluence.entryPrice);
        positionValue = positionSize * confluence.entryPrice;
        warnings.push('Position size reduced to 95% of equity. Consider using margin or smaller size.');
      }

      // Minimum 1 share/contract
      if (positionSize < 1) {
        return this.deny(
          `Cannot afford minimum position. Risk amount $${riskAmount.toFixed(2)} / stop distance $${stopDistance.toFixed(2)} = ${positionSize.toFixed(2)} shares.`,
          account
        );
      }
    } else {
      return this.deny('Stop loss distance is zero. Cannot calculate position size.', account);
    }

    // ─── Risk/Reward check ───
    if (confluence.riskReward < 1.5) {
      warnings.push(`Risk:Reward ratio is ${confluence.riskReward.toFixed(2)}. Minimum recommended: 1.5`);
    }

    return {
      allowed: true,
      reason: null,
      positionSize,
      positionValue,
      riskAmount,
      riskPercent,
      dailyPnl: account.dailyPnl,
      currentDrawdown,
      openPositions: account.openPositions,
      warnings,
    };
  }

  /**
   * Calculate current drawdown from equity peak.
   */
  private calculateDrawdown(account: AccountSnapshot): number {
    if (account.equityPeak <= 0) return 0;
    return ((account.equityPeak - account.equity) / account.equityPeak) * 100;
  }

  /**
   * Create a denied assessment with reason.
   */
  private deny(reason: string, account: AccountSnapshot): RiskAssessment {
    return {
      allowed: false,
      reason,
      positionSize: 0,
      positionValue: 0,
      riskAmount: 0,
      riskPercent: 0,
      dailyPnl: account.dailyPnl,
      currentDrawdown: this.calculateDrawdown(account),
      openPositions: account.openPositions,
      warnings: [],
    };
  }

  /**
   * Check if daily P&L should be reset (new trading day).
   */
  shouldResetDailyPnl(account: AccountSnapshot): boolean {
    if (!account.dailyPnlStart) return true;
    const now = new Date();
    const lastReset = new Date(account.dailyPnlStart);
    return now.getUTCDate() !== lastReset.getUTCDate() ||
           now.getUTCMonth() !== lastReset.getUTCMonth();
  }

  /**
   * Create a fresh account snapshot for a new day.
   */
  resetDailyPnl(account: AccountSnapshot): AccountSnapshot {
    return {
      ...account,
      dailyPnl: 0,
      dailyPnlStart: Date.now(),
    };
  }
}

/**
 * Position Sizer — standalone function for quick position size calculation.
 *
 * Uses the fixed-fractional method: risk X% of equity per trade,
 * position size = risk amount / stop distance.
 */
export function calculatePositionSize(
  equity: number,
  riskPercent: number,
  entryPrice: number,
  stopLoss: number,
): { shares: number; value: number; riskAmount: number } {
  const riskAmount = equity * (riskPercent / 100);
  const stopDistance = Math.abs(entryPrice - stopLoss);
  if (stopDistance <= 0) return { shares: 0, value: 0, riskAmount: 0 };
  const shares = Math.floor(riskAmount / stopDistance);
  return {
    shares: Math.max(0, shares),
    value: shares * entryPrice,
    riskAmount,
  };
}
