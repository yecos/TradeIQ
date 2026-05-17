import { SmartProvider } from './smart-provider';

/**
 * Provider Factory — creates the appropriate market data provider.
 *
 * Strategy:
 * - SmartProvider is now the default (routes crypto→Binance, stocks→Polygon/Mock)
 * - Binance is always free and available (no API key needed)
 * - Polygon is used for stocks if POLYGON_API_KEY is set
 * - Mock is always the fallback
 *
 * The factory uses a singleton pattern to avoid creating multiple instances.
 */

let providerInstance: SmartProvider | null = null;
let fallbackToMock = false;

export function getMarketDataProvider(): SmartProvider {
  if (providerInstance && !fallbackToMock) return providerInstance;

  const polygonApiKey = process.env.POLYGON_API_KEY;

  providerInstance = new SmartProvider(polygonApiKey || undefined);

  if (polygonApiKey && polygonApiKey.length > 0) {
    console.warn(`[TradeIQ] SmartProvider active: Binance (crypto) + Polygon (stocks) + Mock (fallback)`);
  } else {
    console.warn(`[TradeIQ] SmartProvider active: Binance (crypto) + Mock (stocks). Set POLYGON_API_KEY for real stock data.`);
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
 * Binance is always real (free), so this is true unless in fallback mode.
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
  return provider.hasPolygon() ? 'smart+polygon' : 'smart';
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
export { MockProvider } from './mock-provider';
export { PolygonProvider } from './polygon-provider';
