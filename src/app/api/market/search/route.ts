import { NextRequest, NextResponse } from 'next/server';
import { getMarketDataProvider } from '@/lib/data/provider-factory';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');

  if (!query || query.length < 1) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }

  try {
    const provider = getMarketDataProvider();
    const results = await provider.searchSymbols(query);
    return NextResponse.json({ results, provider: provider.name });
  } catch {
    return NextResponse.json({ error: 'Failed to search symbols' }, { status: 500 });
  }
}
