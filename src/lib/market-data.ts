/**
 * Market Data — thin wrapper that delegates to the appropriate provider.
 *
 * This module maintains the same public API as before (getCandles, getQuote,
 * getMultipleQuotes) but now delegates to either MockProvider or PolygonProvider
 * based on whether POLYGON_API_KEY is configured.
 *
 * Zero breaking changes — all existing code that imports from this module
 * continues to work exactly the same.
 */

import type { Candle, Quote } from './types';
import { getMarketDataProvider } from './data/provider-factory';

export async function getCandles(symbol: string, days: number = 180): Promise<Candle[]> {
  const provider = getMarketDataProvider();
  return provider.getCandles(symbol, days);
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
export { getProviderName, isRealDataAvailable, isFallbackActive } from './data/provider-factory';
export type { MarketDataProvider, SymbolInfo } from './data/market-data-interface';
