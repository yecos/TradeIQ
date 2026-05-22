/**
 * Binance Mini-Ticker WebSocket — Real-time price streaming for ALL crypto symbols.
 *
 * Uses the `!miniTicker@arr` stream which pushes price updates for all Binance
 * pairs every ~1 second. This is perfect for watchlist-style multi-symbol updates
 * without needing individual kline subscriptions per symbol.
 *
 * No API key required. Works with binance.com globally.
 *
 * Binance WebSocket docs:
 * https://binance-docs.github.io/apidocs/spot/en/#individual-symbol-mini-ticker-stream
 */

'use client';

// ─── Types ───────────────────────────────────────────────────────────

export interface BinanceMiniTicker {
  /** Symbol e.g. "BTCUSDT" */
  symbol: string;
  /** Close price */
  close: number;
  /** Open price */
  open: number;
  /** High price */
  high: number;
  /** Low price */
  low: number;
  /** Volume in base asset */
  volume: number;
  /** Quote asset volume (USDT volume) */
  quoteVolume: number;
  /** Event time (ms) */
  eventTime: number;
}

export type BinanceTickerCallback = (tickers: BinanceMiniTicker[]) => void;

export interface BinanceTickerWSState {
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  lastMessageTime: number | null;
  symbolsCount: number;
}

type StateCallback = (state: BinanceTickerWSState) => void;

// ─── Binance mini-ticker message format ──────────────────────────────

interface BinanceMiniTickerMessage {
  e: string;   // Event type: "24hrMiniTicker"
  E: number;   // Event time (ms)
  s: string;   // Symbol
  c: string;   // Close price
  o: string;   // Open price
  h: string;   // High price
  l: string;   // Low price
  v: string;   // Total traded base asset volume
  q: string;   // Total traded quote asset volume
}

// ─── Constants ───────────────────────────────────────────────────────

const WS_URLS = [
  'wss://stream.binance.com:9443/ws/!miniTicker@arr',
  'wss://stream.binance.us:9443/ws/!miniTicker@arr',
];

const MAX_RECONNECT_ATTEMPTS = 15;
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const CONNECTION_TIMEOUT = 10000;
const FIRST_MESSAGE_TIMEOUT = 15000;
const PING_INTERVAL = 30000;
const STALE_TIMEOUT = 60000;

// ─── BinanceTickerWS Class ──────────────────────────────────────────

class BinanceTickerWS {
  private ws: WebSocket | null = null;
  private callback: BinanceTickerCallback | null = null;
  private stateCallbacks = new Set<StateCallback>();
  private connectionState: BinanceTickerWSState['connectionState'] = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;
  private firstMessageTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMessageTime: number | null = null;
  private activeUrlIndex = 0;
  private disposed = false;
  private hasReceivedFirstMessage = false;
  private lastSymbolCount = 0;

  /**
   * Subscribe to real-time mini-ticker updates for all symbols.
   */
  subscribe(callback: BinanceTickerCallback): void {
    if (this.connectionState === 'connected' && this.callback) {
      // Already connected, just update callback
      this.callback = callback;
      return;
    }

    this.callback = callback;
    this.reconnectAttempts = 0;
    this.connect();
  }

  /**
   * Unsubscribe and disconnect.
   */
  unsubscribe(): void {
    this.cleanup();
    this.callback = null;
    this.setConnectionState('disconnected');
  }

  /**
   * Get current state.
   */
  getState(): BinanceTickerWSState {
    return {
      connectionState: this.connectionState,
      lastMessageTime: this.lastMessageTime,
      symbolsCount: this.lastSymbolCount,
    };
  }

  /**
   * Listen for state changes.
   */
  onStateChange(callback: StateCallback): () => void {
    this.stateCallbacks.add(callback);
    callback(this.getState());
    return () => this.stateCallbacks.delete(callback);
  }

