import type {
  BrokerProvider,
  BrokerAccount,
  BrokerPosition,
  BrokerOrder,
  OrderRequest,
  ConnectionTestResult,
} from './broker-interface';

/**
 * Alpaca Broker Provider — implements BrokerProvider for Alpaca Markets API.
 *
 * Supports both paper and live trading:
 * - Paper: https://paper-api.alpaca.markets
 * - Live:  https://api.alpaca.markets
 *
 * Rate limits: 200 requests/min for free tier.
 * All requests use the v2 API.
 */

const ALPACA_PAPER_BASE = 'https://paper-api.alpaca.markets';
const ALPACA_LIVE_BASE = 'https://api.alpaca.markets';
const ALPACA_DATA_BASE = 'https://data.alpaca.markets';

/** Request timeout (ms) — Alpaca typically responds in <1s */
const REQUEST_TIMEOUT = 10_000;

/**
 * Race a promise against a timeout — throws on timeout.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[TradeIQ] ${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export class AlpacaBroker implements BrokerProvider {
  readonly name = 'alpaca';
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private dataUrl: string;
  private isPaper: boolean;

  constructor(apiKey: string, apiSecret: string, isPaper: boolean = true) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.isPaper = isPaper;
    this.baseUrl = isPaper ? ALPACA_PAPER_BASE : ALPACA_LIVE_BASE;
    this.dataUrl = ALPACA_DATA_BASE;
  }

  /**
   * Test connection by fetching account info.
   * Returns basic account details if successful.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const account = await this.getAccount();
      return {
        connected: true,
        isPaper: this.isPaper,
        accountNumber: account.accountNumber,
        equity: account.equity,
      };
    } catch (error) {
      return {
        connected: false,
        isPaper: this.isPaper,
        error: error instanceof Error ? error.message : 'Unknown connection error',
      };
    }
  }

  /**
   * Get account details from Alpaca.
   */
  async getAccount(): Promise<BrokerAccount> {
    const raw = await this.request<any>('/v2/account');
    return this.mapAccount(raw);
  }

  /**
   * Get all open positions.
   */
  async getPositions(): Promise<BrokerPosition[]> {
    const raw = await this.request<any[]>('/v2/positions');
    return raw.map(p => this.mapPosition(p));
  }

  /**
   * Get a specific position by symbol.
   */
  async getPosition(symbol: string): Promise<BrokerPosition | null> {
    try {
      const raw = await this.request<any>(`/v2/positions/${encodeURIComponent(symbol)}`);
      return this.mapPosition(raw);
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null; // No position for this symbol
      }
      throw error;
    }
  }

  /**
   * Get orders, optionally filtered by status.
   */
  async getOrders(status?: string): Promise<BrokerOrder[]> {
    const params = new URLSearchParams();
    params.set('limit', '100');
    params.set('direction', 'desc');
    if (status) params.set('status', status);

    const raw = await this.request<any[]>(`/v2/orders?${params.toString()}`);
    return raw.map(o => this.mapOrder(o));
  }

  /**
   * Submit a new order.
   */
  async submitOrder(order: OrderRequest): Promise<BrokerOrder> {
    const body: Record<string, any> = {
      symbol: order.symbol,
      side: order.side,
      qty: order.qty.toString(),
      type: order.type,
      time_in_force: order.timeInForce || 'day',
    };

    if (order.limitPrice !== undefined) body.limit_price = order.limitPrice.toString();
    if (order.stopPrice !== undefined) body.stop_price = order.stopPrice.toString();
    if (order.trailPrice !== undefined) body.trail_price = order.trailPrice.toString();
    if (order.trailPercent !== undefined) body.trail_percent = order.trailPercent.toString();
    if (order.clientId) body.client_order_id = order.clientId;

    const raw = await this.request<any>('/v2/orders', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return this.mapOrder(raw);
  }

  /**
   * Cancel an existing order.
   */
  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      await this.request<void>(`/v2/orders/${orderId}`, { method: 'DELETE' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Close a position entirely (liquidate).
   */
  async closePosition(symbol: string): Promise<BrokerOrder> {
    const raw = await this.request<any>(`/v2/positions/${encodeURIComponent(symbol)}`, {
      method: 'DELETE',
    });
    return this.mapOrder(raw);
  }

  /**
   * Close a position partially by specifying quantity.
   */
  async closePositionPartial(symbol: string, qty: number): Promise<BrokerOrder> {
    const raw = await this.request<any>(
      `/v2/positions/${encodeURIComponent(symbol)}?qty=${qty}`,
      { method: 'DELETE' }
    );
    return this.mapOrder(raw);
  }

  // ─── Private helpers ───

  /**
   * Make an authenticated request to the Alpaca API.
   */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = path.startsWith('/v2/') ? `${this.baseUrl}${path}` : `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'APCA-API-KEY-ID': this.apiKey,
      'APCA-API-SECRET-KEY': this.apiSecret,
      'Content-Type': 'application/json',
    };

    const response = await withTimeout(
      fetch(url, {
        ...options,
        headers: { ...headers, ...(options.headers as Record<string, string> || {}) },
      }),
      REQUEST_TIMEOUT,
      `Alpaca ${options.method || 'GET'} ${path}`
    );

    // Handle non-OK responses
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const errorMsg = text || response.statusText;

      if (response.status === 401) {
        throw new Error(`Alpaca authentication failed: ${errorMsg}`);
      }
      if (response.status === 403) {
        throw new Error(`Alpaca access forbidden: ${errorMsg}`);
      }
      if (response.status === 404) {
        throw new Error(`Alpaca resource not found (404): ${path}`);
      }
      if (response.status === 429) {
        throw new Error(`Alpaca rate limit exceeded. Slow down requests.`);
      }

      throw new Error(`Alpaca API error (${response.status}): ${errorMsg}`);
    }

    // Some responses (DELETE) may have no body
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  /**
   * Map Alpaca account response to our BrokerAccount type.
   */
  private mapAccount(raw: any): BrokerAccount {
    return {
      id: raw.id,
      accountNumber: raw.account_number,
      status: raw.status,
      currency: raw.currency || 'USD',
      cash: Number(raw.cash) || 0,
      equity: Number(raw.equity) || 0,
      buyingPower: Number(raw.buying_power) || 0,
      longMarketValue: Number(raw.long_market_value) || 0,
      shortMarketValue: Number(raw.short_market_value) || 0,
      initialMargin: Number(raw.initial_margin) || 0,
      maintenanceMargin: Number(raw.maintenance_margin) || 0,
      patternDayTrader: Boolean(raw.pattern_day_trader),
      tradingBlocked: Boolean(raw.trading_blocked),
      transfersBlocked: Boolean(raw.transfers_blocked),
      isPaper: this.isPaper,
    };
  }

  /**
   * Map Alpaca position response to our BrokerPosition type.
   */
  private mapPosition(raw: any): BrokerPosition {
    const avgEntryPrice = Number(raw.avg_entry_price) || 0;
    const currentPrice = Number(raw.current_price) || 0;
    const marketValue = Number(raw.market_value) || 0;
    const unrealizedPnl = Number(raw.unrealized_pl) || 0;
    const unrealizedPnlPercent = Number(raw.unrealized_plpc) * 100 || 0;

    return {
      symbol: raw.symbol,
      qty: Number(raw.qty) || 0,
      side: raw.side === 'long' ? 'long' : 'short',
      avgEntryPrice,
      currentPrice,
      marketValue,
      unrealizedPnl,
      unrealizedPnlPercent,
      costBasis: Number(raw.cost_basis) || 0,
    };
  }

  /**
   * Map Alpaca order response to our BrokerOrder type.
   */
  private mapOrder(raw: any): BrokerOrder {
    return {
      id: raw.id,
      clientId: raw.client_order_id,
      symbol: raw.symbol,
      side: raw.side,
      qty: Number(raw.qty) || 0,
      type: raw.type,
      limitPrice: raw.limit_price ? Number(raw.limit_price) : undefined,
      stopPrice: raw.stop_price ? Number(raw.stop_price) : undefined,
      trailPrice: raw.trail_price ? Number(raw.trail_price) : undefined,
      trailPercent: raw.trail_percent ? Number(raw.trail_percent) : undefined,
      timeInForce: raw.time_in_force,
      status: raw.status,
      filledQty: Number(raw.filled_qty) || 0,
      filledAvgPrice: raw.filled_avg_price ? Number(raw.filled_avg_price) : undefined,
      createdAt: raw.submitted_at || raw.created_at,
      updatedAt: raw.updated_at,
    };
  }

  /**
   * Get the base URL being used (for debugging).
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Check if this is a paper trading connection.
   */
  getIsPaper(): boolean {
    return this.isPaper;
  }
}

/**
 * Create an AlpacaBroker from environment or stored config.
 * Returns null if credentials are missing.
 */
export function createAlpacaBroker(apiKey: string, apiSecret: string, isPaper: boolean): AlpacaBroker | null {
  if (!apiKey || !apiSecret) return null;
  return new AlpacaBroker(apiKey, apiSecret, isPaper);
}
