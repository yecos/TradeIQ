import { NextRequest, NextResponse } from 'next/server';
import { getCandles } from '@/lib/market-data';
import { runBacktest } from '@/lib/backtest/engine';
import type { BacktestConfig } from '@/lib/backtest/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, vectors, minConfluenceScore, initialCapital, positionSizePercent, slMultiplier, tpMultiplier } = body;

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    // Get historical candles (max 2 years for backtesting)
    const candles = await getCandles(symbol, 365);

    if (candles.length < 60) {
      return NextResponse.json({ error: 'Insufficient historical data for backtesting' }, { status: 400 });
    }

    const config: Partial<BacktestConfig> = {
      symbol,
      vectors: vectors || ['technical', 'pattern', 'volume'],
      minConfluenceScore: minConfluenceScore || 40,
      initialCapital: initialCapital || 10000,
      positionSizePercent: positionSizePercent || 10,
      slMultiplier: slMultiplier || 1.5,
      tpMultiplier: tpMultiplier || 3.0,
    };

    const result = await runBacktest(candles, config);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Backtest error:', error);
    return NextResponse.json({ error: 'Backtest failed' }, { status: 500 });
  }
}
