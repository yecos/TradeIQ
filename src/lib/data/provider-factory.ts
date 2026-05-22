import { SmartProvider } from './smart-provider';

/**
 * Provider Factory — creates the appropriate market data provider.
 *
 * Strategy:
 * - SmartProvider is the default (routes requests to best source)
 * - Crypto → CoinGecko (primary) → Binance (secondary) → Mock
 * - Stocks → Alpaca (primary, if keys set — real-time bars + broker) → Finnhub → TwelveData → Polygon → Mock
 * - Forex → Finnhub (if key set) → TwelveData → Mock
 * - Indices → TwelveData (if key set) → Finnhub → Mock
 * - Mock is always the fallback
 *
 * Providers:
 * - Alpaca: FREE IEX stock data (real-time WS + REST bars) + broker (200 req/min)
 * - Finnhub: FREE stocks, forex, crypto, news, sentiment, calendar (60 req/min)
 * - Twelve Data: FREE stocks, forex, crypto, indices (800 credits/day, 8/min)
 * - Polygon: FREE tier stocks (5 req/min)
 * - Kraken WS: FREE crypto order book WebSocket (Level 2)
 * - FRED: FREE macro/economic data (120 req/min, 840K+ series)
 *
 * API Keys (all FREE):
 * - ALPACA_API_KEY + ALPACA_API_SECRET: Register at https://app.alpaca.markets/signup
 * - FINNHUB_API_KEY: Register at https://finnhub.io/register
 * - TWELVEDATA_API_KEY: Register at https://twelvedata.com/pricing
 * - POLYGON_API_KEY: Register at https://polygon.io/
 * - FRED_API_KEY: Register at https://fred.stlouisfed.org/docs/api/api_key.html
 */

let providerInstance: SmartProvider | null = null;
let fallbackToMock = false;

export function getMarketDataProvider(): SmartProvider {
  if (providerInstance && !fallbackToMock) return providerInstance;

  const polygonApiKey = process.env.POLYGON_API_KEY;
  const finnhubApiKey = process.env.FINNHUB_API_KEY || process.env.NEXT_PUBLIC_FINNHUB_KEY;
  const twelvedataApiKey = process.env.TWELVEDATA_API_KEY || process.env.NEXT_PUBLIC_TWELVEDATA_KEY;
  // Server-side: use NEXT_PUBLIC_ vars (same keys, also accessible server-side)
  // or dedicated server-only ALPACA_API_KEY / ALPACA_API_SECRET if set
  const alpacaApiKey = process.env.ALPACA_API_KEY || process.env.NEXT_PUBLIC_ALPACA_API_KEY;
  const alpacaApiSecret = process.env.ALPACA_API_SECRET || process.env.NEXT_PUBLIC_ALPACA_API_SECRET;

  providerInstance = new SmartProvider(
    polygonApiKey || undefined,
    finnhubApiKey || undefined,
    alpacaApiKey || undefined,
    alpacaApiSecret || undefined,
    twelvedataApiKey || undefined,
  );

  const activeProviders = providerInstance.getActiveProviders().filter(p => p !== 'mock');
  if (activeProviders.length > 0) {
    console.warn(`[TradeIQ] SmartProvider active: ${activeProviders.join(' + ')} + Mock (fallback)`);
  } else {
    console.warn(`[TradeIQ] SmartProvider active: Mock only. Set ALPACA_API_KEY, FINNHUB_API_KEY, TWELVEDATA_API_KEY and/or POLYGON_API_KEY for real data.`);
  }

  return providerInstance;
}

/**
 * Fallback to mock provider — called when APIs fail repeatedly.
 */
export function enableFallback(): void {
  if (!fallbackToMock) {
    console.warn('[TradeIQ] APIs failed, falling back to Mock provider');
    fallbackToMock = true;
  }
}

/**
 * Check if currently in fallback mode.
 */
export function isFallbackActive(): boolean {
  return fallbackToMock;
}

/**
 * Reset the provider singleton — useful for testing or when API key changes.
 */
export function resetProvider(): void {
  providerInstance = null;
  fallbackToMock = false;
}

/**
 * Check if real market data is available.
 */
export function isRealDataAvailable(): boolean {
  return !fallbackToMock;
}

/**
 * Get the name of the current provider for display purposes.
 */
export function getProviderName(): string {
  if (fallbackToMock) return 'mock';
  const provider = getMarketDataProvider();
  const parts = [];
  if (provider.hasAlpaca()) parts.push('alpaca');
  if (provider.hasFinnhub()) parts.push('finnhub');
  if (provider.hasTwelveData()) parts.push('twelvedata');
  if (provider.hasPolygon()) parts.push('polygon');
  return parts.length > 0 ? `smart+${parts.join('+')}` : 'smart';
}

/**
 * Get list of active providers for the UI.
 */
export function getActiveProviders(): string[] {
  if (fallbackToMock) return ['mock'];
  return getMarketDataProvider().getActiveProviders();
}

// Re-export for direct usage
export { SmartProvider } from './smart-provider';
export { AlpacaProvider } from './alpaca-provider';
export { BinanceProvider, isCryptoSymbol } from './binance-provider';
export { CoinGeckoProvider } from './coingecko-provider';
export { FinnhubProvider } from './finnhub-provider';
export { FREDProvider } from './fred-provider';
export { MockProvider } from './mock-provider';
export { PolygonProvider } from './polygon-provider';
export { TwelveDataProvider } from './twelvedata-provider';
