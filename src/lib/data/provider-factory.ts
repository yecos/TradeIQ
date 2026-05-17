import type { MarketDataProvider } from './market-data-interface';
import { DataCache } from './market-data-interface';
import { MockProvider } from './mock-provider';
import { PolygonProvider } from './polygon-provider';

/**
 * Provider Factory — selects the appropriate market data provider.
 *
 * Selection logic:
 * 1. If POLYGON_API_KEY is set → PolygonProvider (real data)
 * 2. Otherwise → MockProvider (simulated data)
 *
 * The factory uses a singleton pattern to avoid creating multiple instances.
 * Each provider gets its own DataCache instance.
 */

let providerInstance: MarketDataProvider | null = null;

export function getMarketDataProvider(): MarketDataProvider {
  if (providerInstance) return providerInstance;

  const polygonApiKey = process.env.POLYGON_API_KEY;

  if (polygonApiKey && polygonApiKey.length > 0) {
    const cache = new DataCache(60_000); // Default 60s TTL
    providerInstance = new PolygonProvider(polygonApiKey, cache);
    console.warn(`[TradeIQ] Using Polygon.io provider (real market data)`);
  } else {
    providerInstance = new MockProvider();
    console.warn(`[TradeIQ] Using Mock provider (simulated data). Set POLYGON_API_KEY for real data.`);
  }

  return providerInstance;
}

/**
 * Reset the provider singleton — useful for testing or when API key changes.
 */
export function resetProvider(): void {
  providerInstance = null;
}

/**
 * Check if real market data is available (Polygon API key configured).
 */
export function isRealDataAvailable(): boolean {
  const apiKey = process.env.POLYGON_API_KEY;
  return Boolean(apiKey && apiKey.length > 0);
}

/**
 * Get the name of the current provider for display purposes.
 */
export function getProviderName(): string {
  return getMarketDataProvider().name;
}
