import type { Candle, VectorSignal, TechnicalAnalysis } from '../types';
import { analyzeTechnical } from '../technical-analysis';
import { detectPatterns } from '../pattern-detection';
import { analyzeVolume } from '../volume-analysis';

/**
 * Timeframe configurations with weights for multi-timeframe analysis.
 *
 * Key principle: Higher timeframes define TREND, lower timeframes define ENTRY.
 * When multiple timeframes agree on direction, confluence is much stronger.
 */

export interface TimeframeConfig {
  label: string;       // e.g. '5m', '1h', '1D'
  interval: string;    // Binance interval or provider interval
  weight: number;      // Weight in final confluence (higher = more important for trend)
  role: 'trend' | 'confirmation' | 'entry'; // Role in analysis
  candleCount: number; // How many candles to fetch
}

export const DEFAULT_TIMEFRAMES: TimeframeConfig[] = [
  { label: '1D', interval: '1d', weight: 1.5, role: 'trend', candleCount: 90 },
  { label: '4H', interval: '4h', weight: 1.2, role: 'confirmation', candleCount: 60 },
  { label: '1H', interval: '1h', weight: 1.0, role: 'confirmation', candleCount: 60 },
  { label: '15M', interval: '15m', weight: 0.8, role: 'entry', candleCount: 48 },
  { label: '5M', interval: '5m', weight: 0.6, role: 'entry', candleCount: 48 },
];

export interface TimeframeAnalysis {
  timeframe: string;
  label: string;
  role: 'trend' | 'confirmation' | 'entry';
  weight: number;
  technical: TechnicalAnalysis | null;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  strength: number; // 0-100
  confidence: number; // 0-100
}

export interface MultiTimeframeResult {
  timeframes: TimeframeAnalysis[];
  trendDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  entryDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  overallDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  alignment: number; // 0-100 — how aligned the timeframes are
  trendStrength: number; // 0-100
  entryPrecision: number; // 0-100
  signals: VectorSignal[];
  recommendation: string;
}

/**
 * Analyze a single timeframe's candles using technical + pattern + volume vectors
 * (the synchronous vectors only — news/sentiment/macro are symbol-level, not timeframe-level)
 */
export function analyzeTimeframe(
  candles: Candle[],
  timeframe: string,
  config: TimeframeConfig
): TimeframeAnalysis {
  if (candles.length < 20) {
    return {
      timeframe,
      label: config.label,
      role: config.role,
      weight: config.weight,
      technical: null,
      direction: 'NEUTRAL',
      strength: 0,
      confidence: 0,
    };
  }

  const technical = analyzeTechnical(candles);
  const patterns = detectPatterns(candles);
  const volume = analyzeVolume(candles);

  // Collect directional signals
  let longScore = 0;
  let shortScore = 0;
  let totalConfidence = 0;
  let signalCount = 0;

  for (const signal of technical.signals) {
    if (signal.direction === 'LONG') {
      longScore += signal.strength * signal.confidence / 100;
    } else if (signal.direction === 'SHORT') {
      shortScore += signal.strength * signal.confidence / 100;
    }
    totalConfidence += signal.confidence;
    signalCount++;
  }

  for (const signal of patterns.signals) {
    if (signal.direction === 'LONG') {
      longScore += signal.strength * signal.confidence / 100 * 0.8;
    } else if (signal.direction === 'SHORT') {
      shortScore += signal.strength * signal.confidence / 100 * 0.8;
    }
    signalCount++;
  }

  for (const signal of volume.signals) {
    if (signal.direction === 'LONG') {
      longScore += signal.strength * signal.confidence / 100 * 0.6;
    } else if (signal.direction === 'SHORT') {
      shortScore += signal.strength * signal.confidence / 100 * 0.6;
    }
    signalCount++;
  }

  const total = longScore + shortScore;
  const direction: 'LONG' | 'SHORT' | 'NEUTRAL' =
    total === 0 ? 'NEUTRAL' : longScore > shortScore * 1.3 ? 'LONG' : shortScore > longScore * 1.3 ? 'SHORT' : 'NEUTRAL';

  const strength = total === 0 ? 0 : Math.round(Math.abs(longScore - shortScore) / total * 100);
  const confidence = signalCount > 0 ? Math.round(totalConfidence / signalCount) : 0;

  return {
    timeframe,
    label: config.label,
    role: config.role,
    weight: config.weight,
    technical,
    direction,
    strength,
    confidence,
  };
}

