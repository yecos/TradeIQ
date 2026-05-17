import { NextRequest, NextResponse } from 'next/server';
import { getBroker } from '@/lib/broker/broker-factory';
import { OrderManager } from '@/lib/broker/order-manager';
import type { ConfluenceResult } from '@/lib/types';

/**
 * POST /api/trade/assess — Pre-flight risk assessment without executing.
 *
 * Returns the RiskAssessment so the UI can show what would happen.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { confluence } = body as { confluence: ConfluenceResult };

    if (!confluence || !confluence.symbol) {
      return NextResponse.json({
        error: 'Invalid confluence signal',
      }, { status: 400 });
    }

    const broker = getBroker();
    const orderManager = new OrderManager(broker);
    const assessment = await orderManager.assessTrade(confluence);

    return NextResponse.json({ assessment });
  } catch (error) {
    console.error('[TradeIQ] Trade assessment error:', error);
    return NextResponse.json({
      error: 'Trade assessment failed',
      detail: error instanceof Error ? error.message : 'unknown',
    }, { status: 500 });
  }
}
