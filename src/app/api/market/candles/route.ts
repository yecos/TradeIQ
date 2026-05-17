import { NextRequest, NextResponse } from 'next/server';
import { getCandles } from '@/lib/market-data';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol') || 'AAPL';
  const days = parseInt(searchParams.get('days') || '180');

  try {
    const candles = await getCandles(symbol, days);
    return NextResponse.json({ symbol, candles });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch candles' }, { status: 500 });
  }
}
