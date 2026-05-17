import type { Candle, VectorSignal, TechnicalAnalysis } from './types';

function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  let ema = data[0];
  result.push(ema);
  for (let i = 1; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
    result.push(ema);
  }
  return result;
}

function calculateRSI(closes: number[], period: number = 14): number[] {
  const result: number[] = [];

  if (closes.length < period + 1) {
    return closes.map(() => 50);
  }

  // Calculate initial average gain/loss
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // First RSI value: simple average of first `period` changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // Fill initial positions with 50
  for (let i = 0; i < period; i++) {
    result.push(50);
  }

  // First real RSI
  const rs0 = avgLoss === 0 ? 999 : avgGain / avgLoss;
  result.push(100 - 100 / (1 + rs0));

  // Subsequent RSI values using Wilder's smoothing
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 999 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }

  return result;
}

function calculateMACD(closes: number[]): { value: number[]; signal: number[]; histogram: number[] } {
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = calculateEMA(macdLine, 9);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { value: macdLine, signal: signalLine, histogram };
}

function calculateBollingerBands(closes: number[], period: number = 20): { upper: number[]; middle: number[]; lower: number[] } {
  const sma = calculateSMA(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (isNaN(sma[i])) {
      upper.push(NaN);
      lower.push(NaN);
    } else {
      const slice = closes.slice(Math.max(0, i - period + 1), i + 1);
      const std = Math.sqrt(slice.reduce((sum, val) => sum + Math.pow(val - sma[i], 2), 0) / slice.length);
      upper.push(sma[i] + 2 * std);
      lower.push(sma[i] - 2 * std);
    }
  }

  return { upper, middle: sma, lower };
}

