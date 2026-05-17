import { describe, it, expect } from 'vitest';
import { generateTimeframeRecommendation } from '../lib/timeframe-recommender';
import type { ConfluenceResult, TechnicalAnalysis, PatternAnalysis, VolumeAnalysis } from '../lib/types';

function makeConfluence(overrides: Partial<ConfluenceResult> = {}): ConfluenceResult {
  return {
    symbol: 'BTC/USD',
    overallDirection: 'LONG',
    confluenceScore: 65,
    entryPrice: 65000,
    stopLoss: 63000,
    takeProfit: 69000,
    riskReward: 2.0,
    vectorSignals: [],
    recommendation: 'Test recommendation',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeTechnical(overrides: Partial<TechnicalAnalysis> = {}): TechnicalAnalysis {
  return {
    rsi: 55,
    macd: { value: 100, signal: 80, histogram: 20 },
    bollingerBands: { upper: 67000, middle: 65000, lower: 63000 },
    ema20: 64800,
    ema50: 64200,
    sma200: 63000,
    adx: 30,
    atr: 1300, // ~2% of 65000
    stochRSI: { k: 60, d: 55 },
    signals: [],
    ...overrides,
  };
}

function makePattern(overrides: Partial<PatternAnalysis> = {}): PatternAnalysis {
  return {
    patterns: [],
    signals: [],
    ...overrides,
  };
}

function makeVolume(overrides: Partial<VolumeAnalysis> = {}): VolumeAnalysis {
  return {
    volumeTrend: 'increasing',
    volumeRatio: 1.2,
    obv: 5000000,
    accumulationDistribution: 'accumulation',
    signals: [],
    ...overrides,
  };
}

describe('TimeframeRecommender', () => {
  it('should recommend scalping for very high volatility (ATR% > 5%)', () => {
    // Use values that don't push strategy longer: low ADX, RSI not in neutral, flat MACD
    const confluence = makeConfluence({ entryPrice: 100, confluenceScore: 30 });
    const technical = makeTechnical({ atr: 8, adx: 10, rsi: 75, macd: { value: 0, signal: 0, histogram: 0.1 } });
    const result = generateTimeframeRecommendation(confluence, technical, null, null, null, null, null);
    expect(result.strategy).toBe('scalping');
    expect(result.strategyLabel).toBe('Scalping');
    expect(result.suggestedTimeframes).toEqual(['1m', '5m', '15m']);
    expect(result.reasoning.length).toBeGreaterThan(0);
  });

  it('should recommend intraday for medium-high volatility (ATR% 3-5%)', () => {
    // Use balanced values that don't shift the base strategy
    const confluence = makeConfluence({ entryPrice: 100, confluenceScore: 50 });
    const technical = makeTechnical({ atr: 4, adx: 28, rsi: 65, macd: { value: 0, signal: 0, histogram: 0.5 } });
    const result = generateTimeframeRecommendation(confluence, technical, null, null, null, null, null);
    expect(result.strategy).toBe('intraday');
    expect(result.strategyLabel).toBe('Intradía');
    expect(result.suggestedTimeframes).toEqual(['15m', '1H', '4H']);
  });

  it('should recommend swing for moderate volatility (ATR% 1.2-3%)', () => {
    const confluence = makeConfluence({ entryPrice: 65000 });
    const technical = makeTechnical({ atr: 1300 }); // ~2% ATR
    const result = generateTimeframeRecommendation(confluence, technical, null, null, null, null, null);
    expect(result.strategy).toBe('swing');
    expect(result.strategyLabel).toBe('Swing Trade');
    expect(result.suggestedTimeframes).toEqual(['4H', '1D', '1W']);
  });

  it('should recommend position for low volatility (ATR% < 1.2%)', () => {
    const confluence = makeConfluence({ entryPrice: 50000 });
    const technical = makeTechnical({ atr: 400 }); // 0.8% ATR
    const result = generateTimeframeRecommendation(confluence, technical, null, null, null, null, null);
    expect(result.strategy).toBe('position');
    expect(result.strategyLabel).toBe('Posición');
    expect(result.suggestedTimeframes).toEqual(['1D', '1W', '1M']);
  });

  it('should shift strategy longer with strong ADX trend', () => {
    const confluence = makeConfluence({ entryPrice: 100, confluenceScore: 75 });
    // Without strong ADX → intraday (4% ATR)
    const techWeak = makeTechnical({ atr: 4, adx: 20 });
    const resultWeak = generateTimeframeRecommendation(confluence, techWeak, null, null, null, null, null);

    // With very strong ADX → should push towards longer timeframe
    const techStrong = makeTechnical({ atr: 4, adx: 55 });
    const resultStrong = generateTimeframeRecommendation(confluence, techStrong, null, null, null, null, null);

    // Strong ADX should shift strategy index higher (longer timeframe)
    const strategies = ['scalping', 'intraday', 'swing', 'position'];
    const weakIdx = strategies.indexOf(resultWeak.strategy);
    const strongIdx = strategies.indexOf(resultStrong.strategy);
    expect(strongIdx).toBeGreaterThanOrEqual(weakIdx);
  });

  it('should reduce duration with extreme RSI (overbought)', () => {
    const confluence = makeConfluence({ entryPrice: 100 });
    const techNeutral = makeTechnical({ atr: 4, rsi: 50 });
    const techOverbought = makeTechnical({ atr: 4, rsi: 85 });
    const resultNeutral = generateTimeframeRecommendation(confluence, techNeutral, null, null, null, null, null);
    const resultOverbought = generateTimeframeRecommendation(confluence, techOverbought, null, null, null, null, null);
    // Overbought RSI should have shorter duration
    expect(resultOverbought.estimatedDurationHours.max).toBeLessThanOrEqual(resultNeutral.estimatedDurationHours.max);
  });

  it('should include pattern reasoning for continuation patterns', () => {
    const confluence = makeConfluence({ entryPrice: 100 });
    const technical = makeTechnical({ atr: 4 });
    const patterns = makePattern({
      patterns: [{
        name: 'Three White Soldiers',
        type: 'bullish' as const,
        reliability: 80,
        index: 0,
        description: 'Strong bullish continuation',
      }],
    });
    const result = generateTimeframeRecommendation(confluence, technical, patterns, null, null, null, null);
    expect(result.reasoning.some(r => r.includes('continuación'))).toBe(true);
  });

  it('should include pattern reasoning for reversal patterns', () => {
    const confluence = makeConfluence({ entryPrice: 100 });
    const technical = makeTechnical({ atr: 4 });
    const patterns = makePattern({
      patterns: [{
        name: 'Evening Star',
        type: 'bearish' as const,
        reliability: 75,
        index: 0,
        description: 'Bearish reversal pattern',
      }],
    });
    const result = generateTimeframeRecommendation(confluence, technical, patterns, null, null, null, null);
    expect(result.reasoning.some(r => r.includes('reversión'))).toBe(true);
  });

  it('should include volume confirmation reasoning', () => {
    const confluence = makeConfluence({ entryPrice: 100, overallDirection: 'LONG' });
    const technical = makeTechnical({ atr: 4 });
    const volume = makeVolume({ volumeRatio: 2.5, accumulationDistribution: 'accumulation' });
    const result = generateTimeframeRecommendation(confluence, technical, null, volume, null, null, null);
    expect(result.reasoning.some(r => r.includes('Volumen alto') || r.includes('acumulación'))).toBe(true);
  });

  it('should set high conviction with high confluence and positive modifiers', () => {
    const confluence = makeConfluence({ entryPrice: 100, confluenceScore: 80 });
    const technical = makeTechnical({ atr: 2, adx: 50, rsi: 55 });
    const volume = makeVolume({ volumeRatio: 2.0, accumulationDistribution: 'accumulation' });
    const result = generateTimeframeRecommendation(confluence, technical, null, volume, null, null, null);
    expect(result.conviction).toBe('high');
    expect(result.convictionLabel).toBe('Alta');
  });

  it('should set low conviction with low confluence and negative modifiers', () => {
    const confluence = makeConfluence({ entryPrice: 100, confluenceScore: 25 });
    const technical = makeTechnical({ atr: 2, adx: 10, rsi: 85 });
    const result = generateTimeframeRecommendation(confluence, technical, null, null, null, null, null);
    expect(result.conviction).toBe('low');
    expect(result.convictionLabel).toBe('Baja');
  });

  it('should handle null technical analysis gracefully', () => {
    const confluence = makeConfluence({ entryPrice: 65000 });
    const result = generateTimeframeRecommendation(confluence, null, null, null, null, null, null);
    expect(result.strategy).toBeDefined();
    expect(result.estimatedDuration).toBeTruthy();
    expect(result.reasoning.length).toBeGreaterThan(0);
  });

  it('should include TP distance reasoning', () => {
    const confluence = makeConfluence({ entryPrice: 65000, takeProfit: 69000 });
    const result = generateTimeframeRecommendation(confluence, null, null, null, null, null, null);
    expect(result.reasoning.some(r => r.includes('Distancia al TP'))).toBe(true);
  });
});
