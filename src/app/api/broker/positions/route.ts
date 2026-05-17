import { NextRequest, NextResponse } from 'next/server';
import { getBroker } from '@/lib/broker/broker-factory';

/**
 * GET /api/broker/positions — Get positions from the broker
 * Query params: symbol (optional, for a specific position)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    const broker = getBroker();

    if (symbol) {
      const position = await broker.getPosition(symbol);
      return NextResponse.json({ position });
    }

    const positions = await broker.getPositions();
    return NextResponse.json({ positions });
  } catch (error) {
    console.error('[TradeIQ] Failed to get positions:', error);
    return NextResponse.json({
      error: 'Failed to get positions',
      detail: error instanceof Error ? error.message : 'unknown',
    }, { status: 500 });
  }
}

/**
 * DELETE /api/broker/positions?symbol=BTC&qty=0.5 — Close a position
 * Query params: symbol (required), qty (optional, for partial close)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    const qty = searchParams.get('qty');
    const broker = getBroker();

    let order;
    if (qty) {
      order = await broker.closePositionPartial(symbol, Number(qty));
    } else {
      order = await broker.closePosition(symbol);
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error('[TradeIQ] Failed to close position:', error);
    return NextResponse.json({
      error: 'Failed to close position',
      detail: error instanceof Error ? error.message : 'unknown',
    }, { status: 500 });
  }
}
