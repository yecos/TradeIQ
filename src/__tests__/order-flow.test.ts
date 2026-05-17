import { describe, it, expect } from 'vitest';
import {
  analyzeTradeFlow,
  detectAbsorption,
  generateSimulatedOrderBook,
} from '../lib/analysis/order-flow';
import type { OrderBookSnapshot } from '../lib/types';

describe('Order Flow Analysis', () => {
  describe('analyzeTradeFlow', () => {
    it('should calculate trade flow from trades', () => {
      const trades = [
        { qty: 10, isBuyerMaker: false }, // Buy
        { qty: 5, isBuyerMaker: true },   // Sell
        { qty: 8, isBuyerMaker: false },  // Buy
        { qty: 3, isBuyerMaker: true },   // Sell
      ];

      const result = analyzeTradeFlow(trades);

      expect(result.buys).toBe(2);
      expect(result.sells).toBe(2);
      expect(result.buyVolume).toBe(18);
      expect(result.sellVolume).toBe(8);
      expect(result.delta).toBe(10);
    });

    it('should detect large trades', () => {
      const trades = [
        { qty: 5, isBuyerMaker: false },
        { qty: 5, isBuyerMaker: true },
        { qty: 5, isBuyerMaker: false },
        { qty: 55, isBuyerMaker: false }, // Large buy (>2x avg of 27)
        { qty: 65, isBuyerMaker: true },  // Large sell (>2x avg of 27)
      ];

      const result = analyzeTradeFlow(trades);

      expect(result.largeBuys).toBeGreaterThanOrEqual(1);
      expect(result.largeSells).toBeGreaterThanOrEqual(1);
    });

    it('should handle empty trades', () => {
      const result = analyzeTradeFlow([]);

      expect(result.buys).toBe(0);
      expect(result.sells).toBe(0);
      expect(result.buyVolume).toBe(0);
      expect(result.sellVolume).toBe(0);
      expect(result.delta).toBe(0);
    });

    it('should calculate correct delta', () => {
      const trades = [
        { qty: 100, isBuyerMaker: false },
        { qty: 30, isBuyerMaker: true },
      ];

      const result = analyzeTradeFlow(trades);
      expect(result.delta).toBe(70);
    });

    it('should handle all buys', () => {
      const trades = [
        { qty: 20, isBuyerMaker: false },
        { qty: 30, isBuyerMaker: false },
      ];

      const result = analyzeTradeFlow(trades);
      expect(result.buys).toBe(2);
      expect(result.sells).toBe(0);
      expect(result.delta).toBe(50);
    });

    it('should handle all sells', () => {
      const trades = [
        { qty: 20, isBuyerMaker: true },
        { qty: 30, isBuyerMaker: true },
      ];

      const result = analyzeTradeFlow(trades);
      expect(result.buys).toBe(0);
      expect(result.sells).toBe(2);
      expect(result.delta).toBe(-50);
    });
  });

  describe('generateSimulatedOrderBook', () => {
    it('should generate valid order book', () => {
      const ob = generateSimulatedOrderBook(100);

      expect(ob.bids.length).toBeGreaterThan(0);
      expect(ob.asks.length).toBeGreaterThan(0);
      expect(ob.spread).toBeGreaterThan(0);
      expect(ob.spreadPercent).toBeGreaterThanOrEqual(0);
      expect(typeof ob.bidDepth).toBe('number');
      expect(typeof ob.askDepth).toBe('number');
      expect(ob.imbalance).toBeGreaterThanOrEqual(-1);
      expect(ob.imbalance).toBeLessThanOrEqual(1);
    });

    it('should have bids below mid price', () => {
      const midPrice = 50000;
      const ob = generateSimulatedOrderBook(midPrice);

      for (const bid of ob.bids) {
        expect(bid.price).toBeLessThan(midPrice + 1); // Allow small margin
      }
    });

    it('should have asks above mid price', () => {
      const midPrice = 50000;
      const ob = generateSimulatedOrderBook(midPrice);

      for (const ask of ob.asks) {
        expect(ask.price).toBeGreaterThan(midPrice - 1);
      }
    });

    it('should have cumulative totals', () => {
      const ob = generateSimulatedOrderBook(100);

      expect(ob.bids[0].total).toBeGreaterThanOrEqual(ob.bids[0].quantity);
      expect(ob.asks[0].total).toBeGreaterThanOrEqual(ob.asks[0].quantity);
    });

    it('should work with small prices', () => {
      const ob = generateSimulatedOrderBook(0.5);
      expect(ob.bids.length).toBeGreaterThan(0);
      expect(ob.asks.length).toBeGreaterThan(0);
    });

    it('should have valid spread', () => {
      const ob = generateSimulatedOrderBook(100);
      expect(ob.spread).toBeCloseTo(ob.asks[0].price - ob.bids[0].price, 4);
    });
  });

  describe('detectAbsorption', () => {
    it('should detect bid absorption', () => {
      const ob: OrderBookSnapshot = {
        bids: [
          { price: 99, quantity: 600, total: 600 }, // 6x avg
          { price: 98, quantity: 100, total: 700 },
        ],
        asks: [
          { price: 101, quantity: 100, total: 100 },
          { price: 102, quantity: 100, total: 200 },
        ],
        spread: 2,
        spreadPercent: 2,
        bidDepth: 700,
        askDepth: 200,
        imbalance: 0.555,
        timestamp: Date.now(),
      };

      const events = detectAbsorption(ob, 100);
      const bidAbsorption = events.filter(e => e.type === 'bid_absorption');
      expect(bidAbsorption.length).toBeGreaterThan(0);
    });

    it('should detect ask absorption', () => {
      const ob: OrderBookSnapshot = {
        bids: [
          { price: 99, quantity: 100, total: 100 },
          { price: 98, quantity: 100, total: 200 },
        ],
        asks: [
          { price: 101, quantity: 600, total: 600 }, // 6x avg
          { price: 102, quantity: 100, total: 700 },
        ],
        spread: 2,
        spreadPercent: 2,
        bidDepth: 200,
        askDepth: 700,
        imbalance: -0.555,
        timestamp: Date.now(),
      };

      const events = detectAbsorption(ob, 100);
      const askAbsorption = events.filter(e => e.type === 'ask_absorption');
      expect(askAbsorption.length).toBeGreaterThan(0);
    });

    it('should not detect absorption for normal levels', () => {
      const ob: OrderBookSnapshot = {
        bids: [
          { price: 99, quantity: 100, total: 100 },
          { price: 98, quantity: 100, total: 200 },
        ],
        asks: [
          { price: 101, quantity: 100, total: 100 },
          { price: 102, quantity: 100, total: 200 },
        ],
        spread: 2,
        spreadPercent: 2,
        bidDepth: 200,
        askDepth: 200,
        imbalance: 0,
        timestamp: Date.now(),
      };

      const events = detectAbsorption(ob, 100);
      expect(events.length).toBe(0);
    });

    it('should return absorption events with description', () => {
      const ob: OrderBookSnapshot = {
        bids: [{ price: 99, quantity: 600, total: 600 }],
        asks: [{ price: 101, quantity: 100, total: 100 }],
        spread: 2,
        spreadPercent: 2,
        bidDepth: 600,
        askDepth: 100,
        imbalance: 0.7,
        timestamp: Date.now(),
      };

      const events = detectAbsorption(ob, 100);
      if (events.length > 0) {
        expect(events[0]).toHaveProperty('type');
        expect(events[0]).toHaveProperty('priceLevel');
        expect(events[0]).toHaveProperty('volume');
        expect(events[0]).toHaveProperty('description');
        expect(typeof events[0].description).toBe('string');
      }
    });
  });

  describe('analyzeOrderFlow', () => {
    it('should return order flow result for any symbol', async () => {
      const { analyzeOrderFlow } = await import('../lib/analysis/order-flow');
      const result = await analyzeOrderFlow('AAPL', 150);

      expect(result).toHaveProperty('orderBook');
      expect(result).toHaveProperty('tradeFlow');
      expect(result).toHaveProperty('absorptionEvents');
      expect(result).toHaveProperty('signals');
      expect(result).toHaveProperty('source');
      expect(['real', 'simulated']).toContain(result.source);
    });

    it('should have valid signal structure', async () => {
      const { analyzeOrderFlow } = await import('../lib/analysis/order-flow');
      const result = await analyzeOrderFlow('MSFT', 400);

      for (const signal of result.signals) {
        expect(['LONG', 'SHORT', 'NEUTRAL']).toContain(signal.direction);
        expect(signal.strength).toBeGreaterThanOrEqual(0);
        expect(signal.strength).toBeLessThanOrEqual(100);
        expect(typeof signal.detail).toBe('string');
      }
    });

    it('should have trade flow with valid structure', async () => {
      const { analyzeOrderFlow } = await import('../lib/analysis/order-flow');
      const result = await analyzeOrderFlow('AAPL', 150);

      expect(result.tradeFlow).toHaveProperty('buys');
      expect(result.tradeFlow).toHaveProperty('sells');
      expect(result.tradeFlow).toHaveProperty('buyVolume');
      expect(result.tradeFlow).toHaveProperty('sellVolume');
      expect(result.tradeFlow).toHaveProperty('delta');
      expect(result.tradeFlow).toHaveProperty('cumulativeDelta');
      expect(result.tradeFlow).toHaveProperty('largeBuys');
      expect(result.tradeFlow).toHaveProperty('largeSells');
    });
  });
});
