/**
 * Binance WebSocket Service — real-time kline/candle streaming.
 *
 * Connects to Binance's WebSocket API to receive live candle updates
 * every 1-2 seconds. This is the key to making the chart feel "alive"
 * like TradingView or IQ Option.
 *
 * Features:
 * - Auto-reconnect with exponential backoff (1s → 2s → 4s → 8s → max 30s)
 * - Connection state tracking (connecting → connected → disconnected)
 * - Graceful cleanup on symbol/timeframe change
 * - Supports all Binance kline intervals (1m, 5m, 15m, 1h, 4h, 1d, 1w)
 * - Works with both binance.com and binance.us WebSocket endpoints
 *
 * Usage:
 * ```ts
 * const ws = new BinanceKlineWS();
 * ws.subscribe('BTCUSDT', '1m', (candle) => {
 *   console.log('Live candle update:', candle);
 * });
 * // Later...
 * ws.unsubscribe();
 * ```
 *
 * Binance WebSocket docs:
 * https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-streams
 */

import type { Candle } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

export type WSConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface LiveCandleUpdate {
  /** The candle data (partial if still open, complete if closed) */
  candle: Candle;
  /** Whether this candle is closed (final) or still forming */
  isClosed: boolean;
  /** The symbol this update is for */
  symbol: string;
  /** The interval/timeframe */
  interval: string;
}

export type KlineCallback = (update: LiveCandleUpdate) => void;

export interface WSState {
  connectionState: WSConnectionState;
  symbol: string | null;
  interval: string | null;
  reconnectAttempts: number;
  lastMessageTime: number | null;
  latencyMs: number | null;
}

// ─── Binance kline message format ────────────────────────────────────────────

interface BinanceKlineMessage {
  e: string;  // Event type ("kline")
  E: number;  // Event time (ms)
  s: string;  // Symbol
  k: {
    t: number;  // Kline start time (ms)
    T: number;  // Kline close time (ms)
    s: string;  // Symbol
    i: string;  // Interval
    f: number;  // First trade ID
    L: number;  // Last trade ID
    o: string;  // Open price
    c: string;  // Close price
    h: string;  // High price
    l: string;  // Low price
    v: string;  // Base asset volume
    n: number;  // Number of trades
    x: boolean; // Is this kline closed?
    q: string;  // Quote asset volume
    V: string;  // Taker buy base asset volume
    Q: string;  // Taker buy quote asset volume
    B: string;  // Ignore
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WS_URLS = [
  'wss://stream.binance.com:9443/ws',
  'wss://stream.binance.us:9443/ws',
];

const MAX_RECONNECT_ATTEMPTS = 20;
const BASE_RECONNECT_DELAY = 1000; // 1s
const MAX_RECONNECT_DELAY = 30000; // 30s
const PING_INTERVAL = 30000; // Binance recommends pinging every 30s
const CONNECTION_TIMEOUT = 10000; // 10s to establish connection

/**
 * Convert our timeframe format to Binance WebSocket interval format.
 * Our format: '1m', '5m', '15m', '1H', '4H', '1D', '1W'
 * Binance WS: '1m', '5m', '15m', '1h', '4h', '1d', '1w'
 */
function toWSInterval(interval: string): string {
  const map: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '1H': '1h',
    '4H': '4h',
    '1D': '1d',
    '1W': '1w',
  };
  return map[interval] || '1d';
}

/**
 * Convert symbol to Binance pair format (uppercase, with USDT suffix).
 * 'BTC' → 'btcusdt', 'ETHUSDT' → 'ethusdt'
 */
function toWSSymbol(symbol: string): string {
  const upper = symbol.toUpperCase();
  const pair = upper.endsWith('USDT') || upper.endsWith('BUSD') ? upper : `${upper}USDT`;
  return pair.toLowerCase();
}

/**
 * Check if a symbol is suitable for Binance WebSocket (crypto only).
 */
export function isWSCompatible(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  // Known crypto symbols or USDT/BUSD pairs
  const knownCrypto = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT',
    'AVAX', 'MATIC', 'LINK', 'UNI', 'ATOM', 'LTC', 'NEAR', 'AAVE', 'ARB', 'OP',
    'APT', 'SUI', 'SHIB', 'PEPE', 'FIL', 'IMX', 'INJ', 'TIA', 'SEI', 'FET'];
  return knownCrypto.includes(upper) || upper.endsWith('USDT') || upper.endsWith('BUSD');
}

// ─── BinanceKlineWS Class ────────────────────────────────────────────────────

export class BinanceKlineWS {
  private ws: WebSocket | null = null;
  private callback: KlineCallback | null = null;
  private stateChangeCallbacks: ((state: WSState) => void)[] = [];
  private currentSymbol: string | null = null;
  private currentInterval: string | null = null;
  private connectionState: WSConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMessageTime: number | null = null;
  private latencyMs: number | null = null;
  private activeUrlIndex = 0;
  private disposed = false;

  /**
   * Subscribe to real-time kline updates for a symbol and interval.
   * Automatically disconnects from any previous subscription.
   */
  subscribe(symbol: string, interval: string, callback: KlineCallback): void {
    // Unsubscribe from any existing stream
    this.unsubscribe();

    this.currentSymbol = symbol;
    this.currentInterval = interval;
    this.callback = callback;
    this.reconnectAttempts = 0;

    this.connect();
  }

  /**
   * Unsubscribe from the current stream and clean up.
   */
  unsubscribe(): void {
    this.cleanup();
    this.currentSymbol = null;
    this.currentInterval = null;
    this.callback = null;
    this.setConnectionState('disconnected');
  }