  /**
   * Dispose permanently.
   */
  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
  }

  // ─── Private Methods ──────────────────────────────────────────────

  private connect(): void {
    if (this.disposed) return;

    this.setConnectionState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    const url = WS_URLS[this.activeUrlIndex];

    try {
      this.ws = new WebSocket(url);
    } catch (error) {
      console.warn('[TradeIQ Ticker WS] Failed to create WebSocket:', error);
      this.scheduleReconnect();
      return;
    }

    // Connection timeout
    this.connectionTimer = setTimeout(() => {
      if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
        console.warn('[TradeIQ Ticker WS] Connection timeout, trying next URL...');
        this.cleanupConnection();
        this.tryNextUrl();
      }
    }, CONNECTION_TIMEOUT);

    this.ws.onopen = () => {
      if (this.disposed) return;
      console.warn('[TradeIQ Ticker WS] Connected to', url);
      this.setConnectionState('connected');
      this.reconnectAttempts = 0;
      this.hasReceivedFirstMessage = false;
      this.startPing();

      if (this.connectionTimer) {
        clearTimeout(this.connectionTimer);
        this.connectionTimer = null;
      }

      // First message timeout
      this.firstMessageTimer = setTimeout(() => {
        if (!this.hasReceivedFirstMessage && this.ws?.readyState === WebSocket.OPEN) {
          console.warn('[TradeIQ Ticker WS] No first message, trying next URL...');
          this.cleanupConnection();
          this.tryNextUrl();
        }
      }, FIRST_MESSAGE_TIMEOUT);
    };

    this.ws.onmessage = (event: MessageEvent) => {
      if (this.disposed) return;

      try {
        const data = JSON.parse(event.data as string) as BinanceMiniTickerMessage[];

        if (!Array.isArray(data)) return;

        this.hasReceivedFirstMessage = true;
        if (this.firstMessageTimer) {
          clearTimeout(this.firstMessageTimer);
          this.firstMessageTimer = null;
        }

        const now = Date.now();
        this.lastMessageTime = now;

        // Convert to our format — only include USDT pairs
        const tickers: BinanceMiniTicker[] = [];
        for (const msg of data) {
          if (msg.e !== '24hrMiniTicker') continue;
          // Only include USDT pairs (most liquid, what our app uses)
          if (!msg.s.endsWith('USDT') && !msg.s.endsWith('BUSD')) continue;

          tickers.push({
            symbol: msg.s,
            close: parseFloat(msg.c),
            open: parseFloat(msg.o),
            high: parseFloat(msg.h),
            low: parseFloat(msg.l),
            volume: parseFloat(msg.v),
            quoteVolume: parseFloat(msg.q),
            eventTime: msg.E,
          });
        }

        this.lastSymbolCount = tickers.length;

        if (this.callback && tickers.length > 0) {
          this.callback(tickers);
        }
      } catch (error) {
        console.warn('[TradeIQ Ticker WS] Failed to parse message:', error);
      }
    };

    this.ws.onerror = () => {
      console.warn('[TradeIQ Ticker WS] Error');
    };

    this.ws.onclose = (event) => {
      if (this.disposed) return;
      const wasConnected = this.connectionState === 'connected';
      console.warn(`[TradeIQ Ticker WS] Closed (code=${event.code}, wasConnected=${wasConnected})`);
      this.cleanupConnection();

      if (!wasConnected) {
        this.tryNextUrl();
      } else {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[TradeIQ Ticker WS] Max reconnect attempts reached');
      this.setConnectionState('disconnected');
      return;
    }

    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY
    );
    this.reconnectAttempts++;
    this.setConnectionState('reconnecting');

    console.warn(`[TradeIQ Ticker WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    this.reconnectTimer = setTimeout(() => {
      if (!this.disposed) {
        if (this.reconnectAttempts % 3 === 0) {
          this.tryNextUrl();
        } else {
          this.connect();
        }
      }
    }, delay);
  }

  private tryNextUrl(): void {
    this.activeUrlIndex = (this.activeUrlIndex + 1) % WS_URLS.length;
    console.warn(`[TradeIQ Ticker WS] Switching to URL index ${this.activeUrlIndex}`);
    this.connect();
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        if (this.lastMessageTime && Date.now() - this.lastMessageTime > STALE_TIMEOUT) {
          console.warn('[TradeIQ Ticker WS] No messages for 60s, reconnecting...');
          this.cleanupConnection();
          this.scheduleReconnect();
        }
      }
    }, PING_INTERVAL);
  }

  private cleanupConnection(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
    if (this.firstMessageTimer) {
      clearTimeout(this.firstMessageTimer);
      this.firstMessageTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        try { this.ws.close(1000, 'Cleanup'); } catch { /* ignore */ }
      }
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

  private setConnectionState(state: BinanceTickerWSState['connectionState']): void {
    if (this.connectionState === state) return;
    this.connectionState = state;
    const fullState = this.getState();
    for (const cb of this.stateCallbacks) {
      try { cb(fullState); } catch { /* ignore */ }
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────────

let tickerInstance: BinanceTickerWS | null = null;

/**
 * Get the shared BinanceTickerWS instance.
 */
export function getBinanceTickerWS(): BinanceTickerWS {
  if (!tickerInstance) {
    tickerInstance = new BinanceTickerWS();
  }
  return tickerInstance;
}

/**
 * Dispose of the shared instance.
 */
export function disposeBinanceTickerWS(): void {
  if (tickerInstance) {
    tickerInstance.dispose();
    tickerInstance = null;
  }
}
