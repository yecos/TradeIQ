import { NextRequest, NextResponse } from 'next/server';
import { analyzeNews } from '@/lib/news-analysis';

/**
 * GET /api/news?symbol=BTC
 * Returns news analysis for a symbol — useful for pre-loading or standalone queries
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
  }

  try {
    const result = await Promise.race([
      analyzeNews(symbol.toUpperCase()),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('News analysis timed out')), 10000)
      ),
    ]);

    return NextResponse.json({ symbol: symbol.toUpperCase(), ...result });
  } catch (error) {
    console.error('News API error:', error);
    return NextResponse.json({ error: 'News analysis failed' }, { status: 500 });
  }
}
