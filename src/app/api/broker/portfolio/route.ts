import { NextResponse } from 'next/server';
import { getBroker } from '@/lib/broker/broker-factory';
import { PositionTracker } from '@/lib/broker/position-tracker';

/**
 * GET /api/broker/portfolio — Get portfolio snapshot + performance metrics + equity history
 *
 * Returns:
 * - snapshot: current equity, P&L, position count
 * - positions: open positions with unrealized P&L
 * - metrics: performance statistics (win rate, profit factor, etc.)
 * - equityHistory: recent equity curve points (for sparkline/chart)
 */
export async function GET() {
  try {
    const broker = getBroker();
    const tracker = new PositionTracker(broker);

    const [snapshot, positions] = await Promise.all([
      tracker.getPortfolioSnapshot(),
      tracker.getOpenPositions(),
    ]);
    const metrics = tracker.getPerformanceMetrics();
    const equityHistory = tracker.getEquityHistory();

    return NextResponse.json({
      snapshot,
      positions,
      metrics,
      equityHistory,
    });
  } catch (error) {
    console.error('[TradeIQ] Failed to get portfolio:', error);
    return NextResponse.json({
      error: 'Failed to get portfolio',
      detail: error instanceof Error ? error.message : 'unknown',
    }, { status: 500 });
  }
}
