import type { BrokerProvider, BrokerPosition } from './broker-interface';

/**
 * Position Tracker — tracks positions, P&L, and portfolio metrics over time.
 *
 * Key features:
 * - Real-time position monitoring from broker
 * - Total portfolio P&L (realized + unrealized)
 * - Daily P&L tracking with equity curve
 * - Position history (opened/closed trades)
 * - Performance metrics (win rate, profit factor, Sharpe)
 */

/** A closed trade record */
export interface ClosedTrade {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  qty: number;
  pnl: number;
  pnlPercent: number;
  openedAt: string;
  closedAt: string;
  durationHours: number;
}

/** Portfolio snapshot at a point in time */
export interface PortfolioSnapshot {
  timestamp: number;
  equity: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalPnl: number;
  positions: number;
  dailyPnl: number;
}

/** Performance metrics */
export interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  totalPnl: number;
  totalPnlPercent: number;
  bestTrade: number;
  worstTrade: number;
  avgTradeDurationHours: number;
  currentStreak: number; // positive = winning, negative = losing
}

export class PositionTracker {
  private broker: BrokerProvider;
  private closedTrades: ClosedTrade[] = [];
  private equityHistory: PortfolioSnapshot[] = [];
  private dailyStartEquity: number = 0;
  private dailyStartTimestamp: number = Date.now();

  constructor(broker: BrokerProvider) {
    this.broker = broker;
  }

  /**
   * Get current open positions from the broker.
   */
  async getOpenPositions(): Promise<BrokerPosition[]> {
    return this.broker.getPositions();
  }

  /**
   * Get current portfolio snapshot.
   */
  async getPortfolioSnapshot(): Promise<PortfolioSnapshot> {
    try {
      const account = await this.broker.getAccount();
      const positions = await this.broker.getPositions();

      const unrealizedPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
      const realizedPnl = this.calculateRealizedPnl();
      const totalPnl = unrealizedPnl + realizedPnl;

      // Daily P&L: equity change since start of day
      if (this.dailyStartEquity === 0) {
        this.dailyStartEquity = account.equity - unrealizedPnl;
      }
      const dailyPnl = account.equity - this.dailyStartEquity;

      const snapshot: PortfolioSnapshot = {
        timestamp: Date.now(),
        equity: account.equity,
        unrealizedPnl,
        realizedPnl,
        totalPnl,
        positions: positions.length,
        dailyPnl,
      };

      // Store in history (max 1440 entries = 24h at 1-minute intervals)
      this.equityHistory.push(snapshot);
      if (this.equityHistory.length > 1440) {
        this.equityHistory = this.equityHistory.slice(-1440);
      }

      return snapshot;
    } catch {
      return {
        timestamp: Date.now(),
        equity: 0,
        unrealizedPnl: 0,
        realizedPnl: 0,
        totalPnl: 0,
        positions: 0,
        dailyPnl: 0,
      };
    }
  }

  /**
   * Record a closed trade for performance tracking.
   */
  recordClosedTrade(trade: Omit<ClosedTrade, 'id'>): void {
    const closedTrade: ClosedTrade = {
      ...trade,
      id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    this.closedTrades.unshift(closedTrade);

    // Keep max 500 trades
    if (this.closedTrades.length > 500) {
      this.closedTrades = this.closedTrades.slice(0, 500);
    }
  }

  /**
   * Calculate performance metrics from closed trades.
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const trades = this.closedTrades;
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0,
        totalPnl: 0,
        totalPnlPercent: 0,
        bestTrade: 0,
        worstTrade: 0,
        avgTradeDurationHours: 0,
        currentStreak: 0,
      };
    }

    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl <= 0);

    const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));

    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);

    // Calculate current streak
    let currentStreak = 0;
    for (const trade of trades) {
      if (currentStreak === 0) {
        currentStreak = trade.pnl > 0 ? 1 : -1;
      } else if ((currentStreak > 0 && trade.pnl > 0) || (currentStreak < 0 && trade.pnl <= 0)) {
        currentStreak += currentStreak > 0 ? 1 : -1;
      } else {
        break;
      }
    }

    return {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: (winningTrades.length / trades.length) * 100,
      avgWin: winningTrades.length > 0 ? totalWins / winningTrades.length : 0,
      avgLoss: losingTrades.length > 0 ? totalLosses / losingTrades.length : 0,
      profitFactor: totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0,
      totalPnl,
      totalPnlPercent: 0, // Requires initial equity tracking
      bestTrade: Math.max(...trades.map(t => t.pnl)),
      worstTrade: Math.min(...trades.map(t => t.pnl)),
      avgTradeDurationHours: trades.reduce((sum, t) => sum + t.durationHours, 0) / trades.length,
      currentStreak,
    };
  }

  /**
   * Get equity history for charting.
   */
  getEquityHistory(): PortfolioSnapshot[] {
    return [...this.equityHistory];
  }

  /**
   * Get closed trades (most recent first).
   */
  getClosedTrades(limit: number = 50): ClosedTrade[] {
    return this.closedTrades.slice(0, limit);
  }

  /**
   * Reset daily P&L tracking (call at start of each trading day).
   */
  resetDailyPnl(currentEquity: number): void {
    this.dailyStartEquity = currentEquity;
    this.dailyStartTimestamp = Date.now();
  }

  // ─── Private helpers ───

  private calculateRealizedPnl(): number {
    return this.closedTrades.reduce((sum, t) => sum + t.pnl, 0);
  }
}
