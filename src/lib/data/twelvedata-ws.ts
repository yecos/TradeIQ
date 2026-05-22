/**
 * Twelve Data WebSocket — Real-time price streaming for stocks, forex, crypto, indices.
 *
 * Free tier:
 * - 2 concurrent WS connections
 * - 20 symbols per connection
 * - Real-time price updates
 *
 * Twelve Data WS docs: https://twelvedata.com/docs#real-time-price
 *
 * Usage:
 *   const ws = getTwelveDataWS('YOUR_API_KEY');
 *   ws.subscribe('AAPL', (update) => { ... });
 *   ws.unsubscribe();
 */

'use client';

import type { Candle } from '../types';

// ─── Types ───────────────────────────────────────────────────────────

export interface TwelveDataPriceUpdate {
  symbol: string;
  candle: Candle;
  /** Current price */
  price: number;
  /** Source of the update */
  source: 'trade';
}

export interface TwelveDataWSState {
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  lastMessageTime: number | null;
  symbol: string | null;
  error: string | null;
}

type StateCallback = (state: TwelveDataWSState) => void;
type PriceCallback = (update: TwelveDataPriceUpdate) => void;

// ─── Twelve Data WS Message Types ────────────────────────────────────

interface TwelveDataWSMessage {
  event: 'subscribe' | 'unsubscribe' | 'heartbeat' | 'price' | 'error' | 'connection-established' | 'subscribe-completed' | 'unsubscribe-completed';
  data?: {
    symbol: string;
    price: number;
    timestamp: number;
    day_volume?: number;
    day_open?: number;
    day_high?: number;
    day_low?: number;
    day_close?: number;
  };
  symbols?: string[];
  message?: string;
}

// ─── Twelve Data WebSocket Client ────────────────────────────────────

class TwelveDataWS {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private state: TwelveDataWSState = {
    connectionState: 'disconnected',
    lastMessageTime: null,
    symbol: null,
    error: null,
  };
  private stateCallbacks = new Set<StateCallback>();
  private priceCallbacks = new Map<string, Set<PriceCallback>>();
  private subscribedSymbols = new Set<string>();

  // Reconnection
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isIntentionalClose = false;

  // Keepalive
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageTimestamp = 0;

