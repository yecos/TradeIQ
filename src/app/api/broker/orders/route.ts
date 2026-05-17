import { NextRequest, NextResponse } from 'next/server';
import { getBroker } from '@/lib/broker/broker-factory';
import type { OrderRequest } from '@/lib/broker/broker-interface';

/**
 * GET /api/broker/orders — Get orders from the broker
 * Query params: status (optional, e.g. 'open', 'closed', 'all')
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;

    const broker = getBroker();
    const orders = await broker.getOrders(status);

    return NextResponse.json({ orders });
  } catch (error) {
    console.error('[TradeIQ] Failed to get orders:', error);
    return NextResponse.json({
      error: 'Failed to get orders',
      detail: error instanceof Error ? error.message : 'unknown',
    }, { status: 500 });
  }
}

/**
 * POST /api/broker/orders — Submit a new order
 * Body: OrderRequest { symbol, side, qty, type, limitPrice?, stopPrice?, timeInForce? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as OrderRequest;

    // Validate required fields
    if (!body.symbol || !body.side || !body.qty || !body.type) {
      return NextResponse.json({
        error: 'Missing required fields: symbol, side, qty, type',
      }, { status: 400 });
    }

    if (!['buy', 'sell'].includes(body.side)) {
      return NextResponse.json({ error: 'Side must be "buy" or "sell"' }, { status: 400 });
    }

    if (!['market', 'limit', 'stop', 'stop_limit', 'trailing_stop'].includes(body.type)) {
      return NextResponse.json({ error: 'Invalid order type' }, { status: 400 });
    }

    // Limit orders require limitPrice
    if (body.type === 'limit' && !body.limitPrice) {
      return NextResponse.json({ error: 'Limit orders require limitPrice' }, { status: 400 });
    }

    // Stop orders require stopPrice
    if (['stop', 'stop_limit'].includes(body.type) && !body.stopPrice) {
      return NextResponse.json({ error: 'Stop orders require stopPrice' }, { status: 400 });
    }

    // Trailing stop requires trailPrice or trailPercent
    if (body.type === 'trailing_stop' && !body.trailPrice && !body.trailPercent) {
      return NextResponse.json({ error: 'Trailing stop requires trailPrice or trailPercent' }, { status: 400 });
    }

    const broker = getBroker();
    const order = await broker.submitOrder(body);

    return NextResponse.json({ order });
  } catch (error) {
    console.error('[TradeIQ] Failed to submit order:', error);
    return NextResponse.json({
      error: 'Failed to submit order',
      detail: error instanceof Error ? error.message : 'unknown',
    }, { status: 500 });
  }
}
