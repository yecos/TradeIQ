import type { Candle, VectorSignal, ConfluenceResult } from './types';
import { analyzeTechnical } from './technical-analysis';
import { detectPatterns } from './pattern-detection';
import { analyzeVolume } from './volume-analysis';

export function generateConfluence(
  candles: Candle[],
  symbol: string,
  enabledVectors: string[]
): ConfluenceResult {
  const allSignals: VectorSignal[] = [];
  const lastPrice = candles[candles.length - 1].close;
  const atr = calculateSimpleATR(candles);

  // Technical Analysis
  if (enabledVectors.includes('technical')) {
    const techResult = analyzeTechnical(candles);
    allSignals.push(...techResult.signals.filter(s => s.direction !== 'NEUTRAL'));
  }

  // Pattern Detection
  if (enabledVectors.includes('pattern')) {
    const patternResult = detectPatterns(candles);
    allSignals.push(...patternResult.signals.filter(s => s.direction !== 'NEUTRAL'));
  }

  // Volume Analysis
  if (enabledVectors.includes('volume')) {
    const volumeResult = analyzeVolume(candles);
    allSignals.push(...volumeResult.signals.filter(s => s.direction !== 'NEUTRAL'));
  }

  // News & Sentiment (simulated - in production would use AI)
  if (enabledVectors.includes('news')) {
    allSignals.push(...generateSimulatedNewsSignals(symbol));
  }

  if (enabledVectors.includes('sentiment')) {
    allSignals.push(...generateSimulatedSentimentSignals(symbol));
  }

  if (enabledVectors.includes('macro')) {
    allSignals.push(...generateSimulatedMacroSignals());
  }

  // Calculate confluence
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

function generateSimulatedNewsSignals(symbol: string): VectorSignal[] {
  // In production, this would use z-ai-web-dev-sdk to analyze real news
  const newsSentiments: Record<string, { direction: 'LONG' | 'SHORT'; strength: number; detail: string }[]> = {
    'NVDA': [
      { direction: 'LONG', strength: 75, detail: 'Noticias positivas sobre demanda de chips IA. Earnings above estimates.' },
    ],
    'AAPL': [
      { direction: 'LONG', strength: 55, detail: 'Lanzamiento de nuevos productos. Sentimiento de mercado favorable.' },
    ],
    'TSLA': [
      { direction: 'SHORT', strength: 60, detail: 'Preocupaciones sobre márgenes. Competencia creciente en EVs.' },
    ],
  };

  const defaultNews = { direction: 'NEUTRAL' as const, strength: 40, detail: 'Noticias con impacto moderado. Sin catalizador claro.' };
  const news = newsSentiments[symbol]?.[0] || defaultNews;

  return [{
    vectorId: 'news',
    vectorName: 'Noticias',
    direction: news.direction,
    strength: news.strength,
    confidence: 60,
    detail: news.detail,
  }];
}

function generateSimulatedSentimentSignals(symbol: string): VectorSignal[] {
  // In production, would analyze social media, Fear & Greed index, etc.
  const sentiments: Record<string, number> = {
    'NVDA': 0.6,
    'AAPL': 0.3,
    'TSLA': -0.2,
    'MSFT': 0.4,
    'META': 0.5,
  };
  const sentiment = sentiments[symbol] || 0;

  return [{
    vectorId: 'sentiment',
    vectorName: 'Sentimiento',
    direction: sentiment > 0.2 ? 'LONG' : sentiment < -0.2 ? 'SHORT' : 'NEUTRAL',
    strength: Math.round(Math.abs(sentiment) * 100),
    confidence: 55,
    detail: `Sentimiento social ${sentiment > 0 ? 'positivo' : sentiment < 0 ? 'negativo' : 'neutral'} (${(sentiment * 100).toFixed(0)}%). Fear & Greed: ${Math.round(50 + sentiment * 25)}.`,
  }];
}

function generateSimulatedMacroSignals(): VectorSignal[] {
  return [{
    vectorId: 'macro',
    vectorName: 'Macro',
    direction: 'NEUTRAL',
    strength: 35,
    confidence: 50,
    detail: 'Entorno macro neutral. Sin eventos Fed próximos. Volatilidad moderada.',
  }];
}
