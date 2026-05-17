import { NextRequest, NextResponse } from 'next/server';
import { getQuote, getMultipleQuotes } from '@/lib/market-data';

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
    return NextResponse.json({ error: 'Failed to fetch quote' }, { status: 500 });
  }
}
