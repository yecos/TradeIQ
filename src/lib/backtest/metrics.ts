import type { BacktestTrade, BacktestMetrics, EquityPoint } from './types';

/**
 * Calculate aggregated metrics from a list of completed backtest trades
 * and the equity curve.
 */
export function calculateMetrics(
  trades: BacktestTrade[],
  equityCurve: EquityPoint[],
  initialCapital: number
): BacktestMetrics {
  const closedTrades = trades.filter(t => t.result !== 'open');
  const wins = closedTrades.filter(t => t.result === 'win');
  const losses = closedTrades.filter(t => t.result === 'loss');
  const breakevens = closedTrades.filter(t => t.result === 'breakeven');

  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const totalPnlPercent = (totalPnl / initialCapital) * 100;

  // Win/Loss averages
  const avgWin = wins.length > 0
    ? wins.reduce((sum, t) => sum + (t.pnlPercent || 0), 0) / wins.length
    : 0;

  const avgLoss = losses.length > 0
    ? losses.reduce((sum, t) => sum + Math.abs(t.pnlPercent || 0), 0) / losses.length
    : 0;

  // Profit Factor
  const totalWins = wins.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const totalLosses = Math.abs(losses.reduce((sum, t) => sum + (t.pnl || 0), 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

  // Max Drawdown
  const { maxDrawdown, maxDrawdownDuration } = calculateDrawdown(equityCurve);

  // Sharpe Ratio (simplified — annualized)
  const dailyReturns = calculateDailyReturns(equityCurve);
  const sharpeRatio = calculateSharpeRatio(dailyReturns);

  // Holding days
  const holdingDays = closedTrades
    .filter(t => t.holdingDays !== null)
    .map(t => t.holdingDays as number);
  const avgHoldingDays = holdingDays.length > 0
    ? holdingDays.reduce((a, b) => a + b, 0) / holdingDays.length
    : 0;

  // Best / Worst trade
  const pnlPercents = closedTrades.map(t => t.pnlPercent || 0);
  const bestTrade = pnlPercents.length > 0 ? Math.max(...pnlPercents) : 0;
  const worstTrade = pnlPercents.length > 0 ? Math.min(...pnlPercents) : 0;

  // Average confluence
  const avgConfluence = closedTrades.length > 0
    ? closedTrades.reduce((sum, t) => sum + t.confluenceScore, 0) / closedTrades.length
    : 0;

  // Direction breakdown
  const longTrades = closedTrades.filter(t => t.direction === 'LONG');
  const shortTrades = closedTrades.filter(t => t.direction === 'SHORT');
  const longWins = longTrades.filter(t => t.result === 'win');
  const shortWins = shortTrades.filter(t => t.result === 'win');

  return {
    totalTrades: closedTrades.length,
    wins: wins.length,
    losses: losses.length,
    breakevens: breakevens.length,
    winRate: closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    totalPnl: Math.round(totalPnl * 100) / 100,
    totalPnlPercent: Math.round(totalPnlPercent * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    maxDrawdownDuration,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    avgHoldingDays: Math.round(avgHoldingDays * 10) / 10,
    bestTrade: Math.round(bestTrade * 100) / 100,
    worstTrade: Math.round(worstTrade * 100) / 100,
    avgConfluenceScore: Math.round(avgConfluence * 100) / 100,
    longTrades: longTrades.length,
    shortTrades: shortTrades.length,
    longWinRate: longTrades.length > 0 ? (longWins.length / longTrades.length) * 100 : 0,
    shortWinRate: shortTrades.length > 0 ? (shortWins.length / shortTrades.length) * 100 : 0,
  };
}

function calculateDrawdown(equityCurve: EquityPoint[]): { maxDrawdown: number; maxDrawdownDuration: number } {
  if (equityCurve.length === 0) return { maxDrawdown: 0, maxDrawdownDuration: 0 };

  let peak = equityCurve[0].equity;
  let maxDrawdown = 0;
  let maxDrawdownDuration = 0;
  let drawdownStart = 0;

  for (let i = 0; i < equityCurve.length; i++) {
    if (equityCurve[i].equity > peak) {
      peak = equityCurve[i].equity;
      drawdownStart = i;
    }

    const drawdown = ((peak - equityCurve[i].equity) / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownDuration = i - drawdownStart;
    }
  }

  return { maxDrawdown, maxDrawdownDuration };
}

function calculateDailyReturns(equityCurve: EquityPoint[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prevEquity = equityCurve[i - 1].equity;
    if (prevEquity > 0) {
      returns.push((equityCurve[i].equity - prevEquity) / prevEquity);
    }
  }
  return returns;
}

function calculateSharpeRatio(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;

  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (dailyReturns.length - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  // Annualized Sharpe (252 trading days, risk-free rate ≈ 0 for simplicity)
  return (mean / stdDev) * Math.sqrt(252);
}
