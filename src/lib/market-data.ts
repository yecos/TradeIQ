import type { Candle, Quote } from './types';

// Generate realistic mock data for demo (in production, replace with real API calls)
// We use this because we can't access Yahoo Finance API from the sandbox

function generateRealisticCandles(symbol: string, days: number = 180): Candle[] {
  const seeds: Record<string, { base: number; vol: number; trend: number }> = {
    'AAPL': { base: 195, vol: 3.5, trend: 0.08 },
    'NVDA': { base: 880, vol: 18, trend: 0.15 },
    'MSFT': { base: 420, vol: 5, trend: 0.06 },
    'GOOGL': { base: 175, vol: 3, trend: 0.07 },
    'AMZN': { base: 185, vol: 4, trend: 0.09 },
    'TSLA': { base: 245, vol: 12, trend: 0.12 },
    'META': { base: 505, vol: 8, trend: 0.1 },
    'SPY': { base: 520, vol: 4, trend: 0.04 },
    'QQQ': { base: 445, vol: 4.5, trend: 0.06 },
    'AMD': { base: 165, vol: 5, trend: 0.11 },
  };

  const seed = seeds[symbol] || { base: 100 + Math.random() * 200, vol: 5, trend: 0.05 };
  const candles: Candle[] = [];
  let price = seed.base;
  const now = Math.floor(Date.now() / 1000);
  const daySeconds = 86400;

  // Simple seeded random for consistency per symbol
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
  const names: Record<string, string> = {
    'AAPL': 'Apple Inc.',
    'NVDA': 'NVIDIA Corporation',
    'MSFT': 'Microsoft Corporation',
    'GOOGL': 'Alphabet Inc.',
    'AMZN': 'Amazon.com Inc.',
    'TSLA': 'Tesla Inc.',
    'META': 'Meta Platforms Inc.',
    'SPY': 'S&P 500 ETF',
    'QQQ': 'Nasdaq 100 ETF',
    'AMD': 'Advanced Micro Devices',
  };

  const candles = generateRealisticCandles(symbol, 2);
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const change = current.close - prev.close;
  const changePercent = (change / prev.close) * 100;

  return {
    symbol,
    name: names[symbol] || symbol,
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

export async function getCandles(symbol: string, days: number = 180): Promise<Candle[]> {
  // In production, this would call a real API like:
  // const response = await fetch(`https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate}/${endDate}?apiKey=${apiKey}`);
  return generateRealisticCandles(symbol, days);
}

export async function getQuote(symbol: string): Promise<Quote> {
  return generateQuote(symbol);
}

export async function getMultipleQuotes(symbols: string[]): Promise<Quote[]> {
  return symbols.map(s => generateQuote(s));
}
