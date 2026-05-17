import { NextRequest, NextResponse } from 'next/server';
import { getBroker } from '@/lib/broker/broker-factory';
import { OrderManager } from '@/lib/broker/order-manager';
import type { ConfluenceResult } from '@/lib/types';

/**
 * POST /api/trade — Execute a trade from a confluence signal.
 *
 * Body: {
 *   confluence: ConfluenceResult,
 *   riskOverrides?: Partial<RiskConfig> (optional)
 * }
 *
 * Returns: TradeExecutionResult { executed, risk, order, error, timestamp }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { confluence, riskOverrides } = body as {
      confluence: ConfluenceResult;
      riskOverrides?: Record<string, unknown>;
    };

    // Validate confluence
    if (!confluence || !confluence.symbol || !confluence.overallDirection) {
      return NextResponse.json({
        error: 'Invalid confluence signal. Required: symbol, overallDirection',
      }, { status: 400 });
    }

    if (confluence.overallDirection === 'NEUTRAL') {
      return NextResponse.json({
        error: 'Cannot execute trade on NEUTRAL signal',
      }, { status: 400 });
    }

    // Get broker and create order manager
    const broker = getBroker();
    const orderManager = new OrderManager(broker, riskOverrides);

    // Execute the trade
    const result = await orderManager.executeTrade(confluence);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[TradeIQ] Trade execution error:', error);
    return NextResponse.json({
      error: 'Trade execution failed',
      detail: error instanceof Error ? error.message : 'unknown',
    }, { status: 500 });
  }
}