function calculateATR(candles: Candle[], period: number = 14): number {
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

function calculateADX(candles: Candle[], period: number = 14): number {
  // Simplified ADX calculation
  let plusDM = 0, minusDM = 0, tr = 0;
  const len = Math.min(period, candles.length - 1);
  for (let i = candles.length - len; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM += upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM += downMove > upMove && downMove > 0 ? downMove : 0;
    tr += Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
  }
  if (tr === 0) return 25;
  const plusDI = (plusDM / tr) * 100;
  const minusDI = (minusDM / tr) * 100;
  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
  return dx;
}

export function analyzeTechnical(candles: Candle[]): TechnicalAnalysis {
  const closes = candles.map(c => c.close);
  const last = closes.length - 1;
  const currentPrice = closes[last];

  const rsiValues = calculateRSI(closes);
  const rsi = isNaN(rsiValues[last]) ? 50 : rsiValues[last];

  const macdResult = calculateMACD(closes);
  const bb = calculateBollingerBands(closes);
  const ema20Values = calculateEMA(closes, 20);
  const ema50Values = calculateEMA(closes, 50);
  const sma200Values = calculateSMA(closes, 200);

  const atr = calculateATR(candles);
  const adx = calculateADX(candles);

  // Stochastic RSI (simplified)
  const prevRSI = isNaN(rsiValues[last - 1]) ? 50 : rsiValues[last - 1];
  const stochRSI = { k: Math.min(100, Math.max(0, rsi)), d: Math.min(100, Math.max(0, prevRSI)) };

  // Generate signals from technical indicators
  const signals: VectorSignal[] = [];

  // RSI Signal
  if (rsi < 30) {
    signals.push({
      vectorId: 'rsi',
      vectorName: 'RSI',
      direction: 'LONG',
      strength: Math.round((30 - rsi) / 30 * 100),
      confidence: 70,
      detail: `RSI en sobreventa (${rsi.toFixed(1)}). Posible rebote alcista.`,
    });
  } else if (rsi > 70) {
    signals.push({
      vectorId: 'rsi',
      vectorName: 'RSI',
      direction: 'SHORT',
      strength: Math.round((rsi - 70) / 30 * 100),
      confidence: 70,
      detail: `RSI en sobrecompra (${rsi.toFixed(1)}). Posible corrección bajista.`,
    });
  } else {
    signals.push({
      vectorId: 'rsi',
      vectorName: 'RSI',
      direction: 'NEUTRAL',
      strength: 30,
      confidence: 50,
      detail: `RSI en zona neutral (${rsi.toFixed(1)}). Sin señal clara.`,
    });
  }

  // MACD Signal
  const macdHist = macdResult.histogram[last];
  if (macdHist > 0 && macdResult.histogram[last - 1] <= 0) {
    signals.push({
      vectorId: 'macd',
      vectorName: 'MACD',
      direction: 'LONG',
      strength: 80,
      confidence: 75,
      detail: 'Cruce alcista MACD. Momentum positivo.',
    });
  } else if (macdHist < 0 && macdResult.histogram[last - 1] >= 0) {
    signals.push({
      vectorId: 'macd',
      vectorName: 'MACD',
      direction: 'SHORT',
      strength: 80,
      confidence: 75,
      detail: 'Cruce bajista MACD. Momentum negativo.',
    });
  } else if (macdHist > 0) {
    signals.push({
      vectorId: 'macd',
      vectorName: 'MACD',
      direction: 'LONG',
      strength: 60,
      confidence: 60,
      detail: 'MACD positivo. Momentum alcista sostenido.',
    });
  } else {
    signals.push({
      vectorId: 'macd',
      vectorName: 'MACD',
      direction: 'SHORT',
      strength: 60,
      confidence: 60,
      detail: 'MACD negativo. Momentum bajista sostenido.',
    });
  }

  // Bollinger Bands Signal
  if (currentPrice <= bb.lower[last]) {
    signals.push({
      vectorId: 'bollinger',
      vectorName: 'Bollinger',
      direction: 'LONG',
      strength: 75,
      confidence: 65,
      detail: 'Precio tocando banda inferior. Posible rebote.',
      priceTarget: bb.middle[last],
    });
  } else if (currentPrice >= bb.upper[last]) {
    signals.push({
      vectorId: 'bollinger',
      vectorName: 'Bollinger',
      direction: 'SHORT',
      strength: 75,
      confidence: 65,
      detail: 'Precio tocando banda superior. Posible rechazo.',
      priceTarget: bb.middle[last],
    });
  }

  // EMA Crossover Signal
  const ema20 = ema20Values[last];
  const ema50 = ema50Values[last];
  const prevEma20 = ema20Values[last - 1];
  const prevEma50 = ema50Values[last - 1];
  if (ema20 > ema50 && prevEma20 <= prevEma50) {
    signals.push({
      vectorId: 'ema_cross',
      vectorName: 'EMA 20/50',
      direction: 'LONG',
      strength: 85,
      confidence: 80,
      detail: 'Golden Cross EMA 20/50. Señal alcista fuerte.',
    });
  } else if (ema20 < ema50 && prevEma20 >= prevEma50) {
    signals.push({
      vectorId: 'ema_cross',
      vectorName: 'EMA 20/50',
      direction: 'SHORT',
      strength: 85,
      confidence: 80,
      detail: 'Death Cross EMA 20/50. Señal bajista fuerte.',
    });
  } else if (ema20 > ema50) {
    signals.push({
      vectorId: 'ema_cross',
      vectorName: 'EMA 20/50',
      direction: 'LONG',
      strength: 55,
      confidence: 60,
      detail: 'EMA 20 encima de EMA 50. Tendencia alcista.',
    });
  } else {
    signals.push({
      vectorId: 'ema_cross',
      vectorName: 'EMA 20/50',
      direction: 'SHORT',
      strength: 55,
      confidence: 60,
      detail: 'EMA 20 debajo de EMA 50. Tendencia bajista.',
    });
  }

  // ADX Signal (trend strength)
  if (adx > 25) {
    signals.push({
      vectorId: 'adx',
      vectorName: 'ADX',
      direction: signals[0]?.direction || 'NEUTRAL',
      strength: Math.min(100, adx * 2),
      confidence: 70,
      detail: `ADX en ${adx.toFixed(1)}. Tendencia fuerte confirmada.`,
    });
  }

  return {
    rsi: isNaN(rsi) ? 50 : Math.round(rsi * 100) / 100,
    macd: {
      value: Math.round(macdResult.value[last] * 100) / 100,
      signal: Math.round(macdResult.signal[last] * 100) / 100,
      histogram: Math.round(macdResult.histogram[last] * 100) / 100,
    },
    bollingerBands: {
      upper: isNaN(bb.upper[last]) ? currentPrice * 1.02 : Math.round(bb.upper[last] * 100) / 100,
      middle: isNaN(bb.middle[last]) ? currentPrice : Math.round(bb.middle[last] * 100) / 100,
      lower: isNaN(bb.lower[last]) ? currentPrice * 0.98 : Math.round(bb.lower[last] * 100) / 100,
    },
    ema20: Math.round(ema20 * 100) / 100,
    ema50: Math.round(ema50 * 100) / 100,
    sma200: isNaN(sma200Values[last]) ? currentPrice : Math.round(sma200Values[last] * 100) / 100,
    adx: Math.round(adx * 100) / 100,
    atr: Math.round(atr * 100) / 100,
    stochRSI: { k: Math.round(stochRSI.k * 100) / 100, d: Math.round(stochRSI.d * 100) / 100 },
    signals,
  };
}
