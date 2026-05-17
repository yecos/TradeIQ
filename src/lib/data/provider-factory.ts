import { SmartProvider } from './smart-provider';

/**
 * Provider Factory — creates the appropriate market data provider.
 *
 * Strategy:
 * - SmartProvider is the default (routes requests to best source)
 * - Crypto → CoinGecko (primary) → Binance (secondary) → Mock
 * - Stocks → Finnhub (primary, if key set) → Polygon (if key set) → Mock
 * - Forex → Finnhub (if key set) → Mock
 * - Mock is always the fallback
 *
 * New providers added in this update:
 * - Finnhub: FREE stocks, forex, crypto, news, sentiment, calendar (60 req/min)
 * - Alpaca WS: FREE stock WebSocket streaming (IEX feed)
 * - Kraken WS: FREE crypto order book WebSocket (Level 2)
 * - FRED: FREE macro/economic data (120 req/min, 840K+ series)
 *
 * API Keys (all FREE):
 * - FINNHUB_API_KEY: Register at https://finnhub.io/register
 * - POLYGON_API_KEY: Register at https://polygon.io/
 * - FRED_API_KEY: Register at https://fred.stlouisfed.org/docs/api/api_key.html
 * - ALPACA_API_KEY + ALPACA_API_SECRET: Register at https://app.alpaca.markets/signup
 */

let providerInstance: SmartProvider | null = null;
let fallbackToMock = false;

export function getMarketDataProvider(): SmartProvider {
  if (providerInstance && !fallbackToMock) return providerInstance;

  const polygonApiKey = process.env.POLYGON_API_KEY;
  const finnhubApiKey = process.env.FINNHUB_API_KEY;

  providerInstance = new SmartProvider(polygonApiKey || undefined, finnhubApiKey || undefined);

  const activeProviders = providerInstance.getActiveProviders().filter(p => p !== 'mock');
  if (activeProviders.length > 0) {
    console.warn(`[TradeIQ] SmartProvider active: ${activeProviders.join(' + ')} + Mock (fallback)`);
  } else {
    console.warn(`[TradeIQ] SmartProvider active: Mock only. Set FINNHUB_API_KEY and/or POLYGON_API_KEY for real data.`);
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
  if (provider.hasFinnhub()) parts.push('finnhub');
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
export { BinanceProvider, isCryptoSymbol } from './binance-provider';
export { CoinGeckoProvider } from './coingecko-provider';
export { FinnhubProvider } from './finnhub-provider';
export { FREDProvider } from './fred-provider';
export { MockProvider } from './mock-provider';
export { PolygonProvider } from './polygon-provider';
