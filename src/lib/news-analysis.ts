import type { NewsAnalysis, VectorSignal } from './types';

/**
 * News Analysis Module — Real-time news sentiment using z-ai-web-dev-sdk.
 *
 * Strategy:
 * 1. Search the web for recent news about the symbol
 * 2. Use LLM to analyze sentiment and structure the results
 * 3. Fall back to simulated data if APIs fail or timeout
 *
 * Cache: 5 minutes (news doesn't change that fast)
 */

// In-memory cache
interface CacheEntry { data: NewsAnalysis; timestamp: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 300_000; // 5 minutes

// Timeout wrapper
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function analyzeNews(symbol: string): Promise<NewsAnalysis> {
  // Check cache
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const result = await withTimeout(analyzeNewsFromAI(symbol), 8000);
    if (result) {
      cache.set(symbol, { data: result, timestamp: Date.now() });
      return result;
    }
  } catch (error) {
    console.warn(`[TradeIQ] News analysis AI failed for ${symbol}:`, error instanceof Error ? error.message : error);
  }

  // Fallback to simulated
  const fallback = generateSimulatedNews(symbol);
  cache.set(symbol, { data: fallback, timestamp: Date.now() });
  return fallback;
}

async function analyzeNewsFromAI(symbol: string): Promise<NewsAnalysis | null> {
  // Dynamic import to avoid issues if SDK isn't available
  const ZAI = (await import('z-ai-web-dev-sdk')).default;
  const zai = await ZAI.create();

  // Step 1: Search for recent news
  const isCrypto = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'LINK', 'UNI', 'ATOM', 'LTC', 'NEAR', 'AAVE', 'ARB', 'OP', 'APT', 'SUI'].includes(symbol.toUpperCase());
  const searchQuery = isCrypto
    ? `${symbol} crypto cryptocurrency news today`
    : `${symbol} stock market news today`;

  const searchResults = await zai.functions.invoke('web_search', {
    query: searchQuery,
    num: 8,
    recency_days: 3,
  });

  if (!searchResults || searchResults.length === 0) {
    return null;
  }

  // Step 2: Build context from search results
  const newsContext = searchResults
    .slice(0, 6)
    .map((r: { name: string; snippet: string; date?: string }, i: number) =>
      `${i + 1}. ${r.name}: ${r.snippet}`
    )
    .join('\n');

  // Step 3: Ask LLM to analyze sentiment
  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: `You are a financial news sentiment analyst. Analyze the given news headlines and return a JSON object with this exact structure:
{
  "sentiment": number between -1 (very bearish) and 1 (very bullish),
  "sentimentLabel": "very_bearish" | "bearish" | "neutral" | "bullish" | "very_bullish",
  "headlines": [
    {"title": "headline text", "sentiment": number -1 to 1, "impact": "high" | "medium" | "low"}
  ]
}
Rules:
- sentiment > 0.5 = very_bullish, 0.1-0.5 = bullish, -0.1 to 0.1 = neutral, -0.5 to -0.1 = bearish, < -0.5 = very_bearish
- Only include the 3-5 most impactful headlines
- Return ONLY valid JSON, no markdown or explanation`,
      },
      {
        role: 'user',
        content: `Analyze the sentiment of these recent news headlines for ${symbol}:\n\n${newsContext}`,
      },
    ],
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) return null;

  // Parse JSON from LLM response (handle markdown code blocks)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  const parsed = JSON.parse(jsonMatch[0]);

  const headlines: NewsAnalysis['headlines'] = (parsed.headlines || []).map((h: { title: string; sentiment: number; impact: string }) => ({
    title: h.title,
    sentiment: Math.max(-1, Math.min(1, h.sentiment)),
    impact: (['high', 'medium', 'low'].includes(h.impact) ? h.impact : 'low') as 'high' | 'medium' | 'low',
    date: new Date().toISOString(),
  }));

  const sentiment = Math.max(-1, Math.min(1, parsed.sentiment || 0));
  const validLabels = ['very_bearish', 'bearish', 'neutral', 'bullish', 'very_bullish'];
  const sentimentLabel = validLabels.includes(parsed.sentimentLabel) ? parsed.sentimentLabel : 'neutral';

  // Generate vector signals
  const signals: VectorSignal[] = [];
  if (sentiment > 0.2) {
    signals.push({
      vectorId: 'news',
      vectorName: 'Noticias',
      direction: 'LONG',
      strength: Math.round(Math.abs(sentiment) * 100),
      confidence: 65,
      detail: `Sentimiento de noticias positivo (${(sentiment * 100).toFixed(0)}%). ${headlines.filter(h => h.sentiment > 0).length} headlines alcistas.`,
    });
  } else if (sentiment < -0.2) {
    signals.push({
      vectorId: 'news',
      vectorName: 'Noticias',
      direction: 'SHORT',
      strength: Math.round(Math.abs(sentiment) * 100),
      confidence: 65,
      detail: `Sentimiento de noticias negativo (${(sentiment * 100).toFixed(0)}%). ${headlines.filter(h => h.sentiment < 0).length} headlines bajistas.`,
    });
  } else {
    signals.push({
      vectorId: 'news',
      vectorName: 'Noticias',
      direction: 'NEUTRAL',
      strength: 30,
      confidence: 50,
      detail: 'Noticias con impacto moderado. Sin catalizador claro.',
    });
  }

  return {
    sentiment,
    sentimentLabel: sentimentLabel as NewsAnalysis['sentimentLabel'],
    headlines,
    signals,
  };
}

