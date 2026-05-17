import type { Candle, PatternAnalysis, VectorSignal } from './types';

export function detectPatterns(candles: Candle[]): PatternAnalysis {
  const patterns: PatternAnalysis['patterns'] = [];
  const len = candles.length;
  if (len < 5) return { patterns: [], signals: [] };

  const last = len - 1;
  const c = candles[last];
  const prev = candles[last - 1];
  const prev2 = candles[last - 2];

  const bodySize = Math.abs(c.close - c.open);
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  const totalRange = c.high - c.low;

  // Doji
  if (totalRange > 0 && bodySize / totalRange < 0.1) {
    patterns.push({
      name: 'Doji',
      type: 'neutral',
      reliability: 65,
      index: last,
      description: 'Doji detectado. Indecisión del mercado. Posible cambio de dirección.',
    });
  }

  // Hammer (both green and red hammers are valid)
  if (lowerWick > bodySize * 2 && upperWick < bodySize * 0.5) {
    patterns.push({
      name: 'Martillo (Hammer)',
      type: 'bullish',
      reliability: 72,
      index: last,
      description: `Martillo alcista${c.close > c.open ? '' : ' (rojo)'}. Presión compradora rechazó la baja. Posible rebote.`,
    });
  }

  // Inverted Hammer / Shooting Star
  // Inverted Hammer (bullish): appears at bottom of downtrend, long upper wick, small body at bottom
  // Shooting Star (bearish): appears at top of uptrend, long upper wick, small body at bottom
  // We detect both based on the wick pattern; context (trend) determines direction
  // Simplified: if upper wick is dominant and body is small, detect as Shooting Star (bearish reversal at top)
  if (upperWick > bodySize * 2 && lowerWick < bodySize * 0.5 && c.close < c.open) {
    patterns.push({
      name: 'Estrella Fugaz',
      type: 'bearish',
      reliability: 68,
      index: last,
      description: 'Estrella fugaz. Rechazo de niveles altos. Posible reversión bajista.',
    });
  }

  // Inverted Hammer (bullish reversal): same wick pattern but closing near the top (close > open)
  if (upperWick > bodySize * 2 && lowerWick < bodySize * 0.5 && c.close > c.open) {
    patterns.push({
      name: 'Martillo Invertido',
      type: 'bullish',
      reliability: 62,
      index: last,
      description: 'Martillo invertido. Indecisión con presión compradora. Posible reversión alcista.',
    });
  }

  // Bullish Engulfing
  if (prev.close < prev.open && c.close > c.open && c.open <= prev.close && c.close >= prev.open) {
    patterns.push({
      name: 'Envolvente Alcista',
      type: 'bullish',
      reliability: 78,
      index: last,
      description: 'Envolvente alcista. Los compradores tomaron control. Señal de reversión al alza.',
    });
  }

  // Bearish Engulfing
  if (prev.close > prev.open && c.close < c.open && c.open >= prev.close && c.close <= prev.open) {
    patterns.push({
      name: 'Envolvente Bajista',
      type: 'bearish',
      reliability: 78,
      index: last,
      description: 'Envolvente bajista. Los vendedores tomaron control. Señal de reversión a la baja.',
    });
  }

  // Morning Star
  if (
    prev2.close < prev2.open && // First candle bearish
    Math.abs(prev.close - prev.open) < Math.abs(prev2.close - prev2.open) * 0.3 && // Second candle small
    c.close > c.open && // Third candle bullish
    c.close > (prev2.open + prev2.close) / 2
  ) {
    patterns.push({
      name: 'Estrella de la Mañana',
      type: 'bullish',
      reliability: 82,
      index: last,
      description: 'Estrella de la mañana. Patrón de reversión alcista de alta confiabilidad.',
    });
  }

  // Evening Star
  if (
    prev2.close > prev2.open && // First candle bullish
    Math.abs(prev.close - prev.open) < Math.abs(prev2.close - prev2.open) * 0.3 && // Second candle small
    c.close < c.open && // Third candle bearish
    c.close < (prev2.open + prev2.close) / 2
  ) {
    patterns.push({
      name: 'Estrella de la Noche',
      type: 'bearish',
      reliability: 82,
      index: last,
      description: 'Estrella de la noche. Patrón de reversión bajista de alta confiabilidad.',
    });
  }

  // Pin Bar Bullish
  if (lowerWick > bodySize * 3 && lowerWick > upperWick * 3) {
    patterns.push({
      name: 'Pin Bar Alcista',
      type: 'bullish',
      reliability: 75,
      index: last,
      description: 'Pin bar alcista. Rechazo claro de niveles bajos. Posible movimiento al alza.',
    });
  }

  // Pin Bar Bearish
  if (upperWick > bodySize * 3 && upperWick > lowerWick * 3) {
    patterns.push({
      name: 'Pin Bar Bajista',
      type: 'bearish',
      reliability: 75,
      index: last,
      description: 'Pin bar bajista. Rechazo claro de niveles altos. Posible movimiento a la baja.',
    });
  }

  // Three White Soldiers
  if (
    candles.slice(-3).every(candle => candle.close > candle.open) &&
    candles[last].close > candles[last - 1].close &&
    candles[last - 1].close > candles[last - 2].close
  ) {
    patterns.push({
      name: 'Tres Soldados Blancos',
      type: 'bullish',
      reliability: 85,
      index: last,
      description: 'Tres velas alcistas consecutivas. Momentum comprador muy fuerte.',
    });
  }

  // Three Black Crows
  if (
    candles.slice(-3).every(candle => candle.close < candle.open) &&
    candles[last].close < candles[last - 1].close &&
    candles[last - 1].close < candles[last - 2].close
  ) {
    patterns.push({
      name: 'Tres Cuervos Negros',
      type: 'bearish',
      reliability: 85,
      index: last,
      description: 'Tres velas bajistas consecutivas. Momentum vendedor muy fuerte.',
    });
  }

  // Generate signals from detected patterns
  const signals: VectorSignal[] = patterns.map(p => ({
    vectorId: `pattern_${p.name.toLowerCase().replace(/\s/g, '_')}`,
    vectorName: p.name,
    direction: p.type === 'bullish' ? 'LONG' : p.type === 'bearish' ? 'SHORT' : 'NEUTRAL',
    strength: p.reliability,
    confidence: p.reliability,
    detail: p.description,
  }));

  if (patterns.length === 0) {
    signals.push({
      vectorId: 'pattern_none',
      vectorName: 'Patrones',
      direction: 'NEUTRAL',
      strength: 20,
      confidence: 40,
      detail: 'No se detectaron patrones de vela significativos en las últimas velas.',
    });
  }

  return { patterns, signals };
}
