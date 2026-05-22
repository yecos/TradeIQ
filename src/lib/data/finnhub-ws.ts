/**
 * Finnhub WebSocket — Real-time stock, forex, and crypto price streaming.
 *
 * Free tier:
 * - US stocks: real-time trades via WebSocket
 * - Forex: real-time quotes
 * - Crypto: real-time trades
 * - Unlimited WS connections
 *
 * UPDATED: Now supports multi-symbol subscriptions.
 * You can subscribe to multiple symbols simultaneously and receive
 * individual trade updates per symbol.
 *
 * Finnhub WS docs: https://finnhub.io/docs/api/websocket-trades
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
  /** Track all subscribed symbols for reconnection */
  private subscribedSymbols = new Set<string>();

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

  // Candle aggregation per symbol
  private candleAggregation = new Map<string, {
    candle: Candle;
    candleTime: number;
  }>();

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

      // Re-subscribe all symbols after connection
      if (this.subscribedSymbols.size > 0) {
        for (const symbol of this.subscribedSymbols) {
          this.sendSubscribe(symbol);
        }
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
   * Subscribe to real-time trades for a single symbol.
   * The symbol is added to the subscription set and will be
   * re-subscribed on reconnection.
   */
  subscribe(symbol: string, callback: TradeCallback): void {
    // Store callback
    if (!this.tradeCallbacks.has(symbol)) {
      this.tradeCallbacks.set(symbol, new Set());
    }
    this.tradeCallbacks.get(symbol)!.add(callback);

    // Track symbol
    this.subscribedSymbols.add(symbol);
    this.setState({ symbol });

    // Connect if needed
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.connect();
    } else if (this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscribe(symbol);
    }
  }

  /**
   * Subscribe to multiple symbols at once.
   * More efficient than calling subscribe() for each symbol
   * because it only connects once.
   */
  subscribeMulti(symbols: string[], callback: TradeCallback): void {
    // Store callbacks for all symbols
    for (const symbol of symbols) {
      if (!this.tradeCallbacks.has(symbol)) {
        this.tradeCallbacks.set(symbol, new Set());
      }
      this.tradeCallbacks.get(symbol)!.add(callback);
      this.subscribedSymbols.add(symbol);
    }

    this.setState({ symbol: symbols.join(',') });

    // Connect if needed
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.connect();
    } else if (this.ws.readyState === WebSocket.OPEN) {
      for (const symbol of symbols) {
        this.sendSubscribe(symbol);
      }
    }
  }

  /**
   * Unsubscribe from a specific symbol.
   * If no symbols remain, disconnects.
   */
  unsubscribeSymbol(symbol: string): void {
    // Remove callback for this symbol
    this.tradeCallbacks.delete(symbol);
    this.subscribedSymbols.delete(symbol);
    this.candleAggregation.delete(symbol);

    // Send unsubscribe to server
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendUnsubscribe(symbol);
    }

    // Update state
    if (this.subscribedSymbols.size === 0) {
      this.disconnect();
    } else {
      this.setState({ symbol: [...this.subscribedSymbols].join(',') });
    }
  }

  /**
   * Unsubscribe from all symbols.
   */
  unsubscribe(): void {
    // Unsubscribe all symbols from server
    if (this.ws?.readyState === WebSocket.OPEN) {
      for (const symbol of this.subscribedSymbols) {
        this.sendUnsubscribe(symbol);
      }
    }

    this.tradeCallbacks.clear();
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
  getState(): FinnhubWSState {
    return { ...this.state };
  }

  /**
   * Get currently subscribed symbols.
   */
  getSubscribedSymbols(): Set<string> {
    return new Set(this.subscribedSymbols);
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

      // Aggregate into a 1-minute candle per symbol
      const tradeTime = Math.floor(trade.t / 1000); // ms → seconds
      const candleTime = Math.floor(tradeTime / 60) * 60; // Round to minute

      let agg = this.candleAggregation.get(symbol);

      if (!agg || candleTime !== agg.candleTime) {
        agg = {
          candle: {
            time: candleTime,
            open: trade.p,
            high: trade.p,
            low: trade.p,
            close: trade.p,
            volume: trade.v,
          },
          candleTime,
        };
      } else {
        agg.candle = {
          time: candleTime,
          open: agg.candle.open,
          high: Math.max(agg.candle.high, trade.p),
          low: Math.min(agg.candle.low, trade.p),
          close: trade.p,
          volume: agg.candle.volume + trade.v,
        };
      }

      this.candleAggregation.set(symbol, agg);

      const update: FinnhubTradeUpdate = {
        symbol,
        candle: { ...agg.candle },
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
let finnhubKeyPromise: Promise<string | null> | null = null;

/**
 * Fetch the Finnhub API key from the server-side API route.
 * This allows the WS to work even when NEXT_PUBLIC_FINNHUB_KEY is not set
 * (the key can be FINNHUB_API_KEY on the server instead).
 * Caches the result so we only fetch once.
 */
async function fetchFinnhubKey(): Promise<string | null> {
  if (finnhubKeyPromise) return finnhubKeyPromise;

  finnhubKeyPromise = (async () => {
    try {
      const res = await fetch('/api/finnhub/key');
      if (!res.ok) return null;
      const data = await res.json();
      return data.key || null;
    } catch {
      return null;
    }
  })();

  return finnhubKeyPromise;
}

/**
 * Get the Finnhub WebSocket singleton.
 * Returns null if no API key is available.
 *
 * Checks: apiKey param → NEXT_PUBLIC_FINNHUB_KEY (client env) → /api/finnhub/key (server env)
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
 * Get Finnhub WS with async key resolution.
 * Tries NEXT_PUBLIC_FINNHUB_KEY first, then fetches from /api/finnhub/key.
 * Use this in useEffect hooks that can handle async initialization.
 */
export async function getFinnhubWSAsync(): Promise<FinnhubWebSocket | null> {
  // Try direct key first
  const directKey = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_FINNHUB_KEY : undefined;
  if (directKey) {
    return getFinnhubWS(directKey);
  }

  // Try fetching from API
  const fetchedKey = await fetchFinnhubKey();
  if (fetchedKey) {
    return getFinnhubWS(fetchedKey);
  }

  return null;
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
