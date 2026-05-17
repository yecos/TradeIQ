import type { Candle, VectorSignal, ConfluenceResult, TechnicalAnalysis, PatternAnalysis, VolumeAnalysis, NewsAnalysis, SentimentAnalysis, MacroAnalysis } from './types';
import { analyzeTechnical } from './technical-analysis';
import { detectPatterns } from './pattern-detection';
import { analyzeVolume } from './volume-analysis';
import { analyzeNews } from './news-analysis';
import { analyzeSentiment } from './sentiment-analysis';
import { analyzeMacro } from './macro-analysis';
import { VECTOR_DEFINITIONS } from './vector-definitions';

/**
 * Generate confluence from pre-computed analysis results.
 * Now async to support real API calls for news/sentiment/macro when not precomputed.
 * The API route passes precomputed results to avoid double computation.
 */
export async function generateConfluence(
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
): Promise<ConfluenceResult> {
  const allSignals: VectorSignal[] = [];
  const lastPrice = candles[candles.length - 1].close;
  const atr = calculateSimpleATR(candles);

  // Build weight map from VECTOR_DEFINITIONS
  const weightMap = new Map<string, number>();
  for (const def of VECTOR_DEFINITIONS) {
    weightMap.set(def.id, def.defaultWeight);
  }

  // Use precomputed results if available, otherwise compute them
  // Sync vectors (technical/pattern/volume) are computed instantly
  // Async vectors (news/sentiment/macro) use real API modules with fallback
  const technical = precomputed?.technical ?? (enabledVectors.includes('technical') ? analyzeTechnical(candles) : null);
  const patterns = precomputed?.patterns ?? (enabledVectors.includes('pattern') ? detectPatterns(candles) : null);
  const volume = precomputed?.volume ?? (enabledVectors.includes('volume') ? analyzeVolume(candles) : null);

  // For async vectors: if not precomputed, call the real analysis modules
  // (which have their own caching and fallback logic)
  let news = precomputed?.news ?? null;
  let sentiment = precomputed?.sentiment ?? null;
  let macro = precomputed?.macro ?? null;

  if (enabledVectors.includes('news') && !news) {
    news = await analyzeNews(symbol);
  }
  if (enabledVectors.includes('sentiment') && !sentiment) {
    sentiment = await analyzeSentiment(symbol);
  }
  if (enabledVectors.includes('macro') && !macro) {
    macro = await analyzeMacro(symbol);
  }

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


