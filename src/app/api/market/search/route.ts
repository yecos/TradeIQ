import { NextRequest, NextResponse } from 'next/server';
import { getMarketDataProvider } from '@/lib/data/provider-factory';
import { MockProvider } from '@/lib/data/mock-provider';

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
  } catch (error) {
    console.warn('[TradeIQ] Search failed, falling back to mock:', error);

    const mockProvider = new MockProvider();
    const results = await mockProvider.searchSymbols(query);
    return NextResponse.json({ results, provider: 'mock', fallback: true });
  }
}
