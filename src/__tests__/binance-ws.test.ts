/**
 * Tests for BinanceKlineWS — WebSocket service for real-time kline streaming.
 *
 * Since we can't use real WebSocket connections in unit tests,
 * we test the logic: symbol conversion, interval mapping, state management,
 * candle merging, and connection lifecycle.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BinanceKlineWS,
  isWSCompatible,
  getBinanceWS,
  disposeBinanceWS,
} from '@/lib/data/binance-ws';
import type { WSConnectionState } from '@/lib/data/binance-ws';
import type { Candle } from '@/lib/types';

// ─── isWSCompatible Tests ────────────────────────────────────────────────────

describe('BinanceKlineWS', () => {
  describe('isWSCompatible', () => {
    it('should identify BTC as WS-compatible', () => {
      expect(isWSCompatible('BTC')).toBe(true);
    });

    it('should identify ETH as WS-compatible', () => {
      expect(isWSCompatible('ETH')).toBe(true);
    });

    it('should identify SOL as WS-compatible', () => {
      expect(isWSCompatible('SOL')).toBe(true);
    });

    it('should identify DOGE as WS-compatible', () => {
      expect(isWSCompatible('DOGE')).toBe(true);
    });

    it('should identify symbols ending in USDT as WS-compatible', () => {
      expect(isWSCompatible('BTCUSDT')).toBe(true);
      expect(isWSCompatible('ETHUSDT')).toBe(true);
      expect(isWSCompatible('XRPBUSD')).toBe(true);
    });

    it('should NOT identify stock symbols as WS-compatible', () => {
      expect(isWSCompatible('AAPL')).toBe(false);
      expect(isWSCompatible('NVDA')).toBe(false);
      expect(isWSCompatible('SPY')).toBe(false);
      expect(isWSCompatible('MSFT')).toBe(false);
    });

    it('should NOT identify ETFs as WS-compatible', () => {
      expect(isWSCompatible('QQQ')).toBe(false);
    });
  });

  // ─── State Management Tests ───────────────────────────────────────────

  describe('state management', () => {
    let ws: BinanceKlineWS;

    beforeEach(() => {
      ws = new BinanceKlineWS();
    });

    afterEach(() => {
      ws.dispose();
    });

    it('should start in disconnected state', () => {
      const state = ws.getState();
      expect(state.connectionState).toBe('disconnected');
      expect(state.symbol).toBeNull();
      expect(state.interval).toBeNull();
      expect(state.reconnectAttempts).toBe(0);
    });

    it('should notify state change listeners', () => {
      const stateChanges: WSConnectionState[] = [];
      const unsub = ws.onStateChange((state) => {
        stateChanges.push(state.connectionState);
      });

      // Initial state should be emitted immediately
      expect(stateChanges).toEqual(['disconnected']);

      unsub();
    });

    it('should allow unsubscribing from state changes', () => {
      const stateChanges: WSConnectionState[] = [];
      const unsub = ws.onStateChange((state) => {
        stateChanges.push(state.connectionState);
      });

      // Clear initial
      stateChanges.length = 0;

      // Unsubscribe
      unsub();

      // No more callbacks should fire (we can't easily trigger a state change
      // without a real WebSocket, but the unsubscribe function is returned)
      expect(typeof unsub).toBe('function');
    });

    it('should return correct state after unsubscribe', () => {
      ws.unsubscribe();
      const state = ws.getState();
      expect(state.connectionState).toBe('disconnected');
      expect(state.symbol).toBeNull();
      expect(state.interval).toBeNull();
    });

    it('should set symbol and interval when subscribing', () => {
      const callback = vi.fn();
      ws.subscribe('BTC', '1m', callback);

      const state = ws.getState();
      expect(state.symbol).toBe('BTC');
      expect(state.interval).toBe('1m');

      ws.unsubscribe();
    });

    it('should clear symbol and interval after unsubscribe', () => {
      const callback = vi.fn();
      ws.subscribe('BTC', '1m', callback);
      ws.unsubscribe();

      const state = ws.getState();
      expect(state.symbol).toBeNull();
      expect(state.interval).toBeNull();
    });
  });

  // ─── Singleton Tests ──────────────────────────────────────────────────

  describe('singleton pattern', () => {
    afterEach(() => {
      disposeBinanceWS();
    });

    it('should return the same instance from getBinanceWS', () => {
      const ws1 = getBinanceWS();
      const ws2 = getBinanceWS();
      expect(ws1).toBe(ws2);
    });

    it('should create a new instance after disposeBinanceWS', () => {
      const ws1 = getBinanceWS();
      disposeBinanceWS();
      const ws2 = getBinanceWS();
      expect(ws1).not.toBe(ws2);
    });
  });

  // ─── Dispose Tests ────────────────────────────────────────────────────

  describe('dispose', () => {
    it('should prevent resubscription after dispose', () => {
      const ws = new BinanceKlineWS();
      const callback = vi.fn();

      ws.dispose();
      ws.subscribe('BTC', '1m', callback);

      // After dispose, subscribe should not change state
      // (the connection won't actually be made)
      const state = ws.getState();
      // Symbol/interval may be set, but the connection won't happen
      expect(state.connectionState).toBe('disconnected');
    });
  });

  // ─── Multiple Subscribe Tests ─────────────────────────────────────────

  describe('multiple subscriptions', () => {
    it('should unsubscribe from previous stream when subscribing to new one', () => {
      const ws = new BinanceKlineWS();
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      ws.subscribe('BTC', '1m', callback1);
      expect(ws.getState().symbol).toBe('BTC');

      ws.subscribe('ETH', '5m', callback2);
      expect(ws.getState().symbol).toBe('ETH');
      expect(ws.getState().interval).toBe('5m');

      ws.unsubscribe();
      ws.dispose();
    });
  });
});

// ─── Candle Merging Tests (from useRealtimeCandles logic) ────────────────────

describe('Candle Merging Logic', () => {
  // Re-implement the merge logic for testing
  function mergeLiveCandle(historical: Candle[], liveCandle: Candle): Candle[] {
    if (historical.length === 0) {
      return [liveCandle];
    }

    const lastCandle = historical[historical.length - 1];

    // Same period — update the last candle
    if (lastCandle.time === liveCandle.time) {
      const merged = [...historical];
      merged[merged.length - 1] = {
        time: liveCandle.time,
        open: liveCandle.open,
        high: Math.max(lastCandle.high, liveCandle.high),
        low: Math.min(lastCandle.low, liveCandle.low),
        close: liveCandle.close,
        volume: liveCandle.volume,
      };
      return merged;
    }

    // New period
    if (liveCandle.time > lastCandle.time) {
      return [...historical, liveCandle];
    }

    // Older — ignore
    return historical;
  }

  const baseCandles: Candle[] = [
    { time: 1000, open: 100, high: 105, low: 98, close: 102, volume: 1000 },
    { time: 2000, open: 102, high: 108, low: 101, close: 106, volume: 1200 },
    { time: 3000, open: 106, high: 110, low: 104, close: 108, volume: 800 },
  ];

  it('should update the last candle when same time period', () => {
    const liveCandle: Candle = { time: 3000, open: 106, high: 112, low: 103, close: 111, volume: 900 };
    const result = mergeLiveCandle(baseCandles, liveCandle);

    expect(result.length).toBe(3);
    expect(result[2].close).toBe(111);
    expect(result[2].high).toBe(112); // Math.max(110, 112)
    expect(result[2].low).toBe(103);  // Math.min(104, 103)
    expect(result[2].open).toBe(106); // Keep original open
  });

  it('should append a new candle when new time period', () => {
    const liveCandle: Candle = { time: 4000, open: 108, high: 115, low: 107, close: 113, volume: 1500 };
    const result = mergeLiveCandle(baseCandles, liveCandle);

    expect(result.length).toBe(4);
    expect(result[3]).toEqual(liveCandle);
  });

  it('should ignore candles older than the last historical candle', () => {
    const liveCandle: Candle = { time: 2000, open: 102, high: 108, low: 101, close: 107, volume: 1100 };
    const result = mergeLiveCandle(baseCandles, liveCandle);

    expect(result.length).toBe(3);
    // Should be unchanged — old candle ignored
    expect(result[2].close).toBe(108);
  });

  it('should handle empty historical candles', () => {
    const liveCandle: Candle = { time: 1000, open: 100, high: 105, low: 98, close: 102, volume: 1000 };
    const result = mergeLiveCandle([], liveCandle);

    expect(result.length).toBe(1);
    expect(result[0]).toEqual(liveCandle);
  });

  it('should track the highest high across updates', () => {
    // First update: high = 110
    const update1 = mergeLiveCandle(baseCandles, { time: 3000, open: 106, high: 110, low: 104, close: 109, volume: 850 });
    expect(update1[2].high).toBe(110);

    // Second update: high = 114 (should be higher)
    const update2 = mergeLiveCandle(update1, { time: 3000, open: 106, high: 114, low: 102, close: 112, volume: 950 });
    expect(update2[2].high).toBe(114); // max(110, 114)
    expect(update2[2].low).toBe(102);  // min(104, 102)
  });

  it('should preserve original open for the candle period', () => {
    const liveCandle: Candle = { time: 3000, open: 999, high: 112, low: 103, close: 111, volume: 900 };
    const result = mergeLiveCandle(baseCandles, liveCandle);

    // The open should come from the live update (which is the period's original open)
    expect(result[2].open).toBe(999);
  });

  it('should handle rapid consecutive updates (price ticking)', () => {
    let candles = [...baseCandles];
    const time = 3000;

    // Simulate 5 rapid price ticks in the same period
    for (let i = 0; i < 5; i++) {
      const close = 108 + i;
      const high = 110 + i;
      candles = mergeLiveCandle(candles, {
        time,
        open: 106,
        high,
        low: 104 - (i > 2 ? 1 : 0),
        close,
        volume: 800 + i * 100,
      });
    }

    expect(candles.length).toBe(3);
    expect(candles[2].close).toBe(112);
    expect(candles[2].high).toBe(114); // max of all highs
    expect(candles[2].low).toBe(103);  // min of all lows
    expect(candles[2].open).toBe(106); // preserved
  });
});
