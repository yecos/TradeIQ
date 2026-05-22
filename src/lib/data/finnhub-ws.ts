/**
 * Finnhub WebSocket — Real-time stock, forex, and crypto price streaming.
 *
 * Free tier:
 * - US stocks: real-time trades via WebSocket
 * - Forex: real-time quotes
 * - Crypto: real-time trades
 * - Unlimited WS connections
 *
 * Finnhub WS docs: https://finnhub.io/docs/api/websocket-trades
 *
 * Usage:
 *   const ws = getFinnhubWS('YOUR_API_KEY');
 *   ws.subscribe('AAPL', (update) => { ... });
 *   ws.unsubscribe();
 */

'use client';

import type { Candle } from '../types';

// ─── Types ───────────────────────────────────────────────────────────

export interface FinnhubTradeUpdate {
  symbol: string;
  candle: Candle;
  /** Trade price (same as candle.close) */
  price: number;
  /** Trade volume */
  volume: number;
  /** Source of the update */
  source: 'trade';
}

export interface FinnhubWSState {
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  lastMessageTime: number | null;
  symbol: string | null;
  error: string | null;
}

type StateCallback = (state: FinnhubWSState) => void;
type TradeCallback = (update: FinnhubTradeUpdate) => void;

// ─── Finnhub WS Message Types ────────────────────────────────────────

interface FinnhubWSTrade {
  p: number;  // Price
  s: string;  // Symbol
  t: number;  // Timestamp (ms)
  v: number;  // Volume
}

interface FinnhubWSMessage {
  type: 'trade' | 'ping' | 'error' | 'sucess'; // Finnhub has a typo "sucess"
  data?: FinnhubWSTrade[];
  msg?: string;
}

// ─── Finnhub WebSocket Client ────────────────────────────────────────

class FinnhubWebSocket {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private state: FinnhubWSState = {
    connectionState: 'disconnected',
    lastMessageTime: null,
    symbol: null,
    error: null,
  };
  private stateCallbacks = new Set<StateCallback>();
  private tradeCallbacks = new Map<string, Set<TradeCallback>>();

  // Reconnection
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isIntentionalClose = false;

  // Keepalive
  private lastMessageTimestamp = 0;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private readonly KEEPALIVE_INTERVAL = 30_000; // Check every 30s
  private readonly KEEPALIVE_TIMEOUT = 60_000; // No message for 60s = dead

