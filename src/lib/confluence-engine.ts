import type { Candle, VectorSignal, ConfluenceResult, TechnicalAnalysis, PatternAnalysis, VolumeAnalysis, NewsAnalysis, SentimentAnalysis, MacroAnalysis } from './types';
import { analyzeTechnical } from './technical-analysis';
import { detectPatterns } from './pattern-detection';
import { analyzeVolume } from './volume-analysis';
import { VECTOR_DEFINITIONS } from './vector-definitions';

/**
 * Generate confluence from pre-computed analysis results.
 * Avoids double computation — the API route already computed technical/pattern/volume,
 * so we accept them as parameters instead of re-running them.
 */
export function generateConfluence(
  candles: Candle[],
  symbol: string,
  enabledVectors: string[],
  precomputed?: {
    technical?: TechnicalAnalysis | null;
    patterns?: PatternAnalysis | null;
    volume?: VolumeAnalysis | null;
    news?: NewsAnalysis | null;
    sentiment?: SentimentAnalysis | null;
    macro?: MacroAnalysis | null;
  }
): ConfluenceResult {
  const allSignals: VectorSignal[] = [];
  const lastPrice = candles[candles.length - 1].close;
  const atr = calculateSimpleATR(candles);

  // Build weight map from VECTOR_DEFINITIONS
  const weightMap = new Map<string, number>();
  for (const def of VECTOR_DEFINITIONS) {
    weightMap.set(def.id, def.defaultWeight);
  }

  // Use precomputed results if available, otherwise compute them
  const technical = precomputed?.technical ?? (enabledVectors.includes('technical') ? analyzeTechnical(candles) : null);
  const patterns = precomputed?.patterns ?? (enabledVectors.includes('pattern') ? detectPatterns(candles) : null);
  const volume = precomputed?.volume ?? (enabledVectors.includes('volume') ? analyzeVolume(candles) : null);
  const news = precomputed?.news ?? (enabledVectors.includes('news') ? generateSimulatedNewsAnalysis(symbol) : null);
  const sentiment = precomputed?.sentiment ?? (enabledVectors.includes('sentiment') ? generateSimulatedSentimentAnalysis(symbol) : null);
  const macro = precomputed?.macro ?? (enabledVectors.includes('macro') ? generateSimulatedMacroAnalysis() : null);

  // Collect signals from all enabled vectors, applying weights
  if (technical && enabledVectors.includes('technical')) {
    const weight = weightMap.get('technical') ?? 1.0;
    allSignals.push(...technical.signals
      .filter(s => s.direction !== 'NEUTRAL')
      .map(s => ({ ...s, strength: Math.round(s.strength * weight) }))
    );
  }

  if (patterns && enabledVectors.includes('pattern')) {
    const weight = weightMap.get('pattern') ?? 1.2;
    allSignals.push(...patterns.signals
      .filter(s => s.direction !== 'NEUTRAL')
      .map(s => ({ ...s, strength: Math.round(s.strength * weight) }))
    );
  }

  if (volume && enabledVectors.includes('volume')) {
    const weight = weightMap.get('volume') ?? 1.1;
    allSignals.push(...volume.signals
      .filter(s => s.direction !== 'NEUTRAL')
      .map(s => ({ ...s, strength: Math.round(s.strength * weight) }))
    );
  }

  if (news && enabledVectors.includes('news')) {
    const weight = weightMap.get('news') ?? 1.3;
    allSignals.push(...news.signals
      .filter(s => s.direction !== 'NEUTRAL')
      .map(s => ({ ...s, strength: Math.round(s.strength * weight) }))
    );
  }

  if (sentiment && enabledVectors.includes('sentiment')) {
    const weight = weightMap.get('sentiment') ?? 0.8;
    allSignals.push(...sentiment.signals
      .filter(s => s.direction !== 'NEUTRAL')
      .map(s => ({ ...s, strength: Math.round(s.strength * weight) }))
    );
  }

  if (macro && enabledVectors.includes('macro')) {
    const weight = weightMap.get('macro') ?? 0.7;
    allSignals.push(...macro.signals
      .filter(s => s.direction !== 'NEUTRAL')
      .map(s => ({ ...s, strength: Math.round(s.strength * weight) }))
    );
  }

  // Calculate confluence with weighted scores
  const longSignals = allSignals.filter(s => s.direction === 'LONG');
  const shortSignals = allSignals.filter(s => s.direction === 'SHORT');

  const longScore = longSignals.reduce((sum, s) => sum + s.strength * s.confidence / 100, 0);
  const shortScore = shortSignals.reduce((sum, s) => sum + s.strength * s.confidence / 100, 0);
  const totalScore = longScore + shortScore;

  const overallDirection: ConfluenceResult['overallDirection'] =
    totalScore === 0 ? 'NEUTRAL' :
    longScore > shortScore ? 'LONG' : 'SHORT';

  const confluenceScore = totalScore === 0 ? 0 :
    Math.round(Math.abs(longScore - shortScore) / totalScore * 100);

  // Calculate entry, SL, TP
  const entryPrice = lastPrice;
  let stopLoss: number, takeProfit: number;

  if (overallDirection === 'LONG') {
    stopLoss = Math.round((entryPrice - atr * 1.5) * 100) / 100;
    takeProfit = Math.round((entryPrice + atr * 3) * 100) / 100;
  } else if (overallDirection === 'SHORT') {
    stopLoss = Math.round((entryPrice + atr * 1.5) * 100) / 100;
    takeProfit = Math.round((entryPrice - atr * 3) * 100) / 100;
  } else {
    stopLoss = Math.round((entryPrice - atr * 1.5) * 100) / 100;
    takeProfit = Math.round((entryPrice + atr * 1.5) * 100) / 100;
  }

  const risk = Math.abs(entryPrice - stopLoss);
  const reward = Math.abs(takeProfit - entryPrice);
  const riskReward = risk > 0 ? Math.round(reward / risk * 100) / 100 : 0;

  // Generate recommendation
  let recommendation = '';
  if (confluenceScore >= 70) {
    recommendation = overallDirection === 'LONG'
      ? `ALTA CONFLUENCIA ALCISTA (${confluenceScore}%). ${longSignals.length} vectores confirman. Entrada sugerida en ${entryPrice} con SL en ${stopLoss}.`
      : `ALTA CONFLUENCIA BAJISTA (${confluenceScore}%). ${shortSignals.length} vectores confirman. Entrada sugerida en ${entryPrice} con SL en ${stopLoss}.`;
  } else if (confluenceScore >= 40) {
    recommendation = overallDirection === 'LONG'
      ? `Confluencia moderada alcista (${confluenceScore}%). Algunos vectores confirman dirección. Precaución.`
      : `Confluencia moderada bajista (${confluenceScore}%). Algunos vectores confirman dirección. Precaución.`;
  } else {
    recommendation = `Baja confluencia (${confluenceScore}%). Vectores mixtos o insuficientes. Mejor esperar.`;
  }

  return {
    symbol,
    overallDirection,
    confluenceScore,
    entryPrice,
    stopLoss,
    takeProfit,
    riskReward,
    vectorSignals: allSignals,
    recommendation,
    timestamp: Date.now(),
  };
}

