import type { Candle, Quote } from '../types';
import type { MarketDataProvider, SymbolInfo } from './market-data-interface';

/**
 * Mock Market Data Provider — generates realistic simulated data.
 * Used in development and as fallback when no real API key is configured.
 */
export class MockProvider implements MarketDataProvider {
  readonly name = 'mock';

  private static readonly SYMBOL_SEEDS: Record<string, { base: number; vol: number; trend: number; name: string }> = {
    'AAPL': { base: 195, vol: 3.5, trend: 0.08, name: 'Apple Inc.' },
    'NVDA': { base: 880, vol: 18, trend: 0.15, name: 'NVIDIA Corporation' },
    'MSFT': { base: 420, vol: 5, trend: 0.06, name: 'Microsoft Corporation' },
    'GOOGL': { base: 175, vol: 3, trend: 0.07, name: 'Alphabet Inc.' },
    'AMZN': { base: 185, vol: 4, trend: 0.09, name: 'Amazon.com Inc.' },
    'TSLA': { base: 245, vol: 12, trend: 0.12, name: 'Tesla Inc.' },
    'META': { base: 505, vol: 8, trend: 0.1, name: 'Meta Platforms Inc.' },
    'SPY': { base: 520, vol: 4, trend: 0.04, name: 'S&P 500 ETF' },
    'QQQ': { base: 445, vol: 4.5, trend: 0.06, name: 'Nasdaq 100 ETF' },
    'AMD': { base: 165, vol: 5, trend: 0.11, name: 'Advanced Micro Devices' },
  };

  async getCandles(symbol: string, days: number = 180): Promise<Candle[]> {
    return generateRealisticCandles(symbol, days);
  }

  async getQuote(symbol: string): Promise<Quote> {
    return generateQuote(symbol);
  }

  async getMultipleQuotes(symbols: string[]): Promise<Quote[]> {
    return symbols.map(s => generateQuote(s));
  }

  async searchSymbols(query: string): Promise<SymbolInfo[]> {
    const upper = query.toUpperCase();
    const results: SymbolInfo[] = [];

    for (const [symbol, seed] of Object.entries(MockProvider.SYMBOL_SEEDS)) {
      if (symbol.includes(upper) || seed.name.toUpperCase().includes(upper)) {
        results.push({
          symbol,
          name: seed.name,
          type: symbol === 'SPY' || symbol === 'QQQ' ? 'etf' : 'stock',
          exchange: 'US',
          currency: 'USD',
        });
      }
    }

    return results;
  }
}

// --- Internal generation functions (moved from market-data.ts) ---

function generateRealisticCandles(symbol: string, days: number = 180): Candle[] {
  const seeds = MockProvider.SYMBOL_SEEDS;
  const seed = seeds[symbol] || { base: 100 + Math.random() * 200, vol: 5, trend: 0.05, name: symbol };
  const candles: Candle[] = [];
  let price = seed.base;
  const now = Math.floor(Date.now() / 1000);
  const daySeconds = 86400;

  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = ((hash << 5) - hash) + symbol.charCodeAt(i);
    hash |= 0;
  }
  const seededRandom = () => {
    hash = (hash * 16807 + 0) % 2147483647;
    return (hash & 0x7fffffff) / 0x7fffffff;
  };

  for (let i = days; i >= 0; i--) {
    const time = now - (i * daySeconds);
    const dailyReturn = (seededRandom() - 0.48) * seed.vol / seed.base + seed.trend / 252;
    const open = price;
    const close = price * (1 + dailyReturn);
    const highExtra = Math.abs(seededRandom() * seed.vol * 0.5);
    const lowExtra = Math.abs(seededRandom() * seed.vol * 0.5);
    const high = Math.max(open, close) + highExtra;
    const low = Math.min(open, close) - lowExtra;
    const volume = Math.floor(50_000_000 + seededRandom() * 100_000_000);

    candles.push({
      time,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
    });

    price = close;
  }

  return candles;
}

function generateQuote(symbol: string): Quote {
  const seeds = MockProvider.SYMBOL_SEEDS;
  const name = seeds[symbol]?.name || symbol;

  const candles = generateRealisticCandles(symbol, 2);
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const change = current.close - prev.close;
  const changePercent = (change / prev.close) * 100;

  return {
    symbol,
    name,
    price: current.close,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    volume: current.volume,
    high: current.high,
    low: current.low,
    open: current.open,
    prevClose: prev.close,
  };
}
