import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { getMarketDataProvider, resetProvider, isRealDataAvailable, getProviderName } from '@/lib/data/provider-factory';
import { SmartProvider } from '@/lib/data/smart-provider';

describe('Provider Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetProvider();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('without POLYGON_API_KEY', () => {
    it('should return SmartProvider when no API key is set', () => {
      delete process.env.POLYGON_API_KEY;

      const provider = getMarketDataProvider();
      expect(provider).toBeInstanceOf(SmartProvider);
    });

    it('should report SmartProvider without Polygon key', () => {
      delete process.env.POLYGON_API_KEY;

      const provider = getMarketDataProvider();
      expect(provider.hasPolygon()).toBe(false);
    });

    it('should report real data as available (Binance is free)', () => {
      delete process.env.POLYGON_API_KEY;

      // Binance is always real, so isRealDataAvailable is true
      expect(isRealDataAvailable()).toBe(true);
    });

    it('should return "smart" as provider name without Polygon', () => {
      delete process.env.POLYGON_API_KEY;

      expect(getProviderName()).toBe('smart');
    });
  });

  describe('with POLYGON_API_KEY', () => {
    it('should return SmartProvider with Polygon enabled', () => {
      process.env.POLYGON_API_KEY = 'test_api_key_123';

      const provider = getMarketDataProvider();
      expect(provider).toBeInstanceOf(SmartProvider);
      expect(provider.hasPolygon()).toBe(true);
    });

    it('should report real data as available', () => {
      process.env.POLYGON_API_KEY = 'test_api_key_123';

      expect(isRealDataAvailable()).toBe(true);
    });

    it('should return "smart+polygon" as provider name', () => {
      process.env.POLYGON_API_KEY = 'test_api_key_123';

      expect(getProviderName()).toBe('smart+polygon');
    });
  });

  describe('singleton behavior', () => {
    it('should return the same instance on multiple calls', () => {
      delete process.env.POLYGON_API_KEY;

      const provider1 = getMarketDataProvider();
      const provider2 = getMarketDataProvider();

      expect(provider1).toBe(provider2);
    });

    it('should create a new instance after reset', () => {
      delete process.env.POLYGON_API_KEY;

      const provider1 = getMarketDataProvider();
      resetProvider();
      const provider2 = getMarketDataProvider();

      // Different instances
      expect(provider1).not.toBe(provider2);
    });
  });
});
