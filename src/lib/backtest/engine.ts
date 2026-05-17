import type { Candle, ConfluenceResult } from '../types';
import type { BacktestConfig, BacktestTrade, BacktestResult, EquityPoint } from './types';
import { DEFAULT_BACKTEST_CONFIG } from './types';
import { generateConfluence } from '../confluence-engine';
import { calculateMetrics } from './metrics';

/**
 * Backtesting Engine — simulates trading with the confluence engine
 * over historical data to evaluate strategy performance.
 *
 * How it works:
 * 1. Takes a slice of candles (e.g., first 50) to warm up indicators
 * 2. Steps forward one candle at a time
 * 3. At each step, runs generateConfluence() with the available data
 * 4. If confluence score >= threshold and no open position, enters a trade
 * 5. For each open trade, checks if SL or TP was hit by the current candle
 * 6. Records all trades and builds an equity curve
 * 7. Calculates performance metrics at the end
 */
export async function runBacktest(
  candles: Candle[],
  config: Partial<BacktestConfig> = {}
): Promise<BacktestResult> {
  const fullConfig: BacktestConfig = { ...DEFAULT_BACKTEST_CONFIG, ...config };

  const warmupPeriod = 50; // Need 50 candles minimum for indicators
  if (candles.length < warmupPeriod + 10) {
    return createEmptyResult(fullConfig, candles);
  }

  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let capital = fullConfig.initialCapital;
  let peakEquity = capital;
  let openTrade: BacktestTrade | null = null;
  let tradeId = 0;

  // Walk forward through candles
  for (let i = warmupPeriod; i < candles.length; i++) {
    const currentCandle = candles[i];
    const historicalCandles = candles.slice(0, i + 1); // All data up to current
    const currentDate = new Date(currentCandle.time * 1000).toISOString().split('T')[0];

    // Check if open trade was hit (SL or TP)
    if (openTrade) {
      const tradeResult = checkTradeExit(openTrade, currentCandle, currentDate);
      if (tradeResult) {
        openTrade = tradeResult;
        trades.push(openTrade);

        // Update capital
        capital += openTrade.pnl || 0;
        if (capital < 0) capital = 0;

        openTrade = null;
      }
    }

    // If no open position, check for new entry
    if (!openTrade && i < candles.length - 1) {
      const confluence = await generateConfluence(
        historicalCandles,
        fullConfig.symbol,
        fullConfig.vectors
      );

      if (confluence.overallDirection !== 'NEUTRAL' &&
          confluence.confluenceScore >= fullConfig.minConfluenceScore) {
        openTrade = createTrade(
          ++tradeId,
          confluence,
          currentDate,
          currentCandle.close,
          capital,
          fullConfig
        );
      }
    }

    // Record equity point
    const currentEquity = capital + calculateOpenTradeValue(openTrade, currentCandle);
    if (currentEquity > peakEquity) peakEquity = currentEquity;
    const drawdown = ((peakEquity - currentEquity) / peakEquity) * 100;

    equityCurve.push({
      date: currentDate,
      equity: Math.round(currentEquity * 100) / 100,
      drawdown: -Math.round(drawdown * 100) / 100,
    });
  }

  // Close any remaining open trade at the last price
  if (openTrade) {
    const lastCandle = candles[candles.length - 1];
    const lastDate = new Date(lastCandle.time * 1000).toISOString().split('T')[0];
    openTrade.exitDate = lastDate;
    openTrade.exitPrice = lastCandle.close;
    openTrade.result = 'breakeven';
    openTrade.pnl = 0;
    openTrade.pnlPercent = 0;
    openTrade.holdingDays = calculateHoldingDays(openTrade.entryDate, lastDate);

    // Calculate actual P&L
    const pnlResult = calculatePnL(openTrade);
    openTrade.pnl = pnlResult.pnl;
    openTrade.pnlPercent = pnlResult.pnlPercent;
    openTrade.result = pnlResult.result;

    capital += openTrade.pnl || 0;
    trades.push(openTrade);
  }

  // Calculate metrics
  const metrics = calculateMetrics(trades, equityCurve, fullConfig.initialCapital);

  const firstDate = new Date(candles[warmupPeriod].time * 1000).toISOString().split('T')[0];
  const lastDate = new Date(candles[candles.length - 1].time * 1000).toISOString().split('T')[0];

  return {
    config: fullConfig,
    trades,
    equityCurve,
    metrics,
    startDate: firstDate,
    endDate: lastDate,
    runTimestamp: Date.now(),
  };
}

// --- Helper functions ---

function createTrade(
  id: number,
  confluence: ConfluenceResult,
  date: string,
  price: number,
  capital: number,
  config: BacktestConfig
): BacktestTrade {
  // Calculate position size
  const positionSize = capital * (config.positionSizePercent / 100);
  const _shares = Math.floor(positionSize / price);

  // Override SL/TP with config multipliers if needed
  // (Confluence engine already calculates them, we use those)

  return {
    id,
    entryDate: date,
    exitDate: null,
    direction: confluence.overallDirection as 'LONG' | 'SHORT',
    entryPrice: price,
    exitPrice: null,
    stopLoss: confluence.stopLoss,
    takeProfit: confluence.takeProfit,
    confluenceScore: confluence.confluenceScore,
    pnl: null,
    pnlPercent: null,
    result: 'open',
    holdingDays: null,
    vectorsUsed: confluence.vectorSignals.map(s => s.vectorName),
  };
}

