import { NextRequest, NextResponse } from 'next/server';
import { analyzeOrderFlow } from '@/lib/analysis/order-flow';

/**
 * GET /api/orderflow?symbol=BTC&price=65000
 * Returns order flow analysis: order book, trade flow, absorption, signals
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const priceStr = searchParams.get('price');
  const price = priceStr ? parseFloat(priceStr) : undefined;

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
  }

  try {
    const result = await Promise.race([
      analyzeOrderFlow(symbol.toUpperCase(), price),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Order flow analysis timed out')), 8000)
      ),
    ]);

    return NextResponse.json({ symbol: symbol.toUpperCase(), ...result });
  } catch (error) {
    console.error('Order flow API error:', error);
    return NextResponse.json({ error: 'Order flow analysis failed' }, { status: 500 });
  }
}
