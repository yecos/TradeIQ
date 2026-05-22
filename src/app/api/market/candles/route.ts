import { NextRequest, NextResponse } from 'next/server';
import { getCandles } from '@/lib/market-data';
import { MockProvider } from '@/lib/data/mock-provider';
import { isCryptoSymbol } from '@/lib/data/binance-provider';

const mockProvider = new MockProvider();

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol') || 'AAPL';
  const days = parseInt(searchParams.get('days') || '180');
  const interval = searchParams.get('interval') || '1D';

  try {
    // Hard timeout to prevent serverless function timeout.
    // SmartProvider now uses Binance-first for crypto (fast, ~1-2s).
    // For stocks, tries Alpaca → Finnhub → TwelveData → Polygon → Mock.
    const candles = await Promise.race([
      getCandles(symbol, days, interval),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Candle fetch timed out')), 15000)
      ),
    ]);

    // Detect if the data might be mock (last candle very different from current time)
    const isMock = candles.length > 0 && candles[0].time < 1000000000; // Mock would never produce such old timestamps
    return NextResponse.json({
      symbol,
      candles,
      interval,
      isCrypto: isCryptoSymbol(symbol),
      ...(isMock && { fallback: true, warning: 'Data may be simulated' }),
    });
  } catch (error) {
    console.warn(`[TradeIQ] Failed to fetch candles for ${symbol} (${interval}), falling back to mock:`, error instanceof Error ? error.message : error);

    // ALWAYS return data — never leave the client hanging
    // Mark as fallback so the client knows these are simulated candles
    try {
      const candles = await mockProvider.getCandles(symbol, days, interval);
      return NextResponse.json({
        symbol,
        candles,
        interval,
        fallback: true,
        isCrypto: isCryptoSymbol(symbol),
        warning: 'Using simulated data — real API unavailable',
      });
    } catch {
      // Even mock failed (shouldn't happen)
      return NextResponse.json({
        symbol,
        candles: [],
        interval,
        fallback: true,
        isCrypto: isCryptoSymbol(symbol),
        error: 'No data available',
      });
    }
  }
}
