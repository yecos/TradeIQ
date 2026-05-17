import { describe, it, expect, beforeEach } from 'vitest';
import { MockBroker } from '@/lib/broker/mock-broker';
import { getBroker, resetBroker, isRealBroker } from '@/lib/broker/broker-factory';
import type { OrderRequest, BrokerPosition } from '@/lib/broker/broker-interface';

describe('MockBroker', () => {
  let broker: MockBroker;

  beforeEach(() => {
    broker = new MockBroker();
  });

  // ─── Connection Test ───

  describe('testConnection', () => {
    it('should return connected=true for mock broker', async () => {
      const result = await broker.testConnection();
      expect(result.connected).toBe(true);
      expect(result.isPaper).toBe(true);
      expect(result.accountNumber).toBe('MOCK123456');
    });
  });

  // ─── Account ───

  describe('getAccount', () => {
    it('should return a valid account', async () => {
      const account = await broker.getAccount();
      expect(account.id).toBe('mock-account-001');
      expect(account.equity).toBe(100000);
      expect(account.cash).toBe(50000);
      expect(account.isPaper).toBe(true);
      expect(account.status).toBe('ACTIVE');
    });

    it('should return a copy (not mutable reference)', async () => {
      const account1 = await broker.getAccount();
      const account2 = await broker.getAccount();
      expect(account1).toEqual(account2);
      expect(account1).not.toBe(account2); // Different objects
    });
  });

  // ─── Positions ───

  describe('getPositions', () => {
    it('should return empty positions initially', async () => {
      const positions = await broker.getPositions();
      expect(positions).toEqual([]);
    });

    it('should return positions set via test helper', async () => {
      const testPositions: BrokerPosition[] = [{
        symbol: 'AAPL',
        qty: 10,
        side: 'long',
        avgEntryPrice: 150,
        currentPrice: 155,
        marketValue: 1550,
        unrealizedPnl: 50,
        unrealizedPnlPercent: 3.33,
        costBasis: 1500,
      }];
      broker.setPositions(testPositions);

      const positions = await broker.getPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].symbol).toBe('AAPL');
      expect(positions[0].qty).toBe(10);
    });
  });

  describe('getPosition', () => {
    it('should return null for non-existent position', async () => {
      const pos = await broker.getPosition('AAPL');
      expect(pos).toBeNull();
    });

    it('should return position for existing symbol', async () => {
      broker.setPositions([{
        symbol: 'BTC',
        qty: 0.5,
        side: 'long',
        avgEntryPrice: 40000,
        currentPrice: 45000,
        marketValue: 22500,
        unrealizedPnl: 2500,
        unrealizedPnlPercent: 12.5,
        costBasis: 20000,
      }]);

      const pos = await broker.getPosition('BTC');
      expect(pos).not.toBeNull();
      expect(pos?.symbol).toBe('BTC');
      expect(pos?.qty).toBe(0.5);
    });
  });

  // ─── Orders ───

  describe('submitOrder', () => {
    it('should create a new market order', async () => {
      const order: OrderRequest = {
        symbol: 'AAPL',
        side: 'buy',
        qty: 10,
        type: 'market',
      };

      const result = await broker.submitOrder(order);
      expect(result.symbol).toBe('AAPL');
      expect(result.side).toBe('buy');
      expect(result.qty).toBe(10);
      expect(result.type).toBe('market');
      expect(result.status).toBe('filled'); // Market orders fill immediately in mock
      expect(result.filledQty).toBe(10);
      expect(result.filledAvgPrice).toBeGreaterThan(0);
    });

    it('should create a limit order (not filled immediately)', async () => {
      const order: OrderRequest = {
        symbol: 'TSLA',
        side: 'buy',
        qty: 5,
        type: 'limit',
        limitPrice: 200,
      };

      const result = await broker.submitOrder(order);
      expect(result.status).toBe('new'); // Limit orders stay open
      expect(result.filledQty).toBe(0);
      expect(result.limitPrice).toBe(200);
    });

    it('should add position when buy market order fills', async () => {
      const order: OrderRequest = {
        symbol: 'NVDA',
        side: 'buy',
        qty: 20,
        type: 'market',
      };

      await broker.submitOrder(order);
      const position = await broker.getPosition('NVDA');
      expect(position).not.toBeNull();
      expect(position?.qty).toBe(20);
      expect(position?.side).toBe('long');
    });

    it('should increase position when buying more of same symbol', async () => {
      await broker.submitOrder({ symbol: 'AAPL', side: 'buy', qty: 10, type: 'market' });
      await broker.submitOrder({ symbol: 'AAPL', side: 'buy', qty: 5, type: 'market' });

      const position = await broker.getPosition('AAPL');
      expect(position?.qty).toBe(15);
    });

    it('should reduce position when selling', async () => {
      await broker.submitOrder({ symbol: 'MSFT', side: 'buy', qty: 20, type: 'market' });
      await broker.submitOrder({ symbol: 'MSFT', side: 'sell', qty: 10, type: 'market' });

      const position = await broker.getPosition('MSFT');
      expect(position?.qty).toBe(10);
    });

    it('should remove position when selling all', async () => {
      await broker.submitOrder({ symbol: 'GOOGL', side: 'buy', qty: 5, type: 'market' });
      await broker.submitOrder({ symbol: 'GOOGL', side: 'sell', qty: 5, type: 'market' });

      const position = await broker.getPosition('GOOGL');
      expect(position).toBeNull();
    });
  });

  describe('getOrders', () => {
    it('should return empty orders initially', async () => {
      const orders = await broker.getOrders();
      expect(orders).toEqual([]);
    });

    it('should return orders after submitting', async () => {
      await broker.submitOrder({ symbol: 'AAPL', side: 'buy', qty: 10, type: 'market' });
      await broker.submitOrder({ symbol: 'TSLA', side: 'buy', qty: 5, type: 'limit', limitPrice: 200 });

      const orders = await broker.getOrders();
      expect(orders.length).toBe(2);
    });

    it('should filter orders by status', async () => {
      await broker.submitOrder({ symbol: 'AAPL', side: 'buy', qty: 10, type: 'market' }); // filled
      await broker.submitOrder({ symbol: 'TSLA', side: 'buy', qty: 5, type: 'limit', limitPrice: 200 }); // new

      const filledOrders = await broker.getOrders('filled');
      expect(filledOrders.length).toBe(1);
      expect(filledOrders[0].status).toBe('filled');

      const newOrders = await broker.getOrders('new');
      expect(newOrders.length).toBe(1);
      expect(newOrders[0].status).toBe('new');
    });
  });

  describe('cancelOrder', () => {
    it('should cancel an existing order', async () => {
      const order = await broker.submitOrder({
        symbol: 'AAPL',
        side: 'buy',
        qty: 10,
        type: 'limit',
        limitPrice: 150,
      });

      const result = await broker.cancelOrder(order.id);
      expect(result).toBe(true);

      const orders = await broker.getOrders();
      const cancelled = orders.find(o => o.id === order.id);
      expect(cancelled?.status).toBe('canceled');
    });

    it('should return false for non-existent order', async () => {
      const result = await broker.cancelOrder('non-existent-id');
      expect(result).toBe(false);
    });
  });

  // ─── Close Position ───

  describe('closePosition', () => {
    it('should close an existing position', async () => {
      await broker.submitOrder({ symbol: 'AAPL', side: 'buy', qty: 10, type: 'market' });

      const order = await broker.closePosition('AAPL');
      expect(order.symbol).toBe('AAPL');
      expect(order.side).toBe('sell');
      expect(order.status).toBe('filled');

      const position = await broker.getPosition('AAPL');
      expect(position).toBeNull();
    });

    it('should throw for non-existent position', async () => {
      await expect(broker.closePosition('FAKE')).rejects.toThrow();
    });
  });

  describe('closePositionPartial', () => {
    it('should partially close a position', async () => {
      await broker.submitOrder({ symbol: 'AAPL', side: 'buy', qty: 20, type: 'market' });

      const order = await broker.closePositionPartial('AAPL', 5);
      expect(order.filledQty).toBe(5);

      const position = await broker.getPosition('AAPL');
      expect(position?.qty).toBe(15);
    });

    it('should close entire position if qty >= position qty', async () => {
      await broker.submitOrder({ symbol: 'AAPL', side: 'buy', qty: 10, type: 'market' });

      await broker.closePositionPartial('AAPL', 15); // More than held

      const position = await broker.getPosition('AAPL');
      expect(position).toBeNull();
    });
  });

  // ─── Reset ───

  describe('reset', () => {
    it('should clear all positions and orders', async () => {
      await broker.submitOrder({ symbol: 'AAPL', side: 'buy', qty: 10, type: 'market' });

      broker.reset();

      const positions = await broker.getPositions();
      const orders = await broker.getOrders();
      expect(positions).toEqual([]);
      expect(orders).toEqual([]);
    });
  });
});

describe('BrokerFactory', () => {
  beforeEach(() => {
    resetBroker();
  });

  describe('getBroker', () => {
    it('should return MockBroker by default', () => {
      const broker = getBroker();
      expect(broker.name).toBe('mock');
    });
  });

  describe('isRealBroker', () => {
    it('should return false when using MockBroker', () => {
      expect(isRealBroker()).toBe(false);
    });
  });

  describe('resetBroker', () => {
    it('should reset to MockBroker', () => {
      resetBroker();
      const broker = getBroker();
      expect(broker.name).toBe('mock');
    });
  });
});