  // Candle aggregation per symbol
  private candleAggregation = new Map<string, {
    candle: Candle;
    candleTime: number;
  }>();

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('Twelve Data API key is required for WebSocket');
    this.apiKey = apiKey;
  }

  /**
   * Connect to Twelve Data WebSocket.
   */
  private connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.isIntentionalClose = false;
    this.setState({ connectionState: 'connecting', error: null });

    try {
      this.ws = new WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${this.apiKey}`);
    } catch (error) {
      this.setState({
        connectionState: 'error',
        error: `Failed to create WebSocket: ${error instanceof Error ? error.message : 'unknown'}`,
      });
      return;
    }

    this.ws.onopen = () => {
      console.warn('[TradeIQ] Twelve Data WS connected');
      this.reconnectAttempts = 0;
      this.startKeepalive();
      // Don't set connected until we get connection-confirmed event
    };

    this.ws.onmessage = (event) => {
      this.lastMessageTimestamp = Date.now();

      try {
        const msg: TwelveDataWSMessage = JSON.parse(event.data);

        switch (msg.event) {
          case 'connection-established':
            this.setState({ connectionState: 'connected', error: null });
            // Re-subscribe symbols if reconnecting
            if (this.subscribedSymbols.size > 0) {
              this.sendSubscribe([...this.subscribedSymbols]);
            }
            break;

          case 'subscribe-completed':
            console.warn(`[TradeIQ] Twelve Data WS subscribed: ${msg.symbols?.join(', ')}`);
            break;

          case 'unsubscribe-completed':
            console.warn(`[TradeIQ] Twelve Data WS unsubscribed: ${msg.symbols?.join(', ')}`);
            break;

          case 'heartbeat':
            // Keepalive — no action needed
            break;

          case 'price':
            if (msg.data) {
              this.handlePriceUpdate(msg.data);
            }
            break;

          case 'error':
            console.error('[TradeIQ] Twelve Data WS error:', msg.message);
            this.setState({ error: msg.message || 'Unknown error' });
            break;
        }
      } catch {
        // Non-JSON message, ignore
      }
    };

    this.ws.onclose = (event) => {
      this.stopKeepalive();
      console.warn(`[TradeIQ] Twelve Data WS closed: code=${event.code} reason=${event.reason}`);

      if (!this.isIntentionalClose) {
        this.scheduleReconnect();
      } else {
        this.setState({ connectionState: 'disconnected' });
      }
    };

    this.ws.onerror = () => {
      console.error('[TradeIQ] Twelve Data WS error');
      this.setState({
        connectionState: 'error',
        error: 'WebSocket connection error',
      });
    };
  }

  /**
   * Subscribe to real-time price updates for a symbol.
   */
  subscribe(symbol: string, callback: PriceCallback): void {
    // Store callback
    if (!this.priceCallbacks.has(symbol)) {
      this.priceCallbacks.set(symbol, new Set());
    }
    this.priceCallbacks.get(symbol)!.add(callback);

    // Track subscribed symbols
    this.subscribedSymbols.add(symbol);
    this.setState({ symbol });

    // Connect if needed
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.connect();
    } else if (this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscribe([symbol]);
    }
  }

  /**
   * Unsubscribe from a specific symbol or all symbols.
   */
  unsubscribe(): void {
    if (this.subscribedSymbols.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
      this.sendUnsubscribe([...this.subscribedSymbols]);
    }

    this.priceCallbacks.clear();
    this.subscribedSymbols.clear();
    this.candleAggregation.clear();
    this.setState({ symbol: null });
  }

  /**
   * Disconnect the WebSocket.
   */
  disconnect(): void {
    this.isIntentionalClose = true;
    this.stopKeepalive();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.setState({ connectionState: 'disconnected', symbol: null });
  }

  /**
   * Get current connection state.
   */
  getState(): TwelveDataWSState {
    return { ...this.state };
  }

  /**
   * Listen for state changes.
   */
  onStateChange(callback: StateCallback): () => void {
    this.stateCallbacks.add(callback);
    return () => this.stateCallbacks.delete(callback);
  }

  // ─── Private Methods ──────────────────────────────────────────────

  private sendSubscribe(symbols: string[]): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        event: 'subscribe',
        symbols: symbols.map(s => {
          // Format symbols for Twelve Data WS
          const upper = s.toUpperCase();
          const cryptoSymbols = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT',
            'AVAX', 'MATIC', 'LINK', 'UNI', 'ATOM', 'LTC', 'NEAR'];
          if (cryptoSymbols.includes(upper)) return `${upper}/USD`;
          return upper;
        }),
      }));
    }
  }

  private sendUnsubscribe(symbols: string[]): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        event: 'unsubscribe',
        symbols,
      }));
    }
  }

  /**
   * Handle price update — aggregate into candle and notify.
   */
  private handlePriceUpdate(data: { symbol: string; price: number; timestamp: number; day_volume?: number; day_open?: number; day_high?: number; day_low?: number; day_close?: number }): void {
    this.setState({ lastMessageTime: Date.now() });

    const symbol = data.symbol;
    const callbacks = this.priceCallbacks.get(symbol);
    if (!callbacks || callbacks.size === 0) return;

    const tradeTime = Math.floor(data.timestamp / 1000); // ms → seconds
    const candleTime = Math.floor(tradeTime / 60) * 60; // Round to minute

    let agg = this.candleAggregation.get(symbol);

    if (!agg || candleTime !== agg.candleTime) {
      // New candle period
      agg = {
        candle: {
          time: candleTime,
          open: data.day_open || data.price,
          high: data.price,
          low: data.price,
          close: data.price,
          volume: data.day_volume || 0,
        },
        candleTime,
      };
    } else {
      // Update existing candle
      agg.candle = {
        time: candleTime,
        open: data.day_open || agg.candle.open,
        high: Math.max(agg.candle.high, data.price),
        low: Math.min(agg.candle.low, data.price),
        close: data.price,
        volume: data.day_volume || agg.candle.volume,
      };
    }

    this.candleAggregation.set(symbol, agg);

    const update: TwelveDataPriceUpdate = {
      symbol,
      candle: { ...agg.candle },
      price: data.price,
      source: 'trade',
    };

    for (const cb of callbacks) {
      try {
        cb(update);
      } catch (error) {
        console.error('[TradeIQ] Twelve Data WS callback error:', error);
      }
    }
  }

  private setState(partial: Partial<TwelveDataWSState>): void {
    this.state = { ...this.state, ...partial };
    for (const cb of this.stateCallbacks) {
      try {
        cb(this.state);
      } catch {
        // Ignore callback errors
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setState({
        connectionState: 'error',
        error: `Max reconnect attempts (${this.maxReconnectAttempts}) reached`,
      });
      return;
    }

    const delay = Math.min(3000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this.setState({ connectionState: 'reconnecting' });

    console.warn(`[TradeIQ] Twelve Data WS reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startKeepalive(): void {
    this.lastMessageTimestamp = Date.now();
    this.keepaliveTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Send heartbeat
        try {
          this.ws.send(JSON.stringify({ event: 'heartbeat' }));
        } catch {
          // Connection dead
        }
      }

      const elapsed = Date.now() - this.lastMessageTimestamp;
      if (elapsed > 60_000) {
        console.warn('[TradeIQ] Twelve Data WS: no message for 60s, reconnecting...');
        this.ws?.close(4000, 'Keepalive timeout');
      }
    }, 30_000);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────────

let twelveDataWSInstance: TwelveDataWS | null = null;

/**
 * Get the Twelve Data WebSocket singleton.
 * Returns null if no API key is available.
 */
export function getTwelveDataWS(apiKey?: string): TwelveDataWS | null {
  const key = apiKey || (typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_TWELVEDATA_KEY : undefined);

  if (!key) return null;

  if (!twelveDataWSInstance) {
    try {
      twelveDataWSInstance = new TwelveDataWS(key);
    } catch {
      return null;
    }
  }

  return twelveDataWSInstance;
}

/**
 * Reset the Twelve Data WS singleton (for testing).
 */
export function resetTwelveDataWS(): void {
  if (twelveDataWSInstance) {
    twelveDataWSInstance.disconnect();
    twelveDataWSInstance = null;
  }
}
