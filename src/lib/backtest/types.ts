/**
 * Backtesting types — defines the data structures for the backtesting engine.
 */

/** Configuration for a backtest run */
export interface BacktestConfig {
  symbol: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  vectors: string[];  // Which analysis vectors to use
  initialCapital: number;
  positionSizePercent: number; // % of capital per trade (e.g. 10 = 10%)
  minConfluenceScore: number;  // Minimum confluence to take a trade (0-100)
  maxOpenPositions: number;
  slMultiplier: number;  // ATR multiplier for stop loss (default 1.5)
  tpMultiplier: number;  // ATR multiplier for take profit (default 3.0)
}

/** A single trade executed during backtesting */
export interface BacktestTrade {
  id: number;
  entryDate: string;
  exitDate: string | null;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number;
  takeProfit: number;
  confluenceScore: number;
  pnl: number | null;
  pnlPercent: number | null;
  result: 'win' | 'loss' | 'breakeven' | 'open';
  holdingDays: number | null;
  vectorsUsed: string[];
}

/** Equity point for the equity curve */
export interface EquityPoint {
  date: string;
  equity: number;
  drawdown: number; // Drawdown from peak (negative number)
}

/** Aggregated metrics from a completed backtest */
export interface BacktestMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;              // % of winning trades
  avgWin: number;               // Average winning trade P&L %
  avgLoss: number;              // Average losing trade P&L %
  profitFactor: number;         // Total wins / Total losses
  totalPnl: number;             // Total P&L in dollars
  totalPnlPercent: number;      // Total P&L %
  maxDrawdown: number;          // Maximum drawdown %
  maxDrawdownDuration: number;  // Days in max drawdown
  sharpeRatio: number;          // Risk-adjusted return
  avgHoldingDays: number;       // Average days per trade
  bestTrade: number;            // Best single trade P&L %
  worstTrade: number;           // Worst single trade P&L %
  avgConfluenceScore: number;   // Average confluence of taken trades
  longTrades: number;
  shortTrades: number;
  longWinRate: number;
  shortWinRate: number;
}

/** Complete backtest result */
export interface BacktestResult {
  config: BacktestConfig;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  metrics: BacktestMetrics;
  startDate: string;
  endDate: string;
  runTimestamp: number;
}

/** Default backtest configuration */
export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  symbol: 'AAPL',
  startDate: '', // Will be calculated from data
  endDate: '',
  vectors: ['technical', 'pattern', 'volume'],
  initialCapital: 10000,
  positionSizePercent: 10,
  minConfluenceScore: 40,
  maxOpenPositions: 1,
  slMultiplier: 1.5,
  tpMultiplier: 3.0,
};
