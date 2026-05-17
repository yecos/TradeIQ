import { NextRequest, NextResponse } from 'next/server';
import { getCandles } from '@/lib/market-data';
import { MockProvider } from '@/lib/data/mock-provider';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol') || 'AAPL';
  const days = parseInt(searchParams.get('days') || '180');
  const interval = searchParams.get('interval') || '1D';

  try {
    const candles = await getCandles(symbol, days, interval);
    return NextResponse.json({ symbol, candles, interval });
  } catch (error) {
    console.warn(`[TradeIQ] Failed to fetch candles for ${symbol} (${interval}), falling back to mock:`, error);

    // Fallback to mock data
    const mockProvider = new MockProvider();
    const candles = await mockProvider.getCandles(symbol, days, interval);
    return NextResponse.json({ symbol, candles, interval, fallback: true });
  }
}
