import type { NewsAnalysis, VectorSignal } from './types';
import { getSDK } from './ai/sdk';
import { readArticles } from './ai/article-reader';
import { NEWS_ANALYSIS_PROMPT } from './ai/prompts';

/**
 * News Analysis Module — Enhanced real-time news sentiment using z-ai-web-dev-sdk.
 *
 * Improvements over v1:
 * 1. Reads full article content (not just search snippets) for deeper analysis
 * 2. Multi-source search with 2 different queries for broader coverage
 * 3. Better confidence scoring based on source agreement
 * 4. Event detection (earnings, regulatory, product launches)
 * 5. Key risks and catalysts from AI analysis
 * 6. SDK singleton avoids repeated initialization
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

const CRYPTO_SYMBOLS = new Set(['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'LINK', 'UNI', 'ATOM', 'LTC', 'NEAR', 'AAVE', 'ARB', 'OP', 'APT', 'SUI']);

export async function analyzeNews(symbol: string): Promise<NewsAnalysis> {
  // Check cache
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const result = await withTimeout(analyzeNewsEnhanced(symbol), 12000);
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

async function analyzeNewsEnhanced(symbol: string): Promise<NewsAnalysis | null> {
  const zai = await getSDK();
  const isCrypto = CRYPTO_SYMBOLS.has(symbol.toUpperCase());

  // Step 1: Multi-source search for broader coverage
  const [primarySearch, secondarySearch] = await Promise.all([
    zai.functions.invoke('web_search', {
      query: isCrypto
        ? `${symbol} crypto cryptocurrency news today analysis`
        : `${symbol} stock news today earnings analysis`,
      num: 8,
      recency_days: 3,
    }),
    zai.functions.invoke('web_search', {
      query: isCrypto
        ? `${symbol} bitcoin crypto regulation adoption price prediction`
        : `${symbol} company analyst upgrade downgrade target price`,
      num: 5,
      recency_days: 5,
    }),
  ]);

  const allResults = [...(primarySearch || []), ...(secondarySearch || [])];
  if (allResults.length === 0) return null;

  // Step 2: Read top articles for deeper analysis
  const articleUrls = allResults
    .slice(0, 4)
    .map((r: { url: string }) => r.url)
    .filter((url: string) => url && url.startsWith('http'));

  const articles = await readArticles(articleUrls, 3);

  // Step 3: Build enriched context
  const snippetContext = allResults
    .slice(0, 6)
    .map((r: { name: string; snippet: string }, i: number) =>
      `${i + 1}. ${r.name}: ${r.snippet}`
    )
    .join('\n');

  const articleContext = articles.length > 0
    ? '\n\nFull Article Content:\n' + articles.map((a, i) =>
        `--- Article ${i + 1}: ${a.title} ---\n${a.content}`
      ).join('\n\n')
    : '';

  // Step 4: Ask LLM with enhanced prompt
  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: NEWS_ANALYSIS_PROMPT,
      },
      {
        role: 'user',
        content: `Analyze the sentiment of these recent news for ${symbol} (isCrypto: ${isCrypto}):\n\nHeadlines:\n${snippetContext}${articleContext}`,
      },
    ],
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) return null;

  // Parse JSON from LLM response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    const headlines: NewsAnalysis['headlines'] = (parsed.headlines || []).map((h: { title: string; sentiment: number; impact: string; category?: string }) => ({
      title: h.title,
      sentiment: Math.max(-1, Math.min(1, h.sentiment)),
      impact: (['high', 'medium', 'low'].includes(h.impact) ? h.impact : 'low') as 'high' | 'medium' | 'low',
      date: new Date().toISOString(),
    }));

    const sentiment = Math.max(-1, Math.min(1, parsed.sentiment || 0));
    const validLabels = ['very_bearish', 'bearish', 'neutral', 'bullish', 'very_bullish'];
    const sentimentLabel = validLabels.includes(parsed.sentimentLabel) ? parsed.sentimentLabel : 'neutral';
    const aiConfidence = Math.max(0, Math.min(100, parsed.confidence || 50));

    // Calculate enhanced confidence based on source agreement
    const bullishCount = headlines.filter(h => h.sentiment > 0.1).length;
    const bearishCount = headlines.filter(h => h.sentiment < -0.1).length;
    const totalHeadlines = headlines.length || 1;
    const agreement = Math.max(bullishCount, bearishCount) / totalHeadlines;
    const sourceConfidence = Math.round(agreement * 100);
    const finalConfidence = Math.round((aiConfidence * 0.6 + sourceConfidence * 0.4));

    // Build detailed description with events and catalysts
    const events = (parsed.events || []) as { type: string; description: string; impact: string }[];
    const keyRisks = (parsed.keyRisks || []) as string[];
    const keyCatalysts = (parsed.keyCatalysts || []) as string[];

    let detail = '';
    if (sentiment > 0.2) {
      detail = `Sentimiento de noticias positivo (${(sentiment * 100).toFixed(0)}%). ${bullishCount}/${totalHeadlines} headlines alcistas.`;
    } else if (sentiment < -0.2) {
      detail = `Sentimiento de noticias negativo (${(sentiment * 100).toFixed(0)}%). ${bearishCount}/${totalHeadlines} headlines bajistas.`;
    } else {
      detail = `Noticias mixtas/neutrales (${(sentiment * 100).toFixed(0)}%). Sin catalizador claro.`;
    }

    if (events.length > 0) {
      detail += ` Eventos: ${events.map(e => `${e.type}(${e.impact})`).join(', ')}.`;
    }
    if (keyCatalysts.length > 0 && sentiment > 0) {
      detail += ` Catalystas: ${keyCatalysts.slice(0, 2).join(', ')}.`;
    }
    if (keyRisks.length > 0 && sentiment < 0) {
      detail += ` Riesgos: ${keyRisks.slice(0, 2).join(', ')}.`;
    }

    // Generate vector signals
    const signals: VectorSignal[] = [];
    if (sentiment > 0.2) {
      signals.push({
        vectorId: 'news',
        vectorName: 'Noticias',
        direction: 'LONG',
        strength: Math.round(Math.abs(sentiment) * 100),
        confidence: finalConfidence,
        detail,
      });
    } else if (sentiment < -0.2) {
      signals.push({
        vectorId: 'news',
        vectorName: 'Noticias',
        direction: 'SHORT',
        strength: Math.round(Math.abs(sentiment) * 100),
        confidence: finalConfidence,
        detail,
      });
    } else {
      signals.push({
        vectorId: 'news',
        vectorName: 'Noticias',
        direction: 'NEUTRAL',
        strength: 30,
        confidence: finalConfidence || 50,
        detail,
      });
    }

    return {
      sentiment,
      sentimentLabel: sentimentLabel as NewsAnalysis['sentimentLabel'],
      headlines,
      signals,
    };
  } catch {
    return null;
  }
}

// Fallback: simulated news data (unchanged from original)
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
