import { describe, it, expect } from 'vitest';
import { BinanceProvider, isCryptoSymbol } from '@/lib/data/binance-provider';

describe('BinanceProvider', () => {
  describe('isCryptoSymbol', () => {
    it('should identify BTC as crypto', () => {
      expect(isCryptoSymbol('BTC')).toBe(true);
    });

    it('should identify ETH as crypto', () => {
      expect(isCryptoSymbol('ETH')).toBe(true);
    });

    it('should identify SOL as crypto', () => {
      expect(isCryptoSymbol('SOL')).toBe(true);
    });

    it('should identify BTCUSDT as crypto', () => {
      expect(isCryptoSymbol('BTCUSDT')).toBe(true);
    });

    it('should NOT identify AAPL as crypto', () => {
      expect(isCryptoSymbol('AAPL')).toBe(false);
    });

    it('should NOT identify NVDA as crypto', () => {
      expect(isCryptoSymbol('NVDA')).toBe(false);
    });

    it('should NOT identify SPY as crypto', () => {
      expect(isCryptoSymbol('SPY')).toBe(false);
    });
  });

  describe('name', () => {
    it('should have name "binance"', () => {
      const provider = new BinanceProvider();
      expect(provider.name).toBe('binance');
    });
  });
});
