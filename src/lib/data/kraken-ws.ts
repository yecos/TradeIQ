/**
 * Kraken WebSocket Service — real-time crypto order book (Level 2).
 *
 * Why Kraken WS?
 * - FREE — no API key needed for public market data
 * - Level 2 order book: depth data for order flow analysis
 * - Level 3 (individual orders) also available on v2 API
 * - Works from US servers
 * - Supports all major crypto pairs
 *
 * Kraken WS docs: https://docs.kraken.com/websockets/
 *
 * Use cases in TradeIQ:
 * - Order flow analysis (bid/ask depth, imbalances)
 * - Absorption detection (large resting orders)
 * - Support/resistance level identification
 * - Real-time spread monitoring
 */

import type { OrderBookLevel, OrderBookSnapshot } from '../types';

export type KrakenWSConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface KrakenOrderBookUpdate {
  symbol: string;
  orderBook: OrderBookSnapshot;
}

export type KrakenOrderBookCallback = (update: KrakenOrderBookUpdate) => void;

// Symbol conversion: our format → Kraken WS format
function toKrakenPair(symbol: string): string {
  const upper = symbol.toUpperCase();
  const pair = upper.endsWith('USDT') || upper.endsWith('BUSD') ? upper.replace('USDT', 'USD').replace('BUSD', 'USD') : `${upper}/USD`;
  return pair;
}

// Known Kraken pair names (they use XBT for BTC, etc.)
const KRAKEN_PAIR_MAP: Record<string, string> = {
  'BTC/USD': 'XBT/USD',
  'BTCUSDT': 'XBT/USDT',
  'ETH/USD': 'ETH/USD',
  'SOL/USD': 'SOL/USD',
  'XRP/USD': 'XRP/USD',
  'ADA/USD': 'ADA/USD',
  'DOGE/USD': 'DOGE/USD',
  'DOT/USD': 'DOT/USD',
  'LINK/USD': 'LINK/USD',
  'AVAX/USD': 'AVAX/USD',
  'MATIC/USD': 'MATIC/USD',
  'LTC/USD': 'LTC/USD',
  'UNI/USD': 'UNI/USD',
  'ATOM/USD': 'ATOM/USD',
  'NEAR/USD': 'NEAR/USD',
  'AAVE/USD': 'AAVE/USD',
  'ARB/USD': 'ARB/USD',
  'OP/USD': 'OP/USD',
  'APT/USD': 'APT/USD',
  'SUI/USD': 'SUI/USD',
};

const WS_URL = 'wss://ws.kraken.com';
const WS_URL_V2 = 'wss://ws-auth.kraken.com'; // Private (not needed)
const MAX_RECONNECT_ATTEMPTS = 15;
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const BOOK_DEPTH = 25; // Number of levels to track

export class KrakenWebSocket {
  private ws: WebSocket | null = null;
  private callback: KrakenOrderBookCallback | null = null;
  private connectionState: KrakenWSConnectionState = 'disconnected';
  private currentSymbol: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  // Order book state
  private bids: Map<number, number> = new Map(); // price → volume
  private asks: Map<number, number> = new Map();

  subscribe(symbol: string, callback: KrakenOrderBookCallback): void {
    this.unsubscribe();
    this.currentSymbol = symbol;
    this.callback = callback;
    this.reconnectAttempts = 0;
    this.bids.clear();
    this.asks.clear();
    this.connect();
  }

  unsubscribe(): void {
    this.cleanup();
    this.currentSymbol = null;
    this.callback = null;
    this.bids.clear();
    this.asks.clear();
    this.setConnectionState('disconnected');
  }

  getState(): KrakenWSConnectionState {
    return this.connectionState;
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
  }

  private connect(): void {
    if (this.disposed) return;
    if (!this.currentSymbol) return;

    this.setConnectionState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      this.ws = new WebSocket(WS_URL);
    } catch (error) {
      console.warn('[TradeIQ KrakenWS] Failed to create WebSocket:', error);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      if (this.disposed) return;
      console.log('[TradeIQ KrakenWS] Connected');

      // Subscribe to book channel
      const krakenPair = KRAKEN_PAIR_MAP[toKrakenPair(this.currentSymbol!)] || toKrakenPair(this.currentSymbol!);

      this.ws!.send(JSON.stringify({
        event: 'subscribe',
        pair: [krakenPair],
        subscription: { name: 'book', depth: BOOK_DEPTH },
      }));

      this.setConnectionState('connected');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event: MessageEvent) => {
      if (this.disposed) return;

      try {
        const data = JSON.parse(event.data as string);

        // Handle subscription events
        if (data.event === 'subscriptionStatus') {
          if (data.status === 'subscribed') {
            console.log(`[TradeIQ KrakenWS] Subscribed to ${data.pair?.[0] || this.currentSymbol} book`);
          } else if (data.status === 'error') {
            console.warn(`[TradeIQ KrakenWS] Subscription error: ${data.errorMessage}`);
          }
          return;
        }

        // Handle heartbeat
        if (data.event === 'heartbeat') return;

        // Handle book updates — Kraken sends [channelID, data, channelName, pair]
        if (Array.isArray(data) && data.length >= 3 && data[2] === 'book-25') {
          this.processBookUpdate(data[1], data[3]);
        }
      } catch (error) {
        // Ignore parse errors for non-JSON messages
      }
    };

