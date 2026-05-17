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

    // Run analyses — only for enabled vectors (avoid wasted computation)
    const technical = enabledVectors.includes('technical') ? analyzeTechnical(candles) : null;
    const patterns = enabledVectors.includes('pattern') ? detectPatterns(candles) : null;
    const volume = enabledVectors.includes('volume') ? analyzeVolume(candles) : null;

    // Generate confluence — PASS precomputed results to avoid double computation
    // News/sentiment/macro are computed inside generateConfluence (simulated)
    const confluence = generateConfluence(candles, symbol, enabledVectors, {
      technical,
      patterns,
      volume,
    });

    // Extract news/sentiment/macro from confluence's internal computation
    // We need to compute them separately for the API response
    const news = enabledVectors.includes('news')
      ? extractNewsFromConfluence(confluence, symbol)
      : null;
    const sentiment = enabledVectors.includes('sentiment')
      ? extractSentimentFromConfluence(confluence, symbol)
      : null;
    const macro = enabledVectors.includes('macro')
      ? extractMacroFromConfluence(confluence)
      : null;

    return NextResponse.json({
      symbol,
      technical,
      patterns,
      volume,
      news,
      sentiment,
      macro,
      confluence,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}

/**
 * Extract NewsAnalysis from confluence signals.
 * Since generateConfluence computes news internally, we reconstruct the structured data
 * from the vector signals it produced.
 */
function extractNewsFromConfluence(confluence: { vectorSignals: { vectorId: string; vectorName: string; direction: string; strength: number; confidence: number; detail: string }[] }, symbol: string) {
  const newsSignal = confluence.vectorSignals.find(s => s.vectorId === 'news');
  if (!newsSignal) return null;

  return {
    sentiment: newsSignal.direction === 'LONG' ? newsSignal.strength / 100 :
                newsSignal.direction === 'SHORT' ? -(newsSignal.strength / 100) : 0,
    sentimentLabel: newsSignal.direction === 'LONG' ? (newsSignal.strength > 60 ? 'very_bullish' : 'bullish') :
                    newsSignal.direction === 'SHORT' ? (newsSignal.strength > 60 ? 'very_bearish' : 'bearish') : 'neutral' as const,
    headlines: [
      {
        title: newsSignal.detail,
        sentiment: newsSignal.direction === 'LONG' ? 0.5 : newsSignal.direction === 'SHORT' ? -0.5 : 0,
        impact: 'medium' as const,
        date: new Date().toISOString(),
      },
    ],
    signals: [newsSignal],
  };
}

function extractSentimentFromConfluence(confluence: { vectorSignals: { vectorId: string; vectorName: string; direction: string; strength: number; confidence: number; detail: string }[] }, _symbol: string) {
  const sentSignal = confluence.vectorSignals.find(s => s.vectorId === 'sentiment');
  if (!sentSignal) return null;

  const socialSent = sentSignal.direction === 'LONG' ? sentSignal.strength / 100 :
                     sentSignal.direction === 'SHORT' ? -(sentSignal.strength / 100) : 0;
  const fearGreed = Math.round(50 + socialSent * 30);

  return {
    fearGreedIndex: fearGreed,
    socialSentiment: socialSent,
    putCallRatio: socialSent > 0 ? 0.8 : socialSent < 0 ? 1.2 : 1.0,
    signals: [sentSignal],
  };
}

function extractMacroFromConfluence(confluence: { vectorSignals: { vectorId: string; vectorName: string; direction: string; strength: number; confidence: number; detail: string }[] }) {
  const macroSignal = confluence.vectorSignals.find(s => s.vectorId === 'macro');
  if (!macroSignal) return null;

  return {
    fedRateTrend: 'neutral' as const,
    economicEvents: [
      {
        event: 'Fed Interest Rate Decision',
        impact: 'high' as const,
        date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        forecast: '5.25-5.50%',
        previous: '5.25-5.50%',
      },
      {
        event: 'CPI Data Release',
        impact: 'high' as const,
        date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
        forecast: '+0.3%',
        previous: '+0.4%',
      },
    ],
    signals: [macroSignal],
  };
}
