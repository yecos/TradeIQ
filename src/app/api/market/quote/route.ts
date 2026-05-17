import { NextRequest, NextResponse } from 'next/server';
import { getQuote, getMultipleQuotes } from '@/lib/market-data';
import { enableFallback } from '@/lib/data/provider-factory';
import { MockProvider } from '@/lib/data/mock-provider';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol');
  const symbols = searchParams.get('symbols');

  try {
    if (symbols) {
      const quotes = await getMultipleQuotes(symbols.split(','));
      return NextResponse.json({ quotes });
    }
    if (symbol) {
      const quote = await getQuote(symbol);
      return NextResponse.json({ quote });
    }
    return NextResponse.json({ error: 'Provide symbol or symbols parameter' }, { status: 400 });
  } catch (error) {
    console.warn('[TradeIQ] Failed to fetch quotes, falling back to mock:', error);
    enableFallback();

    // Fallback to mock data
    const mockProvider = new MockProvider();
    if (symbols) {
      const quotes = await mockProvider.getMultipleQuotes(symbols.split(','));
      return NextResponse.json({ quotes, fallback: true });
    }
    if (symbol) {
      const quote = await mockProvider.getQuote(symbol);
      return NextResponse.json({ quote, fallback: true });
    }
    return NextResponse.json({ error: 'Provide symbol or symbols parameter' }, { status: 400 });
  }
}
