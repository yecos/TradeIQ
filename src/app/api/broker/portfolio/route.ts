import { NextResponse } from 'next/server';
import { getBroker } from '@/lib/broker/broker-factory';
import { PositionTracker } from '@/lib/broker/position-tracker';

/**
 * GET /api/broker/portfolio — Get portfolio snapshot + performance metrics
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

    return NextResponse.json({
      snapshot,
      positions,
      metrics,
    });
  } catch (error) {
    console.error('[TradeIQ] Failed to get portfolio:', error);
    return NextResponse.json({
      error: 'Failed to get portfolio',
      detail: error instanceof Error ? error.message : 'unknown',
    }, { status: 500 });
  }
}
