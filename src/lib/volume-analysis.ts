import type { Candle, VolumeAnalysis, VectorSignal } from './types';

export function analyzeVolume(candles: Candle[]): VolumeAnalysis {
  const len = candles.length;
  if (len < 20) {
    return {
      volumeTrend: 'stable',
      volumeRatio: 1,
      obv: 0,
      accumulationDistribution: 'neutral',
      signals: [],
    };
  }

  const volumes = candles.map(c => c.volume);
  const closes = candles.map(c => c.close);

  // Average volume (last 20 periods)
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const currentVolume = volumes[len - 1];
  const volumeRatio = currentVolume / avgVolume;

  // Volume trend
  const recentAvg = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const olderAvg = volumes.slice(-20, -5).reduce((a, b) => a + b, 0) / 15;
  const volumeTrend: VolumeAnalysis['volumeTrend'] =
    recentAvg > olderAvg * 1.2 ? 'increasing' :
    recentAvg < olderAvg * 0.8 ? 'decreasing' : 'stable';

  // OBV (On Balance Volume) trend
  let obv = 0;
  for (let i = 1; i < len; i++) {
    if (closes[i] > closes[i - 1]) obv += volumes[i];
    else if (closes[i] < closes[i - 1]) obv -= volumes[i];
  }

  // Accumulation/Distribution (simplified)
  const last10Candles = candles.slice(-10);
  let upVolume = 0, downVolume = 0;
  for (let i = 0; i < last10Candles.length; i++) {
    if (last10Candles[i].close > last10Candles[i].open) {
      upVolume += last10Candles[i].volume;
    } else {
      downVolume += last10Candles[i].volume;
    }
  }
  const accumulationDistribution: VolumeAnalysis['accumulationDistribution'] =
    upVolume > downVolume * 1.3 ? 'accumulation' :
    downVolume > upVolume * 1.3 ? 'distribution' : 'neutral';

  // Generate signals
  const signals: VectorSignal[] = [];

  if (volumeRatio > 2) {
    const lastCandle = candles[len - 1];
    const direction = lastCandle.close > lastCandle.open ? 'LONG' : 'SHORT';
    signals.push({
      vectorId: 'volume_spike',
      vectorName: 'Volume Spike',
      direction,
      strength: 85,
      confidence: 70,
      detail: `Volumen ${volumeRatio.toFixed(1)}x mayor al promedio. Movimiento con participación fuerte.`,
    });
  } else if (volumeRatio > 1.5) {
    const lastCandle = candles[len - 1];
    const direction = lastCandle.close > lastCandle.open ? 'LONG' : 'SHORT';
    signals.push({
      vectorId: 'volume_increase',
      vectorName: 'Volumen Alto',
      direction,
      strength: 65,
      confidence: 60,
      detail: `Volumen ${volumeRatio.toFixed(1)}x por encima del promedio. Interés incrementado.`,
    });
  }

  if (accumulationDistribution === 'accumulation') {
    signals.push({
      vectorId: 'accumulation',
      vectorName: 'Acumulación',
      direction: 'LONG',
      strength: 60,
      confidence: 65,
      detail: 'Fase de acumulación detectada. Compra institucional probable.',
    });
  } else if (accumulationDistribution === 'distribution') {
    signals.push({
      vectorId: 'distribution',
      vectorName: 'Distribución',
      direction: 'SHORT',
      strength: 60,
      confidence: 65,
      detail: 'Fase de distribución detectada. Venta institucional probable.',
    });
  }

  if (signals.length === 0) {
    signals.push({
      vectorId: 'volume_neutral',
      vectorName: 'Volumen',
      direction: 'NEUTRAL',
      strength: 30,
      confidence: 40,
      detail: 'Volumen en rango normal. Sin presión significativa.',
    });
  }

  return { volumeTrend, volumeRatio: Math.round(volumeRatio * 100) / 100, obv, accumulationDistribution, signals };
}