  // Current candle aggregation
  private currentCandle: Candle | null = null;
  private currentCandleTime = 0;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('Finnhub API key is required for WebSocket');
    this.apiKey = apiKey;
  }

  /**
   * Connect to Finnhub WebSocket.
   */
  private connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.isIntentionalClose = false;
    this.setState({ connectionState: 'connecting', error: null });

    try {
      this.ws = new WebSocket(`wss://ws.finnhub.io?token=${this.apiKey}`);
    } catch (error) {
      this.setState({
        connectionState: 'error',
        error: `Failed to create WebSocket: ${error instanceof Error ? error.message : 'unknown'}`,
      });
      return;
    }

    this.ws.onopen = () => {
      console.warn('[TradeIQ] Finnhub WS connected');
      this.reconnectAttempts = 0;
      this.setState({ connectionState: 'connected', error: null });

      // Re-subscribe if we had a symbol
      if (this.state.symbol) {
        this.sendSubscribe(this.state.symbol);
      }

      this.startKeepalive();
    };

    this.ws.onmessage = (event) => {
      this.lastMessageTimestamp = Date.now();

      try {
        const msg: FinnhubWSMessage = JSON.parse(event.data);

        if (msg.type === 'ping') return;

        if (msg.type === 'error') {
          console.error('[TradeIQ] Finnhub WS error:', msg.msg);
          this.setState({ error: msg.msg || 'Unknown error' });
          return;
        }

        if (msg.type === 'trade' && msg.data) {
          this.handleTrades(msg.data);
        }
      } catch {
        // Non-JSON message (ping), ignore
      }
    };

    this.ws.onclose = (event) => {
      this.stopKeepalive();
      console.warn(`[TradeIQ] Finnhub WS closed: code=${event.code} reason=${event.reason}`);

      if (!this.isIntentionalClose) {
        this.scheduleReconnect();
      } else {
        this.setState({ connectionState: 'disconnected' });
      }
    };

    this.ws.onerror = () => {
      console.error('[TradeIQ] Finnhub WS error');
      this.setState({
        connectionState: 'error',
        error: 'WebSocket connection error',
      });
    };
  }

  /**
   * Subscribe to real-time trades for a symbol.
   */
  subscribe(symbol: string, callback: TradeCallback): void {
    // Store callback
    if (!this.tradeCallbacks.has(symbol)) {
      this.tradeCallbacks.set(symbol, new Set());
    }
    this.tradeCallbacks.get(symbol)!.add(callback);

    // Update state
    this.setState({ symbol });

    // Connect if needed
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.connect();
    } else if (this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscribe(symbol);
    }
  }

  /**
   * Unsubscribe from current symbol.
   */
  unsubscribe(): void {
    if (this.state.symbol && this.ws?.readyState === WebSocket.OPEN) {
      this.sendUnsubscribe(this.state.symbol);
    }

    this.tradeCallbacks.clear();
    this.currentCandle = null;
    this.currentCandleTime = 0;
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
  getState(): FinnhubWSState {
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

  private sendSubscribe(symbol: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', symbol }));
    }
  }

  private sendUnsubscribe(symbol: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'unsubscribe', symbol }));
    }
  }

  /**
   * Handle incoming trades — aggregate into candle and notify.
   */
  private handleTrades(trades: FinnhubWSTrade[]): void {
    this.setState({ lastMessageTime: Date.now() });

    for (const trade of trades) {
      const symbol = trade.s;
      const callbacks = this.tradeCallbacks.get(symbol);
      if (!callbacks || callbacks.size === 0) continue;

      // Aggregate into a 1-minute candle
      const tradeTime = Math.floor(trade.t / 1000); // ms → seconds
      const candleTime = Math.floor(tradeTime / 60) * 60; // Round to minute

      if (candleTime !== this.currentCandleTime || this.currentCandle === null) {
        // New candle period
        this.currentCandle = {
          time: candleTime,
          open: trade.p,
          high: trade.p,
          low: trade.p,
          close: trade.p,
          volume: trade.v,
        };
        this.currentCandleTime = candleTime;
      } else {
        // Update existing candle
        this.currentCandle = {
          time: candleTime,
          open: this.currentCandle.open,
          high: Math.max(this.currentCandle.high, trade.p),
          low: Math.min(this.currentCandle.low, trade.p),
          close: trade.p,
          volume: this.currentCandle.volume + trade.v,
        };
      }

      const update: FinnhubTradeUpdate = {
        symbol,
        candle: { ...this.currentCandle },
        price: trade.p,
        volume: trade.v,
        source: 'trade',
      };

      for (const cb of callbacks) {
        try {
          cb(update);
        } catch (error) {
          console.error('[TradeIQ] Finnhub WS callback error:', error);
        }
      }
    }
  }

  private setState(partial: Partial<FinnhubWSState>): void {
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

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 15000);
    this.reconnectAttempts++;
    this.setState({ connectionState: 'reconnecting' });

    console.warn(`[TradeIQ] Finnhub WS reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startKeepalive(): void {
    this.lastMessageTimestamp = Date.now();
    this.keepaliveTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastMessageTimestamp;
      if (elapsed > this.KEEPALIVE_TIMEOUT) {
        console.warn('[TradeIQ] Finnhub WS: no message for 60s, reconnecting...');
        this.ws?.close(4000, 'Keepalive timeout');
      }
    }, this.KEEPALIVE_INTERVAL);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────────

let finnhubWSInstance: FinnhubWebSocket | null = null;

/**
 * Get the Finnhub WebSocket singleton.
 * Returns null if no API key is available.
 */
export function getFinnhubWS(apiKey?: string): FinnhubWebSocket | null {
  const key = apiKey || (typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_FINNHUB_KEY : undefined);

  if (!key) return null;

  if (!finnhubWSInstance) {
    try {
      finnhubWSInstance = new FinnhubWebSocket(key);
    } catch {
      return null;
    }
  }

  return finnhubWSInstance;
}

/**
 * Reset the Finnhub WS singleton (for testing).
 */
export function resetFinnhubWS(): void {
  if (finnhubWSInstance) {
    finnhubWSInstance.disconnect();
    finnhubWSInstance = null;
  }
}
