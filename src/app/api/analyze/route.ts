import { NextRequest, NextResponse } from 'next/server';
import { getCandles } from '@/lib/market-data';
import { generateConfluence } from '@/lib/confluence-engine';
import { analyzeTechnical } from '@/lib/technical-analysis';
import { detectPatterns } from '@/lib/pattern-detection';
import { analyzeVolume } from '@/lib/volume-analysis';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, vectors } = body;

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    const enabledVectors: string[] = vectors || ['technical', 'pattern', 'volume'];
    const candles = await getCandles(symbol, 180);

    if (candles.length < 30) {
      return NextResponse.json({ error: 'Insufficient data' }, { status: 400 });
    }

    // Run all analyses
    const technical = enabledVectors.includes('technical') ? analyzeTechnical(candles) : null;
    const patterns = enabledVectors.includes('pattern') ? detectPatterns(candles) : null;
    const volume = enabledVectors.includes('volume') ? analyzeVolume(candles) : null;

    // Generate confluence
    const confluence = generateConfluence(candles, symbol, enabledVectors);

    return NextResponse.json({
      symbol,
      technical,
      patterns,
      volume,
      confluence,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
