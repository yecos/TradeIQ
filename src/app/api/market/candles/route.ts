import { NextRequest, NextResponse } from 'next/server';
import { getCandles } from '@/lib/market-data';
import { MockProvider } from '@/lib/data/mock-provider';

const mockProvider = new MockProvider();

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol') || 'AAPL';
  const days = parseInt(searchParams.get('days') || '180');
  const interval = searchParams.get('interval') || '1D';

  try {
    // Hard timeout to prevent serverless function timeout
    // FIX: Increased from 9s to 12s — SmartProvider tries multiple providers
    // (Alpaca → Finnhub → Polygon → Mock) which can take 8s+ when multiple
    // providers timeout in sequence. The old 9s timeout was too aggressive,
    // causing the server to crash before the fallback chain could complete.
    const candles = await Promise.race([
      getCandles(symbol, days, interval),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Candle fetch timed out')), 12000)
      ),
    ]);
    return NextResponse.json({ symbol, candles, interval });
  } catch (error) {
    console.warn(`[TradeIQ] Failed to fetch candles for ${symbol} (${interval}), falling back to mock:`, error instanceof Error ? error.message : error);

    // ALWAYS return data — never leave the client hanging
    try {
      const candles = await mockProvider.getCandles(symbol, days, interval);
      return NextResponse.json({ symbol, candles, interval, fallback: true });
    } catch {
      // Even mock failed (shouldn't happen)
      return NextResponse.json({ symbol, candles: [], interval, fallback: true, error: 'No data available' });
    }
  }
}
