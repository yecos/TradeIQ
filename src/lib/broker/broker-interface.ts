/**
 * Broker Provider Interface — abstracts broker operations following Provider Pattern (ADR-002).
 *
 * Implementations: AlpacaBroker (production), MockBroker (testing/fallback)
 *
 * All broker operations go through this interface so the rest of the app
 * never depends on a specific broker API directly.
 */

/** Account information from the broker */
export interface BrokerAccount {
  id: string;
  accountNumber: string;
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
  currency: string;
  cash: number;
  equity: number;
  buyingPower: number;
  longMarketValue: number;
  shortMarketValue: number;
  initialMargin: number;
  maintenanceMargin: number;
  patternDayTrader: boolean;
  tradingBlocked: boolean;
  transfersBlocked: boolean;
  isPaper: boolean;
}

/** A position held at the broker */
export interface BrokerPosition {
  symbol: string;
  qty: number;
  side: 'long' | 'short';
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  costBasis: number;
}

/** An order submitted to the broker */
export interface BrokerOrder {
  id: string;
  clientId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  type: 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop';
  limitPrice?: number;
  stopPrice?: number;
  trailPrice?: number;
  trailPercent?: number;
  timeInForce: 'day' | 'gtc' | 'ioc' | 'opg' | 'cls';
  status: 'new' | 'partially_filled' | 'filled' | 'done_for_day' | 'canceled' | 'expired' | 'replaced' | 'pending_cancel' | 'pending_replace' | 'accepted' | 'pending_new' | 'accepted_for_bidding' | 'stopped' | 'rejected' | 'suspended' | 'calculated';
  filledQty: number;
  filledAvgPrice?: number;
  createdAt: string;
  updatedAt: string;
}

/** Parameters for submitting a new order */
export interface OrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  type: 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop';
  limitPrice?: number;
  stopPrice?: number;
  trailPrice?: number;
  trailPercent?: number;
  timeInForce?: 'day' | 'gtc' | 'ioc' | 'opg' | 'cls';
  clientId?: string;
}

/** Result of a connection test */
export interface ConnectionTestResult {
  connected: boolean;
  isPaper: boolean;
  accountNumber?: string;
  equity?: number;
  error?: string;
}

/** Broker provider interface — all brokers must implement this */
export interface BrokerProvider {
  readonly name: string;

  /** Test the connection and return account info */
  testConnection(): Promise<ConnectionTestResult>;

  /** Get account details */
  getAccount(): Promise<BrokerAccount>;

  /** Get all open positions */
  getPositions(): Promise<BrokerPosition[]>;

  /** Get a specific position by symbol */
  getPosition(symbol: string): Promise<BrokerPosition | null>;

  /** Get orders (optionally filtered by status) */
  getOrders(status?: string): Promise<BrokerOrder[]>;

  /** Submit a new order */
  submitOrder(order: OrderRequest): Promise<BrokerOrder>;

  /** Cancel an existing order */
  cancelOrder(orderId: string): Promise<boolean>;

  /** Close a position entirely */
  closePosition(symbol: string): Promise<BrokerOrder>;

  /** Close a position partially (by qty or percentage) */
  closePositionPartial(symbol: string, qty: number): Promise<BrokerOrder>;
}