function calculateSimpleATR(candles: Candle[], period: number = 14): number {
  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trueRanges.push(tr);
  }
  const lastN = trueRanges.slice(-period);
  return lastN.reduce((a, b) => a + b, 0) / lastN.length;
}

// --- News Analysis (simulated with structured output) ---

function generateSimulatedNewsAnalysis(symbol: string): NewsAnalysis {
  const newsSentiments: Record<string, { sentiment: number; headlines: NewsAnalysis['headlines'] }> = {
    'NVDA': {
      sentiment: 0.6,
      headlines: [
        { title: 'NVIDIA supera estimaciones de ingresos por chips IA', sentiment: 0.7, impact: 'high', date: new Date().toISOString() },
        { title: 'Demanda de data centers impulza crecimiento', sentiment: 0.5, impact: 'medium', date: new Date().toISOString() },
      ],
    },
    'AAPL': {
      sentiment: 0.3,
      headlines: [
        { title: 'Apple presenta nuevos productos en evento anual', sentiment: 0.4, impact: 'medium', date: new Date().toISOString() },
        { title: 'Ventas de iPhone estables en trimestre', sentiment: 0.2, impact: 'low', date: new Date().toISOString() },
      ],
    },
    'TSLA': {
      sentiment: -0.3,
      headlines: [
        { title: 'Márgenes de Tesla bajo presión por guerra de precios', sentiment: -0.5, impact: 'high', date: new Date().toISOString() },
        { title: 'Competencia creciente en mercado de EVs', sentiment: -0.2, impact: 'medium', date: new Date().toISOString() },
      ],
    },
    'BTC': {
      sentiment: 0.4,
      headlines: [
        { title: 'Bitcoin mantiene niveles de soporte clave', sentiment: 0.3, impact: 'medium', date: new Date().toISOString() },
        { title: 'Flujo institucional positivo en ETFs spot', sentiment: 0.5, impact: 'high', date: new Date().toISOString() },
      ],
    },
    'ETH': {
      sentiment: 0.3,
      headlines: [
        { title: 'Ethereum actividad en DeFi se mantiene estable', sentiment: 0.3, impact: 'medium', date: new Date().toISOString() },
      ],
    },
  };

  const defaultAnalysis = {
    sentiment: 0,
    headlines: [
      { title: 'Sin catalizadores significativos detectados', sentiment: 0, impact: 'low' as const, date: new Date().toISOString() },
    ],
  };

  const data = newsSentiments[symbol] ?? defaultAnalysis;
  const sentimentLabel: NewsAnalysis['sentimentLabel'] =
    data.sentiment > 0.5 ? 'very_bullish' :
    data.sentiment > 0.1 ? 'bullish' :
    data.sentiment < -0.5 ? 'very_bearish' :
    data.sentiment < -0.1 ? 'bearish' : 'neutral';

  const signals: VectorSignal[] = [];
  if (data.sentiment > 0.2) {
    signals.push({
      vectorId: 'news',
      vectorName: 'Noticias',
      direction: 'LONG',
      strength: Math.round(Math.abs(data.sentiment) * 100),
      confidence: 60,
      detail: `Sentimiento de noticias positivo. ${data.headlines.filter(h => h.sentiment > 0).length} headlines alcistas.`,
    });
  } else if (data.sentiment < -0.2) {
    signals.push({
      vectorId: 'news',
      vectorName: 'Noticias',
      direction: 'SHORT',
      strength: Math.round(Math.abs(data.sentiment) * 100),
      confidence: 60,
      detail: `Sentimiento de noticias negativo. ${data.headlines.filter(h => h.sentiment < 0).length} headlines bajistas.`,
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
    sentiment: data.sentiment,
    sentimentLabel,
    headlines: data.headlines,
    signals,
  };
}

// --- Sentiment Analysis (simulated with structured output) ---

function generateSimulatedSentimentAnalysis(symbol: string): SentimentAnalysis {
  const sentiments: Record<string, { social: number; fearGreed: number; putCall?: number }> = {
    'NVDA': { social: 0.6, fearGreed: 72, putCall: 0.7 },
    'AAPL': { social: 0.3, fearGreed: 58, putCall: 0.9 },
    'TSLA': { social: -0.2, fearGreed: 35, putCall: 1.3 },
    'MSFT': { social: 0.4, fearGreed: 62, putCall: 0.8 },
    'META': { social: 0.5, fearGreed: 65, putCall: 0.85 },
    'BTC': { social: 0.5, fearGreed: 68 },
    'ETH': { social: 0.35, fearGreed: 60 },
  };

  const data = sentiments[symbol] ?? { social: 0, fearGreed: 50 };

  const signals: VectorSignal[] = [];
  const overallSentiment = (data.social + (data.fearGreed - 50) / 100) / 2;

  if (overallSentiment > 0.2) {
    signals.push({
      vectorId: 'sentiment',
      vectorName: 'Sentimiento',
      direction: 'LONG',
      strength: Math.round(Math.abs(overallSentiment) * 100),
      confidence: 55,
      detail: `Sentimiento social positivo (${(data.social * 100).toFixed(0)}%). Fear & Greed: ${data.fearGreed}.`,
    });
  } else if (overallSentiment < -0.2) {
    signals.push({
      vectorId: 'sentiment',
      vectorName: 'Sentimiento',
      direction: 'SHORT',
      strength: Math.round(Math.abs(overallSentiment) * 100),
      confidence: 55,
      detail: `Sentimiento social negativo (${(data.social * 100).toFixed(0)}%). Fear & Greed: ${data.fearGreed}.`,
    });
  } else {
    signals.push({
      vectorId: 'sentiment',
      vectorName: 'Sentimiento',
      direction: 'NEUTRAL',
      strength: 25,
      confidence: 45,
      detail: `Sentimiento neutral. Fear & Greed: ${data.fearGreed}. Sin extremo detectado.`,
    });
  }

  return {
    fearGreedIndex: data.fearGreed,
    socialSentiment: data.social,
    putCallRatio: data.putCall,
    signals,
  };
}

// --- Macro Analysis (simulated with structured output) ---

function generateSimulatedMacroAnalysis(): MacroAnalysis {
  // Simulated macro environment — would use real economic calendar API in production
  const signals: VectorSignal[] = [];

  // Simulate Fed environment — currently neutral
  // Possible values: 'hawkish' | 'dovish' | 'neutral'
  const fedTrend = 'neutral' as MacroAnalysis['fedRateTrend'];

  const events: MacroAnalysis['economicEvents'] = [
    {
      event: 'Fed Interest Rate Decision',
      impact: 'high',
      date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      forecast: '5.25-5.50%',
      previous: '5.25-5.50%',
    },
    {
      event: 'CPI Data Release',
      impact: 'high',
      date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
      forecast: '+0.3%',
      previous: '+0.4%',
    },
    {
      event: 'Non-Farm Payrolls',
      impact: 'high',
      date: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
      forecast: '180K',
      previous: '175K',
    },
  ];

  signals.push({
    vectorId: 'macro',
    vectorName: 'Macro',
    direction: 'NEUTRAL',
    strength: 35,
    confidence: 50,
    detail: `Entorno macro ${fedTrend === 'hawkish' ? 'restrictivo (Fed hawkish)' : fedTrend === 'dovish' ? 'accomodaticio (Fed dovish)' : 'neutral'}. ${events.filter(e => e.impact === 'high').length} eventos de alto impacto próximos.`,
  });

  return {
    fedRateTrend: fedTrend,
    economicEvents: events,
    signals,
  };
}