  /**
   * Register a callback for connection state changes.
   */
  onStateChange(callback: (state: WSState) => void): () => void {
    this.stateChangeCallbacks.push(callback);
    // Immediately call with current state
    callback(this.getState());
    // Return unsubscribe function
    return () => {
      this.stateChangeCallbacks = this.stateChangeCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Get the current WebSocket state.
   */
  getState(): WSState {
    return {
      connectionState: this.connectionState,
      symbol: this.currentSymbol,
      interval: this.currentInterval,
      reconnectAttempts: this.reconnectAttempts,
      lastMessageTime: this.lastMessageTime,
      latencyMs: this.latencyMs,
    };
  }

  /**
   * Dispose of the WebSocket connection permanently.
   * After calling this, the instance should not be reused.
   */
  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
  }

  // ─── Private Methods ───────────────────────────────────────────────────

  private connect(): void {
    if (this.disposed) return;
    if (!this.currentSymbol || !this.currentInterval) return;

    this.setConnectionState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    const wsSymbol = toWSSymbol(this.currentSymbol);
    const wsInterval = toWSInterval(this.currentInterval);
    const streamName = `${wsSymbol}@kline_${wsInterval}`;

    // Try URLs in order, starting with the active URL index
    const url = `${WS_URLS[this.activeUrlIndex]}/${streamName}`;

    try {
      this.ws = new WebSocket(url);
    } catch (error) {
      console.error('[TradeIQ WS] Failed to create WebSocket:', error);
      this.scheduleReconnect();
      return;
    }

    // Connection timeout
    this.connectionTimer = setTimeout(() => {
      if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
        console.warn('[TradeIQ WS] Connection timeout, trying next URL...');
        this.cleanupConnection();
        this.tryNextUrl();
      }
    }, CONNECTION_TIMEOUT);

    this.ws.onopen = () => {
      if (this.disposed) return;
      console.log(`[TradeIQ WS] Connected to ${url}`);
      this.setConnectionState('connected');
      this.reconnectAttempts = 0;
      this.startPing();

      // Clear connection timeout
      if (this.connectionTimer) {
        clearTimeout(this.connectionTimer);
        this.connectionTimer = null;
      }
    };

    this.ws.onmessage = (event: MessageEvent) => {
      if (this.disposed) return;

      try {
        const data = JSON.parse(event.data as string) as BinanceKlineMessage;

        // Only process kline events
        if (data.e !== 'kline' || !data.k) return;

        const k = data.k;
        const now = Date.now();
        this.latencyMs = now - data.E;
        this.lastMessageTime = now;

        const candle: Candle = {
          time: Math.floor(k.t / 1000), // ms → seconds (Unix timestamp)
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
        };

        if (this.callback) {
          this.callback({
            candle,
            isClosed: k.x,
            symbol: this.currentSymbol!,
            interval: this.currentInterval!,
          });
        }
      } catch (error) {
        console.warn('[TradeIQ WS] Failed to parse message:', error);
      }
    };

    this.ws.onerror = (event) => {
      console.warn('[TradeIQ WS] Error:', event);
    };

    this.ws.onclose = (event) => {
      if (this.disposed) return;

      const wasConnected = this.connectionState === 'connected';
      console.warn(`[TradeIQ WS] Closed (code=${event.code}, reason=${event.reason}, wasConnected=${wasConnected})`);

      this.cleanupConnection();

      // Don't reconnect if we intentionally unsubscribed
      if (this.currentSymbol && this.currentInterval) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[TradeIQ WS] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached`);
      this.setConnectionState('disconnected');
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s, 30s, ...
    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY
    );

    this.reconnectAttempts++;
    this.setConnectionState('reconnecting');

    console.log(`[TradeIQ WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    this.reconnectTimer = setTimeout(() => {
      if (!this.disposed && this.currentSymbol && this.currentInterval) {
        // Try next URL on reconnect
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
    console.log(`[TradeIQ WS] Switching to URL index ${this.activeUrlIndex}: ${WS_URLS[this.activeUrlIndex]}`);
    this.connect();
  }

  private startPing(): void {
    // Binance doesn't require ping/pong, but it's good practice
    // to detect dead connections. We send a ping frame periodically.
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Check if we've received any message in the last 60s
        if (this.lastMessageTime && Date.now() - this.lastMessageTime > 60000) {
          console.warn('[TradeIQ WS] No messages for 60s, reconnecting...');
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
    if (this.ws) {
      // Remove handlers before closing to prevent onclose from triggering reconnect
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;

      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        try {
          this.ws.close(1000, 'Cleanup');
        } catch {
          // Ignore close errors
        }
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

  private setConnectionState(state: WSConnectionState): void {
    if (this.connectionState === state) return;
    this.connectionState = state;
    this.notifyStateChange();
  }

  private notifyStateChange(): void {
    const state = this.getState();
    for (const cb of this.stateChangeCallbacks) {
      try {
        cb(state);
      } catch (error) {
        console.warn('[TradeIQ WS] State callback error:', error);
      }
    }
  }
}

// ─── Singleton for app-wide use ──────────────────────────────────────────────

let wsInstance: BinanceKlineWS | null = null;

/**
 * Get the shared BinanceKlineWS instance.
 * This ensures we only have one WebSocket connection at a time.
 */
export function getBinanceWS(): BinanceKlineWS {
  if (!wsInstance) {
    wsInstance = new BinanceKlineWS();
  }
  return wsInstance;
}

/**
 * Dispose of the shared WebSocket instance.
 * Call this when the app is shutting down or the user navigates away.
 */
export function disposeBinanceWS(): void {
  if (wsInstance) {
    wsInstance.dispose();
    wsInstance = null;
  }
}