function checkTradeExit(
  trade: BacktestTrade,
  candle: Candle,
  currentDate: string
): BacktestTrade | null {
  if (trade.direction === 'LONG') {
    // Check if stop loss was hit (price went below SL)
    if (candle.low <= trade.stopLoss) {
      const exitedTrade = { ...trade };
      exitedTrade.exitDate = currentDate;
      exitedTrade.exitPrice = trade.stopLoss;
      const pnlResult = calculatePnL(exitedTrade);
      exitedTrade.pnl = pnlResult.pnl;
      exitedTrade.pnlPercent = pnlResult.pnlPercent;
      exitedTrade.result = pnlResult.result;
      exitedTrade.holdingDays = calculateHoldingDays(exitedTrade.entryDate, currentDate);
      return exitedTrade;
    }
    // Check if take profit was hit (price went above TP)
    if (candle.high >= trade.takeProfit) {
      const exitedTrade = { ...trade };
      exitedTrade.exitDate = currentDate;
      exitedTrade.exitPrice = trade.takeProfit;
      const pnlResult = calculatePnL(exitedTrade);
      exitedTrade.pnl = pnlResult.pnl;
      exitedTrade.pnlPercent = pnlResult.pnlPercent;
      exitedTrade.result = pnlResult.result;
      exitedTrade.holdingDays = calculateHoldingDays(exitedTrade.entryDate, currentDate);
      return exitedTrade;
    }
  } else if (trade.direction === 'SHORT') {
    // Check if stop loss was hit (price went above SL for short)
    if (candle.high >= trade.stopLoss) {
      const exitedTrade = { ...trade };
      exitedTrade.exitDate = currentDate;
      exitedTrade.exitPrice = trade.stopLoss;
      const pnlResult = calculatePnL(exitedTrade);
      exitedTrade.pnl = pnlResult.pnl;
      exitedTrade.pnlPercent = pnlResult.pnlPercent;
      exitedTrade.result = pnlResult.result;
      exitedTrade.holdingDays = calculateHoldingDays(exitedTrade.entryDate, currentDate);
      return exitedTrade;
    }
    // Check if take profit was hit (price went below TP for short)
    if (candle.low <= trade.takeProfit) {
      const exitedTrade = { ...trade };
      exitedTrade.exitDate = currentDate;
      exitedTrade.exitPrice = trade.takeProfit;
      const pnlResult = calculatePnL(exitedTrade);
      exitedTrade.pnl = pnlResult.pnl;
      exitedTrade.pnlPercent = pnlResult.pnlPercent;
      exitedTrade.result = pnlResult.result;
      exitedTrade.holdingDays = calculateHoldingDays(exitedTrade.entryDate, currentDate);
      return exitedTrade;
    }
  }

  return null; // Trade still open
}

function calculatePnL(trade: BacktestTrade): { pnl: number; pnlPercent: number; result: 'win' | 'loss' | 'breakeven' } {
  if (trade.exitPrice === null || trade.entryPrice === 0) {
    return { pnl: 0, pnlPercent: 0, result: 'breakeven' };
  }

  let pnlPercent: number;
  if (trade.direction === 'LONG') {
    pnlPercent = ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
  } else {
    pnlPercent = ((trade.entryPrice - trade.exitPrice) / trade.entryPrice) * 100;
  }

  // Breakeven threshold: within 0.1%
  const result: 'win' | 'loss' | 'breakeven' =
    Math.abs(pnlPercent) < 0.1 ? 'breakeven' :
    pnlPercent > 0 ? 'win' : 'loss';

  return {
    pnl: Math.round(pnlPercent * 100) / 100, // Simplified: P&L as % of entry
    pnlPercent: Math.round(pnlPercent * 100) / 100,
    result,
  };
}

function calculateHoldingDays(entryDate: string, exitDate: string): number {
  const entry = new Date(entryDate);
  const exit = new Date(exitDate);
  return Math.round((exit.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24));
}

function calculateOpenTradeValue(trade: BacktestTrade | null, currentCandle: Candle): number {
  if (!trade || trade.entryPrice === 0) return 0;

  const unrealizedPnlPercent = trade.direction === 'LONG'
    ? ((currentCandle.close - trade.entryPrice) / trade.entryPrice) * 100
    : ((trade.entryPrice - currentCandle.close) / trade.entryPrice) * 100;

  // Approximate unrealized value based on % and typical position size
  return unrealizedPnlPercent; // Simplified for equity curve
}

function createEmptyResult(config: BacktestConfig, candles: Candle[]): BacktestResult {
  const firstDate = candles.length > 0
    ? new Date(candles[0].time * 1000).toISOString().split('T')[0]
    : '';
  const lastDate = candles.length > 0
    ? new Date(candles[candles.length - 1].time * 1000).toISOString().split('T')[0]
    : '';

  return {
    config,
    trades: [],
    equityCurve: [],
    metrics: {
      totalTrades: 0, wins: 0, losses: 0, breakevens: 0,
      winRate: 0, avgWin: 0, avgLoss: 0, profitFactor: 0,
      totalPnl: 0, totalPnlPercent: 0,
      maxDrawdown: 0, maxDrawdownDuration: 0,
      sharpeRatio: 0, avgHoldingDays: 0,
      bestTrade: 0, worstTrade: 0, avgConfluenceScore: 0,
      longTrades: 0, shortTrades: 0,
      longWinRate: 0, shortWinRate: 0,
    },
    startDate: firstDate,
    endDate: lastDate,
    runTimestamp: Date.now(),
  };
}