    this.ws.onerror = (event) => {
      console.warn('[TradeIQ KrakenWS] Error:', event);
    };

    this.ws.onclose = (event) => {
      if (this.disposed) return;
      console.warn(`[TradeIQ KrakenWS] Closed (code=${event.code})`);
      this.cleanupConnection();

      if (this.currentSymbol) {
        this.scheduleReconnect();
      }
    };
  }

  private processBookUpdate(bookData: Record<string, unknown>, pair: string): void {
    if (!this.callback || !this.currentSymbol) return;

    // Process bid updates
    if (bookData.b && Array.isArray(bookData.b)) {
      for (const [price, volume] of bookData.b as [string, string][]) {
        const p = parseFloat(price);
        const v = parseFloat(volume);
        if (v === 0) {
          this.bids.delete(p);
        } else {
          this.bids.set(p, v);
        }
      }
    }

    // Process ask updates
    if (bookData.a && Array.isArray(bookData.a)) {
      for (const [price, volume] of bookData.a as [string, string][]) {
        const p = parseFloat(price);
        const v = parseFloat(volume);
        if (v === 0) {
          this.asks.delete(p);
        } else {
          this.asks.set(p, v);
        }
      }
    }

    // Build order book snapshot
    const sortedBids = [...this.bids.entries()].sort((a, b) => b[0] - a[0]).slice(0, 15);
    const sortedAsks = [...this.asks.entries()].sort((a, b) => a[0] - b[0]).slice(0, 15);

    // Calculate totals for depth
    let bidTotal = 0;
    let askTotal = 0;
    const bidLevels: OrderBookLevel[] = sortedBids.map(([price, qty]) => {
      bidTotal += qty;
      return { price, quantity: qty, total: bidTotal };
    });
    const askLevels: OrderBookLevel[] = sortedAsks.map(([price, qty]) => {
      askTotal += qty;
      return { price, quantity: qty, total: askTotal };
    });

    const bestBid = sortedBids[0]?.[0] || 0;
    const bestAsk = sortedAsks[0]?.[0] || 0;
    const spread = bestAsk - bestBid;
    const spreadPercent = bestBid > 0 ? (spread / bestBid) * 100 : 0;

    const orderBook: OrderBookSnapshot = {
      bids: bidLevels,
      asks: askLevels,
      spread: Math.round(spread * 100) / 100,
      spreadPercent: Math.round(spreadPercent * 1000) / 1000,
      bidDepth: bidTotal,
      askDepth: askTotal,
      imbalance: bidTotal + askTotal > 0 ? (bidTotal - askTotal) / (bidTotal + askTotal) : 0,
      timestamp: Date.now(),
    };

    this.callback({
      symbol: this.currentSymbol,
      orderBook,
    });
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[TradeIQ KrakenWS] Max reconnect attempts reached`);
      this.setConnectionState('disconnected');
      return;
    }

    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY
    );
    this.reconnectAttempts++;
    this.setConnectionState('reconnecting');

    this.reconnectTimer = setTimeout(() => {
      if (!this.disposed && this.currentSymbol) {
        this.connect();
      }
    }, delay);
  }

  private cleanupConnection(): void {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try { this.ws.close(1000, 'Cleanup'); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupConnection();
  }

  private setConnectionState(state: KrakenWSConnectionState): void {
    if (this.connectionState === state) return;
    this.connectionState = state;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────

let krakenWsInstance: KrakenWebSocket | null = null;

export function getKrakenWS(): KrakenWebSocket {
  if (!krakenWsInstance) {
    krakenWsInstance = new KrakenWebSocket();
  }
  return krakenWsInstance;
}

export function disposeKrakenWS(): void {
  if (krakenWsInstance) {
    krakenWsInstance.dispose();
    krakenWsInstance = null;
  }
}
