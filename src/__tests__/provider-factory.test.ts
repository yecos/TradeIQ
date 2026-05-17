import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getMarketDataProvider, resetProvider, isRealDataAvailable, getProviderName } from '@/lib/data/provider-factory';
import { MockProvider } from '@/lib/data/mock-provider';
import { PolygonProvider } from '@/lib/data/polygon-provider';

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
    it('should return MockProvider when no API key is set', () => {
      delete process.env.POLYGON_API_KEY;

      const provider = getMarketDataProvider();
      expect(provider).toBeInstanceOf(MockProvider);
    });

    it('should return MockProvider when API key is empty string', () => {
      process.env.POLYGON_API_KEY = '';

      const provider = getMarketDataProvider();
      expect(provider).toBeInstanceOf(MockProvider);
    });

    it('should report real data as not available', () => {
      delete process.env.POLYGON_API_KEY;

      expect(isRealDataAvailable()).toBe(false);
    });

    it('should return "mock" as provider name', () => {
      delete process.env.POLYGON_API_KEY;

      expect(getProviderName()).toBe('mock');
    });
  });

  describe('with POLYGON_API_KEY', () => {
    it('should return PolygonProvider when API key is set', () => {
      process.env.POLYGON_API_KEY = 'test_api_key_123';

      const provider = getMarketDataProvider();
      expect(provider).toBeInstanceOf(PolygonProvider);
    });

    it('should report real data as available', () => {
      process.env.POLYGON_API_KEY = 'test_api_key_123';

      expect(isRealDataAvailable()).toBe(true);
    });

    it('should return "polygon" as provider name', () => {
      process.env.POLYGON_API_KEY = 'test_api_key_123';

      expect(getProviderName()).toBe('polygon');
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

      // Different instances (both MockProvider, but different objects)
      expect(provider1).not.toBe(provider2);
    });
  });
});