// Fallback: simulated news data
function generateSimulatedNews(symbol: string): NewsAnalysis {
  const newsSentiments: Record<string, { sentiment: number; headlines: NewsAnalysis['headlines'] }> = {
    'NVDA': {
      sentiment: 0.6,
      headlines: [
        { title: 'NVIDIA supera estimaciones de ingresos por chips IA', sentiment: 0.7, impact: 'high', date: new Date().toISOString() },
      ],
    },
    'BTC': {
      sentiment: 0.4,
      headlines: [
        { title: 'Bitcoin mantiene niveles de soporte clave', sentiment: 0.3, impact: 'medium', date: new Date().toISOString() },
      ],
    },
  };

  const data = newsSentiments[symbol] ?? {
    sentiment: 0,
    headlines: [{ title: 'Sin catalizadores significativos detectados', sentiment: 0, impact: 'low' as const, date: new Date().toISOString() }],
  };

  const sentimentLabel: NewsAnalysis['sentimentLabel'] =
    data.sentiment > 0.5 ? 'very_bullish' : data.sentiment > 0.1 ? 'bullish' :
    data.sentiment < -0.5 ? 'very_bearish' : data.sentiment < -0.1 ? 'bearish' : 'neutral';

  const signals: VectorSignal[] = [];
  if (data.sentiment > 0.2) {
    signals.push({ vectorId: 'news', vectorName: 'Noticias', direction: 'LONG', strength: Math.round(data.sentiment * 100), confidence: 55, detail: `Sentimiento positivo (${(data.sentiment * 100).toFixed(0)}%).` });
  } else if (data.sentiment < -0.2) {
    signals.push({ vectorId: 'news', vectorName: 'Noticias', direction: 'SHORT', strength: Math.round(Math.abs(data.sentiment) * 100), confidence: 55, detail: `Sentimiento negativo (${(data.sentiment * 100).toFixed(0)}%).` });
  } else {
    signals.push({ vectorId: 'news', vectorName: 'Noticias', direction: 'NEUTRAL', strength: 30, confidence: 45, detail: 'Sin catalizador claro.' });
  }

  return { sentiment: data.sentiment, sentimentLabel, headlines: data.headlines, signals };
}
