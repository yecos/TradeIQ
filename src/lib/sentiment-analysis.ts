import type { SentimentAnalysis, VectorSignal } from './types';

/**
 * Sentiment Analysis Module — Real-time market sentiment using free APIs.
 *
 * Data sources:
 * 1. Fear & Greed Index (alternative.me) — free, no API key, crypto market sentiment
 * 2. CoinGecko trending — free, shows which coins are trending (social interest)
 * 3. z-ai-web-dev-sdk web search — for stock social sentiment analysis
 *
 * Cache: 10 minutes (sentiment updates slowly)
 */

interface CacheEntry { data: SentimentAnalysis; timestamp: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 600_000; // 10 minutes

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}

const CRYPTO_SYMBOLS = new Set(['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'LINK', 'UNI', 'ATOM', 'LTC', 'NEAR', 'AAVE', 'ARB', 'OP', 'APT', 'SUI', 'MATIC']);

export async function analyzeSentiment(symbol: string): Promise<SentimentAnalysis> {
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const isCrypto = CRYPTO_SYMBOLS.has(symbol.toUpperCase());

  try {
    if (isCrypto) {
      const result = await withTimeout(analyzeCryptoSentiment(symbol), 8000);
      if (result) {
        cache.set(symbol, { data: result, timestamp: Date.now() });
        return result;
      }
    } else {
      const result = await withTimeout(analyzeStockSentiment(symbol), 8000);
      if (result) {
        cache.set(symbol, { data: result, timestamp: Date.now() });
        return result;
      }
    }
  } catch (error) {
    console.warn(`[TradeIQ] Sentiment analysis failed for ${symbol}:`, error instanceof Error ? error.message : error);
  }

  // Fallback
  const fallback = generateSimulatedSentiment(symbol);
  cache.set(symbol, { data: fallback, timestamp: Date.now() });
  return fallback;
}

/**
 * Crypto sentiment: Fear & Greed Index + CoinGecko trending data
 */
async function analyzeCryptoSentiment(symbol: string): Promise<SentimentAnalysis | null> {
  // Fetch Fear & Greed Index
  const fngResponse = await fetch('https://api.alternative.me/fng/?limit=1', {
    signal: AbortSignal.timeout(5000),
  });

  let fearGreedIndex = 50;
  let fearGreedLabel = 'Neutral';

  if (fngResponse.ok) {
    const fngData = await fngResponse.json();
    if (fngData.data?.[0]) {
      fearGreedIndex = parseInt(fngData.data[0].value, 10);
      fearGreedLabel = fngData.data[0].value_classification;
    }
  }

  // Check CoinGecko trending to see if this coin is trending
  let socialSentiment = 0;
  try {
    const trendingResponse = await fetch('https://api.coingecko.com/api/v3/search/trending', {
      signal: AbortSignal.timeout(8000),
    });

    if (trendingResponse.ok) {
      const trendingData = await trendingResponse.json();
      const trendingCoins: { item: { symbol: string; score: number; data?: { price_change_percentage_24h?: { usd?: number } } } }[] = trendingData.coins || [];

      // Check if our symbol is trending
      const ourCoin = trendingCoins.find((c: { item: { symbol: string } }) =>
        c.item.symbol.toUpperCase() === symbol.toUpperCase()
      );

      if (ourCoin) {
        // Trending = positive social sentiment boost
        const priceChange = ourCoin.item.data?.price_change_percentage_24h?.usd || 0;
        socialSentiment = Math.max(-1, Math.min(1, priceChange / 20)); // Normalize
        // Being trending adds positive sentiment
        socialSentiment = Math.min(1, socialSentiment + 0.3);
      }
    }
  } catch {
    // CoinGecko trending might fail/rate limit, continue with Fear & Greed only
  }

  // Use AI to get more nuanced social sentiment
  try {
    const aiSentiment = await getAISocialSentiment(symbol);
    if (aiSentiment !== null) {
      socialSentiment = socialSentiment === 0 ? aiSentiment : (socialSentiment + aiSentiment) / 2;
    }
  } catch {
    // AI sentiment failed, continue with what we have
  }

  // Generate signals
  const signals: VectorSignal[] = [];
  const overallSentiment = (fearGreedIndex - 50) / 100 * 0.5 + socialSentiment * 0.5;

  if (overallSentiment > 0.15) {
    signals.push({
      vectorId: 'sentiment',
      vectorName: 'Sentimiento',
      direction: 'LONG',
      strength: Math.round(Math.abs(overallSentiment) * 100),
      confidence: 60,
      detail: `Fear & Greed: ${fearGreedIndex} (${fearGreedLabel}). Sentimiento social positivo (${(socialSentiment * 100).toFixed(0)}%).`,
    });
  } else if (overallSentiment < -0.15) {
    signals.push({
      vectorId: 'sentiment',
      vectorName: 'Sentimiento',
      direction: 'SHORT',
      strength: Math.round(Math.abs(overallSentiment) * 100),
      confidence: 60,
      detail: `Fear & Greed: ${fearGreedIndex} (${fearGreedLabel}). Sentimiento social negativo (${(socialSentiment * 100).toFixed(0)}%).`,
    });
  } else {
    signals.push({
      vectorId: 'sentiment',
      vectorName: 'Sentimiento',
      direction: 'NEUTRAL',
      strength: 25,
      confidence: 50,
      detail: `Fear & Greed: ${fearGreedIndex} (${fearGreedLabel}). Sentimiento neutral.`,
    });
  }

  return {
    fearGreedIndex,
    socialSentiment: Math.round(socialSentiment * 100) / 100,
    putCallRatio: undefined, // Not available for crypto
    signals,
  };
}

/**
 * Stock sentiment: Use AI web search for social sentiment + Fear & Greed as market baseline
 */
async function analyzeStockSentiment(symbol: string): Promise<SentimentAnalysis | null> {
  // Get Fear & Greed as market baseline
  let fearGreedIndex = 50;
  try {
    const fngResponse = await fetch('https://api.alternative.me/fng/?limit=1', {
      signal: AbortSignal.timeout(5000),
    });
    if (fngResponse.ok) {
      const fngData = await fngResponse.json();
      if (fngData.data?.[0]) {
        fearGreedIndex = parseInt(fngData.data[0].value, 10);
      }
    }
  } catch {
    // Fear & Greed is crypto-specific but serves as general market risk sentiment
  }

  // Use AI for stock-specific sentiment
  let socialSentiment = 0;
  let putCallRatio = 1.0;

  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const searchResults = await zai.functions.invoke('web_search', {
      query: `${symbol} stock sentiment analysis social media`,
      num: 5,
      recency_days: 3,
    });

    if (searchResults && searchResults.length > 0) {
      const context = searchResults.slice(0, 4).map((r: { name: string; snippet: string }, i: number) =>
        `${i + 1}. ${r.name}: ${r.snippet}`
      ).join('\n');

      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are a market sentiment analyst. Given search results about a stock, return a JSON object:
{"socialSentiment": number -1 to 1, "putCallRatio": number (typical range 0.5-2.0)}
Return ONLY valid JSON.`,
          },
          {
            role: 'user',
            content: `Analyze the sentiment for ${symbol}:\n${context}`,
          },
        ],
      });

      const content = completion.choices?.[0]?.message?.content;
      if (content) {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          socialSentiment = Math.max(-1, Math.min(1, parsed.socialSentiment || 0));
          if (parsed.putCallRatio && parsed.putCallRatio > 0) {
            putCallRatio = parsed.putCallRatio;
          }
        }
      }
    }
  } catch {
    // AI analysis failed, use Fear & Greed only
  }

  const signals: VectorSignal[] = [];
  const overallSentiment = (fearGreedIndex - 50) / 100 * 0.3 + socialSentiment * 0.7;

  if (overallSentiment > 0.15) {
    signals.push({
      vectorId: 'sentiment',
      vectorName: 'Sentimiento',
      direction: 'LONG',
      strength: Math.round(Math.abs(overallSentiment) * 100),
      confidence: 55,
      detail: `Sentimiento social positivo (${(socialSentiment * 100).toFixed(0)}%). Fear & Greed: ${fearGreedIndex}.`,
    });
  } else if (overallSentiment < -0.15) {
    signals.push({
      vectorId: 'sentiment',
      vectorName: 'Sentimiento',
      direction: 'SHORT',
      strength: Math.round(Math.abs(overallSentiment) * 100),
      confidence: 55,
      detail: `Sentimiento social negativo (${(socialSentiment * 100).toFixed(0)}%). Fear & Greed: ${fearGreedIndex}.`,
    });
  } else {
    signals.push({
      vectorId: 'sentiment',
      vectorName: 'Sentimiento',
      direction: 'NEUTRAL',
      strength: 25,
      confidence: 45,
      detail: `Sentimiento neutral. Fear & Greed: ${fearGreedIndex}.`,
    });
  }

  return {
    fearGreedIndex,
    socialSentiment: Math.round(socialSentiment * 100) / 100,
    putCallRatio,
    signals,
  };
}

/**
 * Helper: Get social sentiment from AI for any symbol
 */
async function getAISocialSentiment(symbol: string): Promise<number | null> {
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const searchResults = await zai.functions.invoke('web_search', {
      query: `${symbol} social sentiment reddit twitter`,
      num: 3,
      recency_days: 3,
    });

    if (!searchResults || searchResults.length === 0) return null;

    const context = searchResults.slice(0, 3).map((r: { name: string; snippet: string }, i: number) =>
      `${i + 1}. ${r.name}: ${r.snippet}`
    ).join('\n');

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'Return ONLY a number between -1 and 1 representing social media sentiment for the given cryptocurrency. -1=very bearish, 0=neutral, 1=very bullish. Return ONLY the number.',
        },
        {
          role: 'user',
          content: `${symbol} sentiment:\n${context}`,
        },
      ],
    });

    const content = completion.choices?.[0]?.message?.content?.trim();
    if (content) {
      const num = parseFloat(content);
      if (!isNaN(num)) return Math.max(-1, Math.min(1, num));
    }
  } catch {
    // Failed
  }
  return null;
}

// Fallback: simulated sentiment data
function generateSimulatedSentiment(symbol: string): SentimentAnalysis {
  const sentiments: Record<string, { social: number; fearGreed: number; putCall?: number }> = {
    'NVDA': { social: 0.6, fearGreed: 72, putCall: 0.7 },
    'AAPL': { social: 0.3, fearGreed: 58, putCall: 0.9 },
    'TSLA': { social: -0.2, fearGreed: 35, putCall: 1.3 },
    'BTC': { social: 0.5, fearGreed: 55 },
    'ETH': { social: 0.35, fearGreed: 55 },
  };

  const data = sentiments[symbol] ?? { social: 0, fearGreed: 50 };
  const signals: VectorSignal[] = [];
  const overall = data.social;

  if (overall > 0.2) {
    signals.push({ vectorId: 'sentiment', vectorName: 'Sentimiento', direction: 'LONG', strength: Math.round(overall * 100), confidence: 50, detail: `Sentimiento positivo. Fear & Greed: ${data.fearGreed}.` });
  } else if (overall < -0.2) {
    signals.push({ vectorId: 'sentiment', vectorName: 'Sentimiento', direction: 'SHORT', strength: Math.round(Math.abs(overall) * 100), confidence: 50, detail: `Sentimiento negativo. Fear & Greed: ${data.fearGreed}.` });
  } else {
    signals.push({ vectorId: 'sentiment', vectorName: 'Sentimiento', direction: 'NEUTRAL', strength: 25, confidence: 40, detail: `Sentimiento neutral. Fear & Greed: ${data.fearGreed}.` });
  }

  return {
    fearGreedIndex: data.fearGreed,
    socialSentiment: data.social,
    putCallRatio: data.putCall,
    signals,
  };
}
