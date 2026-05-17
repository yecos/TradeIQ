import type {
  TechnicalAnalysis,
  PatternAnalysis,
  VolumeAnalysis,
  NewsAnalysis,
  SentimentAnalysis,
  MacroAnalysis,
  ConfluenceResult,
} from './types';

/**
 * TimeframeRecommendation — suggests the optimal trading timeframe
 * and estimated operation duration based on the full analysis context.
 *
 * Core logic:
 * 1. ATR% (volatility) determines base speed of price movement
 * 2. ADX (trend strength) adjusts — strong trend = hold longer
 * 3. Confluence score adjusts conviction
 * 4. RSI extremes suggest reversal = shorter duration
 * 5. Pattern type adjusts — continuation = longer, reversal = shorter
 * 6. MACD momentum — fresh crossover = trend starting = longer
 * 7. Volume — high volume confirms, allows longer hold
 */

export interface TimeframeRecommendation {
  /** Strategy type: scalping, intraday, swing, or position */
  strategy: 'scalping' | 'intraday' | 'swing' | 'position';
  /** Human-readable Spanish label */
  strategyLabel: string;
  /** Suggested chart timeframes to monitor */
  suggestedTimeframes: string[];
  /** Human-readable estimated duration range in Spanish */
  estimatedDuration: string;
  /** Duration range in hours for programmatic use */
  estimatedDurationHours: { min: number; max: number };
  /** Conviction level based on confluence + trend alignment */
  conviction: 'high' | 'medium' | 'low';
  /** Spanish label for conviction */
  convictionLabel: string;
  /** Bullet-point reasoning explaining the recommendation */
  reasoning: string[];
}

interface StrategyProfile {
  strategy: TimeframeRecommendation['strategy'];
  strategyLabel: string;
  suggestedTimeframes: string[];
  minHours: number;
  maxHours: number;
}

const SCALPING: StrategyProfile = {
  strategy: 'scalping',
  strategyLabel: 'Scalping',
  suggestedTimeframes: ['1m', '5m', '15m'],
  minHours: 0.08, // ~5 min
  maxHours: 2,
};

const INTRADAY: StrategyProfile = {
  strategy: 'intraday',
  strategyLabel: 'Intradía',
  suggestedTimeframes: ['15m', '1H', '4H'],
  minHours: 1,
  maxHours: 8,
};

const SWING: StrategyProfile = {
  strategy: 'swing',
  strategyLabel: 'Swing Trade',
  suggestedTimeframes: ['4H', '1D', '1W'],
  minHours: 16, // 2 days
  maxHours: 168, // 7 days
};

const POSITION: StrategyProfile = {
  strategy: 'position',
  strategyLabel: 'Posición',
  suggestedTimeframes: ['1D', '1W', '1M'],
  minHours: 168, // 1 week
  maxHours: 720, // ~4 weeks
};

/**
 * Format a hours range into a human-readable Spanish string.
 */
function formatDuration(minH: number, maxH: number): string {
  if (maxH <= 2) {
    // Scalping range — express in minutes
    const minM = Math.round(minH * 60);
    const maxM = Math.round(maxH * 60);
    if (minM < 5) return `${maxM} minutos máximo`;
    return `${minM} min - ${maxM} min`;
  }
  if (maxH <= 8) {
    // Intraday
    if (minH < 1) return `${Math.round(minH * 60)} min - ${Math.round(maxH)} horas`;
    return `${Math.round(minH)} - ${Math.round(maxH)} horas`;
  }
  if (maxH <= 168) {
    // Swing — express in days
    const minD = Math.round(minH / 24 * 10) / 10;
    const maxD = Math.round(maxH / 24 * 10) / 10;
    if (minD < 1) return `${Math.round(minH)} horas - ${Math.round(maxD)} días`;
    return `${Math.round(minD)} - ${Math.round(maxD)} días`;
  }
  // Position — express in weeks
  const minW = Math.round(minH / 168 * 10) / 10;
  const maxW = Math.round(maxH / 168 * 10) / 10;
  if (minW < 1) return `${Math.round(minH / 24)} días - ${Math.round(maxW)} semanas`;
  return `${Math.round(minW)} - ${Math.round(maxW)} semanas`;
}

