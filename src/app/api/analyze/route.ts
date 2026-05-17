import { NextRequest, NextResponse } from 'next/server';
import { getCandles } from '@/lib/market-data';
import { generateConfluence } from '@/lib/confluence-engine';
import { analyzeTechnical } from '@/lib/technical-analysis';
import { detectPatterns } from '@/lib/pattern-detection';
import { analyzeVolume } from '@/lib/volume-analysis';
import { analyzeNews } from '@/lib/news-analysis';
import { analyzeSentiment } from '@/lib/sentiment-analysis';
import { analyzeMacro } from '@/lib/macro-analysis';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, vectors } = body;

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    const enabledVectors: string[] = vectors || ['technical', 'pattern', 'volume'];

    // Hard timeout to prevent serverless function timeout
    const result = await Promise.race([
      runAnalysis(symbol, enabledVectors),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Analysis timed out')), 15000)
      ),
    ]);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}

async function runAnalysis(symbol: string, enabledVectors: string[]) {
  const candles = await getCandles(symbol, 180);

  if (candles.length < 30) {
    return { error: 'Insufficient data' };
  }

  // Run ALL analyses in PARALLEL — sync ones complete instantly,
  // async ones (news/sentiment/macro) run concurrently with 8s timeouts
  const [technical, patterns, volume, news, sentiment, macro] = await Promise.all([
    enabledVectors.includes('technical')
      ? Promise.resolve(analyzeTechnical(candles))
      : Promise.resolve(null),
    enabledVectors.includes('pattern')
      ? Promise.resolve(detectPatterns(candles))
      : Promise.resolve(null),
    enabledVectors.includes('volume')
      ? Promise.resolve(analyzeVolume(candles))
      : Promise.resolve(null),
    enabledVectors.includes('news')
      ? analyzeNews(symbol)
      : Promise.resolve(null),
    enabledVectors.includes('sentiment')
      ? analyzeSentiment(symbol)
      : Promise.resolve(null),
    enabledVectors.includes('macro')
      ? analyzeMacro(symbol)
      : Promise.resolve(null),
  ]);

  // Generate confluence — pass precomputed results (no double computation)
  const confluence = generateConfluence(candles, symbol, enabledVectors, {
    technical,
    patterns,
    volume,
    news,
    sentiment,
    macro,
  });

  return {
    symbol,
    technical,
    patterns,
    volume,
    news,
    sentiment,
    macro,
    confluence,
    timestamp: Date.now(),
  };
}
