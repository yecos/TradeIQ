/**
 * Market Data — thin wrapper that delegates to the SmartProvider.
 *
 * The SmartProvider automatically routes:
 * - Crypto symbols (BTC, ETH, etc.) → Binance (free, real-time)
 * - Stock symbols (AAPL, NVDA, etc.) → Polygon (if API key) or Mock
 * - Fallback → Mock for any failures
 *
 * Zero breaking changes — all existing code that imports from this module
 * continues to work exactly the same.
 */

import type { Candle, Quote } from './types';
import { getMarketDataProvider } from './data/provider-factory';

export async function getCandles(symbol: string, days: number = 180, interval: string = '1D'): Promise<Candle[]> {
  const provider = getMarketDataProvider();
  return provider.getCandles(symbol, days, interval);
}

export async function getQuote(symbol: string): Promise<Quote> {
  const provider = getMarketDataProvider();
  return provider.getQuote(symbol);
}

export async function getMultipleQuotes(symbols: string[]): Promise<Quote[]> {
  const provider = getMarketDataProvider();
  return provider.getMultipleQuotes(symbols);
}

// Re-export provider utilities for components that need them
export { getProviderName, isRealDataAvailable, isFallbackActive, getActiveProviders } from './data/provider-factory';
export { isCryptoSymbol } from './data/binance-provider';
export type { MarketDataProvider, SymbolInfo } from './data/market-data-interface';