/**
 * Generate a timeframe and duration recommendation based on the full analysis.
 */
export function generateTimeframeRecommendation(
  confluence: ConfluenceResult,
  technical: TechnicalAnalysis | null,
  patterns: PatternAnalysis | null,
  volume: VolumeAnalysis | null,
  news: NewsAnalysis | null,
  sentiment: SentimentAnalysis | null,
  macro: MacroAnalysis | null,
): TimeframeRecommendation {
  const reasoning: string[] = [];
  const entryPrice = confluence.entryPrice;

  // ─── 1. ATR% — Base volatility score ───
  // ATR as percentage of price tells us how much the asset moves per day
  const atr = technical?.atr ?? 0;
  const atrPercent = entryPrice > 0 ? (atr / entryPrice) * 100 : 1;

  // Base strategy determined by volatility
  let baseProfile: StrategyProfile;
  if (atrPercent > 5) {
    baseProfile = SCALPING;
    reasoning.push(`Alta volatilidad (ATR ${atrPercent.toFixed(1)}%). Movimientos rápidos, mejor operar en corto plazo.`);
  } else if (atrPercent > 3) {
    baseProfile = INTRADAY;
    reasoning.push(`Volatilidad media-alta (ATR ${atrPercent.toFixed(1)}%). Operaciones de intradía recomendadas.`);
  } else if (atrPercent > 1.2) {
    baseProfile = SWING;
    reasoning.push(`Volatilidad moderada (ATR ${atrPercent.toFixed(1)}%). El precio requiere tiempo para alcanzar objetivos.`);
  } else {
    baseProfile = POSITION;
    reasoning.push(`Baja volatilidad (ATR ${atrPercent.toFixed(1)}%). Movimientos lentos, operaciones de posición.`);
  }

  // ─── 2. ADX — Trend strength modifier ───
  const adx = technical?.adx ?? 20;
  let adxModifier = 0;
  if (adx > 50) {
    adxModifier = 2;
    reasoning.push(`Tendencia muy fuerte (ADX ${adx.toFixed(1)}). Alta probabilidad de continuación, mantener operación más tiempo.`);
  } else if (adx > 35) {
    adxModifier = 1;
    reasoning.push(`Tendencia fuerte (ADX ${adx.toFixed(1)}). Se puede mantener la operación hasta el objetivo.`);
  } else if (adx > 25) {
    adxModifier = 0;
    reasoning.push(`Tendencia moderada (ADX ${adx.toFixed(1)}). Vigilar posibles cambios de dirección.`);
  } else if (adx > 15) {
    adxModifier = -1;
    reasoning.push(`Tendencia débil (ADX ${adx.toFixed(1)}). Mercado lateral, reducir duración esperada.`);
  } else {
    adxModifier = -2;
    reasoning.push(`Sin tendencia clara (ADX ${adx.toFixed(1)}). Mercado muy lateral, solo scalping si opera.`);
  }

  // ─── 3. RSI — Overbought/oversold → reversal likely ───
  const rsi = technical?.rsi ?? 50;
  let rsiModifier = 0;
  if (rsi > 80) {
    rsiModifier = -2;
    reasoning.push(`RSI extremadamente sobrecomprado (${rsi.toFixed(1)}). Reversión inminente, cerrar rápido.`);
  } else if (rsi > 70) {
    rsiModifier = -1;
    reasoning.push(`RSI en sobrecompra (${rsi.toFixed(1)}). Posible corrección pronto, considerar tomar ganancias temprano.`);
  } else if (rsi < 20) {
    rsiModifier = -2;
    reasoning.push(`RSI extremadamente sobrevendido (${rsi.toFixed(1)}). Reversión inminente, operación corta.`);
  } else if (rsi < 30) {
    rsiModifier = -1;
    reasoning.push(`RSI en sobreventa (${rsi.toFixed(1)}). Posible rebote, pero vigilar.`);
  } else if (rsi >= 40 && rsi <= 60) {
    rsiModifier = 1;
    reasoning.push(`RSI en zona neutral (${rsi.toFixed(1)}). Espacio para que la tendencia continúe.`);
  }

  // ─── 4. MACD — Momentum direction ───
  const macdHist = technical?.macd?.histogram ?? 0;
  let macdModifier = 0;
  if (Math.abs(macdHist) > atr * 0.3) {
    macdModifier = 1;
    reasoning.push(`Momentum MACD fuerte (${macdHist > 0 ? 'positivo' : 'negativo'}). Tendencia con impulso.`);
  } else if (Math.abs(macdHist) < atr * 0.05) {
    macdModifier = -1;
    reasoning.push(`MACD plano. Sin impulso claro, la operación puede estancarse.`);
  }

  // ─── 5. Pattern type modifier ───
  let patternModifier = 0;
  if (patterns && patterns.patterns.length > 0) {
    const bullishPatterns = patterns.patterns.filter(p => p.type === 'bullish');
    const bearishPatterns = patterns.patterns.filter(p => p.type === 'bearish');

    // Check for reversal vs continuation patterns
    const reversalNames = ['hammer', 'inverted hammer', 'shooting star', 'morning star', 'evening star', 'doji'];
    const continuationNames = ['three white soldiers', 'three black crows', 'engulfing'];

    const hasReversal = patterns.patterns.some(p =>
      reversalNames.some(rn => p.name.toLowerCase().includes(rn))
    );
    const hasContinuation = patterns.patterns.some(p =>
      continuationNames.some(cn => p.name.toLowerCase().includes(cn))
    );

    if (hasContinuation) {
      patternModifier = 1;
      reasoning.push(`Patrones de continuación detectados. La tendencia puede prolongarse.`);
    }
    if (hasReversal) {
      patternModifier = -1;
      reasoning.push(`Patrones de reversión detectados. El movimiento puede ser breve, cerrar al alcanzar objetivo.`);
    }
    if (bullishPatterns.length > 0 && bearishPatterns.length === 0) {
      reasoning.push(`${bullishPatterns.length} patrón(es) alcista(s) sin oposición bajista.`);
    } else if (bearishPatterns.length > 0 && bullishPatterns.length === 0) {
      reasoning.push(`${bearishPatterns.length} patrón(es) bajista(s) sin oposición alcista.`);
    }
  }

  // ─── 6. Volume confirmation ───
  let volumeModifier = 0;
  if (volume) {
    if (volume.volumeRatio > 2) {
      volumeModifier = 1;
      reasoning.push(`Volumen alto (${volume.volumeRatio.toFixed(1)}x promedio). Confirma la dirección, operación viable.`);
    } else if (volume.volumeRatio < 0.5) {
      volumeModifier = -1;
      reasoning.push(`Volumen bajo (${volume.volumeRatio.toFixed(1)}x). Señal débil, reducir exposición temporal.`);
    }
    if (volume.accumulationDistribution === 'accumulation' && confluence.overallDirection === 'LONG') {
      volumeModifier += 1;
      reasoning.push(`Fase de acumulación confirma dirección LONG.`);
    } else if (volume.accumulationDistribution === 'distribution' && confluence.overallDirection === 'SHORT') {
      volumeModifier += 1;
      reasoning.push(`Fase de distribución confirma dirección SHORT.`);
    }
  }

  // ─── 7. News/Sentiment/Macro context ───
  let contextModifier = 0;
  if (news) {
    const highImpactCount = news.headlines.filter(h => h.impact === 'high').length;
    if (highImpactCount > 0) {
      contextModifier -= 1;
      reasoning.push(`${highImpactCount} noticia(s) de alto impacto. Volatilidad imprevista, acortar duración o usar SL ajustado.`);
    }
  }
  if (sentiment) {
    // Extreme fear/greed can indicate reversals
    if (sentiment.fearGreedIndex > 80) {
      contextModifier -= 1;
      reasoning.push(`Extrema codicia (Fear&Greed ${sentiment.fearGreedIndex}). Posible techo del mercado.`);
    } else if (sentiment.fearGreedIndex < 20) {
      contextModifier -= 1;
      reasoning.push(`Extremo miedo (Fear&Greed ${sentiment.fearGreedIndex}). Posible suelo pero con riesgo.`);
    }
  }
  if (macro) {
    const upcomingHighImpact = macro.economicEvents.filter(e => e.impact === 'high').length;
    if (upcomingHighImpact > 0) {
      contextModifier -= 1;
      reasoning.push(`${upcomingHighImpact} evento(s) macro de alto impacto próximo(s). Cerrar antes si es posible.`);
    }
  }

  // ─── 8. Confluence score → conviction ───
  const confluenceModifier = confluence.confluenceScore >= 70 ? 1 :
    confluence.confluenceScore >= 40 ? 0 : -1;
  if (confluence.confluenceScore >= 70) {
    reasoning.push(`Alta confluencia (${confluence.confluenceScore}%). Múltiples vectores confirman, se puede mantener la operación.`);
  } else if (confluence.confluenceScore < 40) {
    reasoning.push(`Baja confluencia (${confluence.confluenceScore}%). Señales mixtas, operación más corta y conservadora.`);
  }

  // ─── Calculate final strategy ───
  const totalModifier = adxModifier + rsiModifier + macdModifier + patternModifier + volumeModifier + contextModifier + confluenceModifier;

  // Strategy index: 0=scalping, 1=intraday, 2=swing, 3=position
  const profiles = [SCALPING, INTRADAY, SWING, POSITION];
  const baseIndex = profiles.indexOf(baseProfile);
  const finalIndex = Math.max(0, Math.min(3, baseIndex + Math.round(totalModifier / 3)));
  const finalProfile = profiles[finalIndex];

  // Duration adjustments within the strategy range
  const durationRatio = Math.max(0.3, Math.min(1.0, 0.5 + totalModifier * 0.1));
  const minHours = finalProfile.minHours + (finalProfile.maxHours - finalProfile.minHours) * Math.max(0, durationRatio - 0.3);
  const maxHours = finalProfile.minHours + (finalProfile.maxHours - finalProfile.minHours) * Math.min(1.0, durationRatio + 0.3);

  // Conviction based on confluence + alignment
  const conviction: TimeframeRecommendation['conviction'] =
    confluence.confluenceScore >= 60 && totalModifier >= 2 ? 'high' :
    confluence.confluenceScore >= 40 || totalModifier >= 0 ? 'medium' : 'low';

  const convictionLabel =
    conviction === 'high' ? 'Alta' :
    conviction === 'medium' ? 'Media' : 'Baja';

  // ─── TP distance as cross-check ───
  const tpDistance = Math.abs(confluence.takeProfit - entryPrice);
  const tpDistancePercent = entryPrice > 0 ? (tpDistance / entryPrice) * 100 : 0;
  if (tpDistancePercent > 0) {
    reasoning.push(`Distancia al TP: ${tpDistancePercent.toFixed(1)}% (${tpDistance.toFixed(2)} puntos).`);
  }

  return {
    strategy: finalProfile.strategy,
    strategyLabel: finalProfile.strategyLabel,
    suggestedTimeframes: finalProfile.suggestedTimeframes,
    estimatedDuration: formatDuration(minHours, maxHours),
    estimatedDurationHours: {
      min: Math.round(minHours * 10) / 10,
      max: Math.round(maxHours * 10) / 10,
    },
    conviction,
    convictionLabel,
    reasoning,
  };
}
