import { NextRequest, NextResponse } from 'next/server';
import { getQuote, getMultipleQuotes } from '@/lib/market-data';
import { MockProvider } from '@/lib/data/mock-provider';

// Global mock provider for instant fallback (no re-creation on every request)
const mockProvider = new MockProvider();

// Cache recent quotes to avoid redundant API calls
let cachedQuotes: { data: Quote[]; timestamp: number; symbolsKey: string } | null = null;
const CACHE_TTL = 10_000; // 10s cache — short enough for near-real-time, long enough to avoid spam

interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol');
  const symbols = searchParams.get('symbols');

  try {
    if (symbols) {
      const symbolList = symbols.split(',');

      // Check cache first
      const symbolsKey = symbolList.sort().join(',');
      if (cachedQuotes && cachedQuotes.symbolsKey === symbolsKey && Date.now() - cachedQuotes.timestamp < CACHE_TTL) {
        return NextResponse.json({ quotes: cachedQuotes.data });
      }

      // Set a hard timeout — we must respond within 9s (Vercel free tier is 10s)
      const quotes = await Promise.race([
        getMultipleQuotes(symbolList),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Quote fetch timed out')), 9000)
        ),
      ]);

      // Cache the result
      cachedQuotes = { data: quotes, timestamp: Date.now(), symbolsKey };

      return NextResponse.json({ quotes });
    }

    if (symbol) {
      const quote = await Promise.race([
        getQuote(symbol),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Quote fetch timed out')), 9000)
        ),
      ]);
      return NextResponse.json({ quote });
    }

    return NextResponse.json({ error: 'Provide symbol or symbols parameter' }, { status: 400 });
  } catch (error) {
    console.warn('[TradeIQ] Failed to fetch quotes, falling back to mock:', error instanceof Error ? error.message : error);

    // ALWAYS return data — never leave the client hanging
    try {
      if (symbols) {
        const quotes = await mockProvider.getMultipleQuotes(symbols.split(','));
        return NextResponse.json({ quotes, fallback: true });
      }
      if (symbol) {
        const quote = await mockProvider.getQuote(symbol);
        return NextResponse.json({ quote, fallback: true });
      }
    } catch (mockError) {
      // Even mock failed (shouldn't happen, but be safe)
      console.error('[TradeIQ] Even mock provider failed:', mockError);
    }

    return NextResponse.json({ error: 'Provide symbol or symbols parameter' }, { status: 400 });
  }
}