/**
 * Analyze multiple timeframes and produce a combined result
 */
export function analyzeMultiTimeframe(
  timeframeData: { timeframe: string; candles: Candle[]; config: TimeframeConfig }[]
): MultiTimeframeResult {
  const analyses: TimeframeAnalysis[] = timeframeData.map(({ timeframe, candles, config }) =>
    analyzeTimeframe(candles, timeframe, config)
  );

  // Separate trend vs entry timeframes
  const trendTFs = analyses.filter(a => a.role === 'trend');
  const entryTFs = analyses.filter(a => a.role === 'entry');

  // Calculate weighted direction scores
  let longWeighted = 0;
  let shortWeighted = 0;
  let totalWeight = 0;

  for (const tf of analyses) {
    if (tf.direction === 'LONG') {
      longWeighted += tf.strength * tf.weight;
    } else if (tf.direction === 'SHORT') {
      shortWeighted += tf.strength * tf.weight;
    }
    totalWeight += tf.weight;
  }

  // Trend direction (from trend timeframes only)
  let trendLong = 0, trendShort = 0;
  for (const tf of trendTFs) {
    if (tf.direction === 'LONG') trendLong += tf.strength * tf.weight;
    else if (tf.direction === 'SHORT') trendShort += tf.strength * tf.weight;
  }
  const trendDirection: 'LONG' | 'SHORT' | 'NEUTRAL' =
    trendLong + trendShort === 0 ? 'NEUTRAL' :
    trendLong > trendShort ? 'LONG' : 'SHORT';

  // Entry direction (from entry timeframes only)
  let entryLong = 0, entryShort = 0;
  for (const tf of entryTFs) {
    if (tf.direction === 'LONG') entryLong += tf.strength * tf.weight;
    else if (tf.direction === 'SHORT') entryShort += tf.strength * tf.weight;
  }
  const entryDirection: 'LONG' | 'SHORT' | 'NEUTRAL' =
    entryLong + entryShort === 0 ? 'NEUTRAL' :
    entryLong > entryShort ? 'LONG' : 'SHORT';

  // Overall direction
  const overallDirection: 'LONG' | 'SHORT' | 'NEUTRAL' =
    totalWeight === 0 ? 'NEUTRAL' :
    longWeighted > shortWeighted ? 'LONG' : 'SHORT';

  // Alignment: how much do the timeframes agree?
  const directionalTFs = analyses.filter(a => a.direction !== 'NEUTRAL');
  const alignedWithOverall = directionalTFs.filter(a => a.direction === overallDirection).length;
  const alignment = directionalTFs.length === 0 ? 0 :
    Math.round(alignedWithOverall / directionalTFs.length * 100);

  // Trend strength (from trend TFs)
  const trendStrength = trendTFs.length === 0 ? 50 :
    Math.round(trendTFs.reduce((sum, tf) => sum + tf.strength, 0) / trendTFs.length);

  // Entry precision (from entry TFs)
  const entryPrecision = entryTFs.length === 0 ? 50 :
    Math.round(entryTFs.reduce((sum, tf) => sum + tf.strength, 0) / entryTFs.length);

  // Generate combined signals
  const signals: VectorSignal[] = [];

  // Multi-timeframe alignment signal (most important)
  if (alignment >= 80 && overallDirection !== 'NEUTRAL') {
    signals.push({
      vectorId: 'multi_tf',
      vectorName: 'Multi-TF',
      direction: overallDirection,
      strength: Math.min(100, alignment),
      confidence: Math.min(95, alignment + 10),
      detail: `Fuerte alineación multi-timeframe (${alignment}%). ${directionalTFs.length}/${analyses.length} timeframes confirman ${overallDirection === 'LONG' ? 'alcista' : 'bajista'}.`,
    });
  } else if (alignment >= 50 && overallDirection !== 'NEUTRAL') {
    signals.push({
      vectorId: 'multi_tf',
      vectorName: 'Multi-TF',
      direction: overallDirection,
      strength: Math.round(alignment * 0.7),
      confidence: Math.round(alignment * 0.8),
      detail: `Alineación parcial multi-timeframe (${alignment}%). Tendencia ${trendDirection}, entrada ${entryDirection}.`,
    });
  } else if (alignment < 50) {
    signals.push({
      vectorId: 'multi_tf',
      vectorName: 'Multi-TF',
      direction: 'NEUTRAL',
      strength: 30,
      confidence: 40,
      detail: `Timeframes desalineados (${alignment}%). Tendencia ${trendDirection} pero entrada ${entryDirection}. Precaución.`,
    });
  }

  // Trend signal
  if (trendDirection !== 'NEUTRAL' && trendStrength >= 40) {
    signals.push({
      vectorId: 'trend_tf',
      vectorName: 'Tendencia TF',
      direction: trendDirection,
      strength: trendStrength,
      confidence: 70,
      detail: `Tendencia ${trendDirection === 'LONG' ? 'alcista' : 'bajista'} en timeframes mayores (1D/4H). Fuerza: ${trendStrength}%.`,
    });
  }

  // Entry signal
  if (entryDirection !== 'NEUTRAL' && entryPrecision >= 40) {
    signals.push({
      vectorId: 'entry_tf',
      vectorName: 'Entrada TF',
      direction: entryDirection,
      strength: entryPrecision,
      confidence: 65,
      detail: `Señal de entrada ${entryDirection === 'LONG' ? 'alcista' : 'bajista'} en timeframes menores (5m/15m). Precisión: ${entryPrecision}%.`,
    });
  }

  // Trend-Entry conflict warning
  if (trendDirection !== 'NEUTRAL' && entryDirection !== 'NEUTRAL' && trendDirection !== entryDirection) {
    signals.push({
      vectorId: 'tf_conflict',
      vectorName: 'Conflicto TF',
      direction: 'NEUTRAL',
      strength: 50,
      confidence: 70,
      detail: `⚠️ Conflicto: Tendencia ${trendDirection} vs Entrada ${entryDirection}. Entrada contra-tendencia — mayor riesgo.`,
    });
  }

  // Generate recommendation
  let recommendation = '';
  if (alignment >= 80 && overallDirection !== 'NEUTRAL') {
    recommendation = `ALTA CONFLUENCIA MULTI-TF: ${analyses.filter(a => a.direction === overallDirection).length}/${analyses.length} timeframes alineados ${overallDirection === 'LONG' ? 'alcista' : 'bajista'}. Tendencia: ${trendDirection} (fuerza ${trendStrength}%). Entrada: ${entryDirection} (precisión ${entryPrecision}%).`;
  } else if (alignment >= 50 && overallDirection !== 'NEUTRAL') {
    recommendation = `Confluencia moderada multi-TF: ${alignment}% alineados ${overallDirection === 'LONG' ? 'alcista' : 'bajista'}. Tendencia y entrada ${trendDirection === entryDirection ? 'coinciden' : 'divergen'}.`;
  } else {
    recommendation = `Baja confluencia multi-TF: Timeframes desalineados (${alignment}%). Tendencia ${trendDirection}, entrada ${entryDirection}. Mejor esperar alineación.`;
  }

  return {
    timeframes: analyses,
    trendDirection,
    entryDirection,
    overallDirection,
    alignment,
    trendStrength,
    entryPrecision,
    signals,
    recommendation,
  };
}
