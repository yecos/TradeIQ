import type {
  BrokerProvider,
  BrokerAccount,
  BrokerPosition,
  BrokerOrder,
  OrderRequest,
  ConnectionTestResult,
} from './broker-interface';

/**
 * Mock Broker Provider — simulates broker operations for testing and fallback.
 *
 * Returns deterministic data so tests are reproducible.
 * Does NOT make any real API calls.
 */

let _orderCounter = 1000;

function nextOrderId(): string {
  return `mock-order-${++_orderCounter}`;
}

const MOCK_ACCOUNT: BrokerAccount = {
  id: 'mock-account-001',
  accountNumber: 'MOCK123456',
  status: 'ACTIVE',
  currency: 'USD',
  cash: 50000,
  equity: 100000,
  buyingPower: 200000,
  longMarketValue: 50000,
  shortMarketValue: 0,
  initialMargin: 25000,
  maintenanceMargin: 15000,
  patternDayTrader: false,
  tradingBlocked: false,
  transfersBlocked: false,
  isPaper: true,
};

export class MockBroker implements BrokerProvider {
  readonly name = 'mock';
  private positions: BrokerPosition[] = [];
  private orders: BrokerOrder[] = [];

  constructor(initialPositions?: BrokerPosition[]) {
    this.positions = initialPositions || [];
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return {
      connected: true,
      isPaper: true,
      accountNumber: MOCK_ACCOUNT.accountNumber,
      equity: MOCK_ACCOUNT.equity,
    };
  }

  async getAccount(): Promise<BrokerAccount> {
    return { ...MOCK_ACCOUNT };
  }

  async getPositions(): Promise<BrokerPosition[]> {
    return this.positions.map(p => ({ ...p }));
  }

  async getPosition(symbol: string): Promise<BrokerPosition | null> {
    const pos = this.positions.find(p => p.symbol === symbol);
    return pos ? { ...pos } : null;
  }

  async getOrders(status?: string): Promise<BrokerOrder[]> {
    if (status) {
      return this.orders.filter(o => o.status === status).map(o => ({ ...o }));
    }
    return this.orders.map(o => ({ ...o }));
  }

  async submitOrder(order: OrderRequest): Promise<BrokerOrder> {
    const now = new Date().toISOString();
    const brokerOrder: BrokerOrder = {
      id: nextOrderId(),
      clientId: order.clientId,
      symbol: order.symbol,
      side: order.side,
      qty: order.qty,
      type: order.type,
      limitPrice: order.limitPrice,
      stopPrice: order.stopPrice,
      timeInForce: order.timeInForce || 'day',
      status: 'new',
      filledQty: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Simulate immediate fill for market orders
    if (order.type === 'market') {
      brokerOrder.status = 'filled';
      brokerOrder.filledQty = order.qty;
      brokerOrder.filledAvgPrice = 100 + Math.random() * 50; // Random price for testing
    }

    this.orders.unshift(brokerOrder);

    // Update positions for filled orders
    if (brokerOrder.status === 'filled') {
      const existingIdx = this.positions.findIndex(p => p.symbol === order.symbol);
      if (existingIdx >= 0) {
        const existing = this.positions[existingIdx];
        if (order.side === 'buy') {
          const newQty = existing.qty + order.qty;
          const newCost = existing.costBasis + (brokerOrder.filledAvgPrice || 0) * order.qty;
          this.positions[existingIdx] = {
            ...existing,
            qty: newQty,
            costBasis: newCost,
            avgEntryPrice: newCost / newQty,
          };
        } else {
          const newQty = existing.qty - order.qty;
          if (newQty <= 0) {
            this.positions.splice(existingIdx, 1);
          } else {
            this.positions[existingIdx] = {
              ...existing,
              qty: newQty,
              costBasis: existing.costBasis - (brokerOrder.filledAvgPrice || 0) * order.qty,
            };
          }
        }
      } else if (order.side === 'buy') {
        this.positions.push({
          symbol: order.symbol,
          qty: order.qty,
          side: 'long',
          avgEntryPrice: brokerOrder.filledAvgPrice || 100,
          currentPrice: brokerOrder.filledAvgPrice || 100,
          marketValue: (brokerOrder.filledAvgPrice || 100) * order.qty,
          unrealizedPnl: 0,
          unrealizedPnlPercent: 0,
          costBasis: (brokerOrder.filledAvgPrice || 100) * order.qty,
        });
      }
    }

    return { ...brokerOrder };
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    const idx = this.orders.findIndex(o => o.id === orderId);
    if (idx >= 0) {
      this.orders[idx] = { ...this.orders[idx], status: 'canceled' };
      return true;
    }
    return false;
  }

  async closePosition(symbol: string): Promise<BrokerOrder> {
    const pos = this.positions.find(p => p.symbol === symbol);
    if (!pos) {
      throw new Error(`No position found for ${symbol}`);
    }

    // Remove the position
    this.positions = this.positions.filter(p => p.symbol !== symbol);

    // Create a closing order
    const now = new Date().toISOString();
    const closeOrder: BrokerOrder = {
      id: nextOrderId(),
      symbol,
      side: pos.side === 'long' ? 'sell' : 'buy',
      qty: pos.qty,
      type: 'market',
      timeInForce: 'day',
      status: 'filled',
      filledQty: pos.qty,
      filledAvgPrice: pos.currentPrice,
      createdAt: now,
      updatedAt: now,
    };

    this.orders.unshift(closeOrder);
    return { ...closeOrder };
  }

  async closePositionPartial(symbol: string, qty: number): Promise<BrokerOrder> {
    const pos = this.positions.find(p => p.symbol === symbol);
    if (!pos) {
      throw new Error(`No position found for ${symbol}`);
    }

    // Reduce position
    const newQty = pos.qty - qty;
    if (newQty <= 0) {
      return this.closePosition(symbol);
    }

    const idx = this.positions.findIndex(p => p.symbol === symbol);
    this.positions[idx] = {
      ...pos,
      qty: newQty,
      marketValue: pos.currentPrice * newQty,
      costBasis: pos.costBasis * (newQty / pos.qty),
    };

    const now = new Date().toISOString();
    const closeOrder: BrokerOrder = {
      id: nextOrderId(),
      symbol,
      side: pos.side === 'long' ? 'sell' : 'buy',
      qty,
      type: 'market',
      timeInForce: 'day',
      status: 'filled',
      filledQty: qty,
      filledAvgPrice: pos.currentPrice,
      createdAt: now,
      updatedAt: now,
    };

    this.orders.unshift(closeOrder);
    return { ...closeOrder };
  }

  // Test helpers
  setPositions(positions: BrokerPosition[]): void {
    this.positions = positions;
  }

  setAccount(overrides: Partial<BrokerAccount>): void {
    Object.assign(MOCK_ACCOUNT, overrides);
  }

  reset(): void {
    this.positions = [];
    this.orders = [];
  }
}
