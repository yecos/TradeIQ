import type { Candle, Quote } from '../types';
import type { MarketDataProvider, SymbolInfo } from './market-data-interface';

/**
 * Mock Market Data Provider — generates realistic simulated data.
 * Used in development and as fallback when no real API key is configured.
 */
export class MockProvider implements MarketDataProvider {
  readonly name = 'mock';

  static readonly SYMBOL_SEEDS: Record<string, { base: number; vol: number; trend: number; name: string; type?: string }> = {
    // Stocks
    'AAPL': { base: 195, vol: 3.5, trend: 0.08, name: 'Apple Inc.' },
    'NVDA': { base: 880, vol: 18, trend: 0.15, name: 'NVIDIA Corporation' },
    'MSFT': { base: 420, vol: 5, trend: 0.06, name: 'Microsoft Corporation' },
    'GOOGL': { base: 175, vol: 3, trend: 0.07, name: 'Alphabet Inc.' },
    'AMZN': { base: 185, vol: 4, trend: 0.09, name: 'Amazon.com Inc.' },
    'TSLA': { base: 245, vol: 12, trend: 0.12, name: 'Tesla Inc.' },
    'META': { base: 505, vol: 8, trend: 0.1, name: 'Meta Platforms Inc.' },
    'SPY': { base: 520, vol: 4, trend: 0.04, name: 'S&P 500 ETF', type: 'etf' },
    'QQQ': { base: 445, vol: 4.5, trend: 0.06, name: 'Nasdaq 100 ETF', type: 'etf' },
    'AMD': { base: 165, vol: 5, trend: 0.11, name: 'Advanced Micro Devices' },
    // Crypto
    'BTC': { base: 67000, vol: 1500, trend: 0.1, name: 'Bitcoin', type: 'crypto' },
    'ETH': { base: 3500, vol: 120, trend: 0.09, name: 'Ethereum', type: 'crypto' },
    'BNB': { base: 600, vol: 15, trend: 0.07, name: 'BNB', type: 'crypto' },
    'SOL': { base: 170, vol: 8, trend: 0.12, name: 'Solana', type: 'crypto' },
    'XRP': { base: 0.55, vol: 0.03, trend: 0.05, name: 'XRP', type: 'crypto' },
    'ADA': { base: 0.48, vol: 0.02, trend: 0.06, name: 'Cardano', type: 'crypto' },
    'DOGE': { base: 0.16, vol: 0.01, trend: 0.08, name: 'Dogecoin', type: 'crypto' },
    'AVAX': { base: 38, vol: 2, trend: 0.09, name: 'Avalanche', type: 'crypto' },
    'DOT': { base: 7.5, vol: 0.4, trend: 0.06, name: 'Polkadot', type: 'crypto' },
    'LINK': { base: 15, vol: 0.8, trend: 0.08, name: 'Chainlink', type: 'crypto' },
  };

  async getCandles(symbol: string, days: number = 180, interval: string = '1D'): Promise<Candle[]> {
    return generateRealisticCandles(symbol, days, interval);
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
          type: seed.type || 'stock',
          exchange: seed.type === 'crypto' ? 'Binance' : 'US',
          currency: seed.type === 'crypto' ? 'USDT' : 'USD',
        });
      }
    }

    return results;
  }
}

// --- Internal generation functions (moved from market-data.ts) ---

/**
 * Convert interval string to seconds.
 */
function intervalToSeconds(interval: string): number {
  const map: Record<string, number> = {
    '1m': 60,
    '5m': 300,
    '15m': 900,
    '1H': 3600,
    '4H': 14400,
    '1D': 86400,
    '1W': 604800,
  };
  return map[interval] || 86400;
}

/**
 * Generate realistic candles for any interval.
 *
 * FIX: Previously this function ignored the `interval` parameter and always
 * generated daily candles (86400s spacing). This broke intraday charts because
 * the chart would receive daily-spaced candles but display them on an intraday
 * scale, making the chart appear empty or with huge gaps.
 *
 * Now the function properly generates candles at the correct interval spacing:
 * - 1m: one candle per minute
 * - 5m: one candle per 5 minutes
 * - etc.
 *
 * The `days` parameter determines the total lookback period, and the interval
 * determines how many candles fit in that period.
 */
function generateRealisticCandles(symbol: string, days: number = 180, interval: string = '1D'): Candle[] {
  const seeds = MockProvider.SYMBOL_SEEDS;
  const seed = seeds[symbol] || { base: 100 + Math.random() * 200, vol: 5, trend: 0.05, name: symbol };
  const candles: Candle[] = [];
  let price = seed.base;
  const intervalSeconds = intervalToSeconds(interval);
  const daySeconds = 86400;

  // Calculate total number of candles based on interval and lookback period
  // For daily: days candles. For intraday: more candles per day.
  const candlesPerDay = daySeconds / intervalSeconds;
  // Cap at 500 candles to prevent OOM/timeout on serverless functions
  // (1440 1m candles × 6 fields × ~10 bytes = ~86KB JSON — too large for some deployments)
  const totalCandles = Math.min(Math.floor(days * candlesPerDay), 500);

  // CRITICAL FIX: Snap timestamps to interval boundaries.
  // Previously, `now - (i * intervalSeconds)` produced timestamps that didn't
  // align with interval boundaries (e.g., 1m candle starting at :34 instead of :00).
  // This caused lightweight-charts to display candles at wrong positions and
  // prevented the WS merge from matching candles correctly (WS sends boundary-aligned timestamps).
  const nowMs = Date.now();
  // Snap current time DOWN to the nearest interval boundary
  const currentBoundary = Math.floor(nowMs / (intervalSeconds * 1000)) * intervalSeconds;

  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = ((hash << 5) - hash) + symbol.charCodeAt(i);
    hash |= 0;
  }
  const seededRandom = () => {
    hash = (hash * 16807 + 0) % 2147483647;
    return (hash & 0x7fffffff) / 0x7fffffff;
  };

  // Scale volatility for intraday — daily volatility is too large for minute candles
  const volatilityScale = intervalSeconds >= daySeconds ? 1 : Math.sqrt(intervalSeconds / daySeconds);

  for (let i = totalCandles; i >= 0; i--) {
    const time = currentBoundary - (i * intervalSeconds);
    const periodReturn = (seededRandom() - 0.48) * (seed.vol / seed.base) * volatilityScale + (seed.trend / 252) * volatilityScale;
    const open = price;
    const close = price * (1 + periodReturn);
    const highExtra = Math.abs(seededRandom() * seed.vol * 0.3 * volatilityScale);
    const lowExtra = Math.abs(seededRandom() * seed.vol * 0.3 * volatilityScale);
    const high = Math.max(open, close) + highExtra;
    const low = Math.min(open, close) - lowExtra;
    // Scale volume proportionally for intraday
    const volumeScale = intervalSeconds >= daySeconds ? 1 : intervalSeconds / daySeconds;
    const volume = seed.type === 'crypto'
      ? Math.floor((1_000_000_000 + seededRandom() * 5_000_000_000) * volumeScale)
      : Math.floor((50_000_000 + seededRandom() * 100_000_000) * volumeScale);

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

  const candles = generateRealisticCandles(symbol, 2, '1D');
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
