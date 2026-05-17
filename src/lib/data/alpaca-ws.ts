/**
 * Alpaca WebSocket Service — real-time stock bars, trades, and quotes.
 *
 * Why Alpaca WS for stocks?
 * - FREE IEX feed: real-time trades and quotes for US stocks
 * - WebSocket streaming: bar updates (1m, 5m, etc.), individual trades
 * - Works from US/Vercel deployments
 * - Already have Alpaca integration for broker — reuse the same API key
 *
 * Free tier (IEX feed):
 * - Real-time trades and quotes from IEX exchange
 * - Covers ~2.5% of US equity volume (IEX only on free tier)
 * - Full SIP data available for $99/mo
 * - Unlimited WebSocket connections
 *
 * Alpaca WS docs: https://docs.alpaca.markets/docs/about-market-data-api
 */

import type { Candle } from '../types';

export type AlpacaWSConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface AlpacaBarUpdate {
  symbol: string;
  timeframe: string;
  candle: Candle;
}

export type AlpacaBarCallback = (update: AlpacaBarUpdate) => void;

interface AlpacaWSBarMessage {
  T: 'b';           // Message type: bar
  S: string;         // Symbol
  o: number;         // Open
  h: number;         // High
  l: number;         // Low
  c: number;         // Close
  v: number;         // Volume
  t: string;         // Start time ISO string
  n: number;         // Number of trades in bar
  vw: number;        // VWAP
}

interface AlpacaWSTradeMessage {
  T: 't';           // Message type: trade
  S: string;         // Symbol
  p: number;         // Price
  s: number;         // Size
  t: string;         // Timestamp ISO string
  i: number;         // Trade ID
}

interface AlpacaWSQuoteMessage {
  T: 'q';           // Message type: quote
  S: string;         // Symbol
  bp: number;        // Bid price
  bs: number;        // Bid size
  ap: number;        // Ask price
  as: number;        // Ask size
  t: string;         // Timestamp ISO string
}

// Alpaca timeframe → our format mapping
const ALPACA_BAR_SIZES: Record<string, string> = {
  '1m': '1Min',
  '5m': '5Min',
  '15m': '15Min',
  '1H': '1Hour',
  '4H': '4Hour',
  '1D': '1Day',
};

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

/**
 * AlpacaWebSocket — client-side WebSocket for real-time stock data.
 *
 * Connects to Alpaca's market data stream (IEX feed on free tier).
 * Provides bar updates (candles), trades, and quotes.
 */
export class AlpacaWebSocket {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private apiSecret: string;
  private isPaper: boolean;
  private barCallback: AlpacaBarCallback | null = null;
  private connectionState: AlpacaWSConnectionState = 'disconnected';
  private currentSymbol: string | null = null;
  private currentTimeframe: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(apiKey: string, apiSecret: string, isPaper: boolean = true) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.isPaper = isPaper;
  }

  /**
   * Subscribe to real-time bar updates for a stock symbol.
   */
  subscribe(symbol: string, timeframe: string, callback: AlpacaBarCallback): void {
    this.unsubscribe();
    this.currentSymbol = symbol;
    this.currentTimeframe = timeframe;
    this.barCallback = callback;
    this.reconnectAttempts = 0;
    this.connect();
  }

  /**
   * Unsubscribe and clean up.
   */
  unsubscribe(): void {
    this.cleanup();
    this.currentSymbol = null;
    this.currentTimeframe = null;
    this.barCallback = null;
    this.setConnectionState('disconnected');
  }

  /**
   * Get current connection state.
   */
  getState(): AlpacaWSConnectionState {
    return this.connectionState;
  }

  /**
   * Dispose permanently.
   */
  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
  }

  // ─── Private Methods ───────────────────────────────────────────────

  private getWSUrl(): string {
    // IEX stream (free) vs SIP stream (paid)
    // Free: wss://stream.data.alpaca.markets/v2/iex
    // Paid: wss://stream.data.alpaca.markets/v2/sip
    if (this.isPaper) {
      return 'wss://stream.data.alpaca.markets/v2/iex';
    }
    return 'wss://stream.data.alpaca.markets/v2/sip';
  }

  private connect(): void {
    if (this.disposed) return;
    if (!this.currentSymbol) return;

    this.setConnectionState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    const url = this.getWSUrl();

    try {
      this.ws = new WebSocket(url);
    } catch (error) {
      console.warn('[TradeIQ AlpacaWS] Failed to create WebSocket:', error);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      if (this.disposed) return;
      console.log('[TradeIQ AlpacaWS] Connected to', url);

      // Authenticate
      this.ws!.send(JSON.stringify({
        action: 'auth',
        key: this.apiKey,
        secret: this.apiSecret,
      }));
    };

    this.ws.onmessage = (event: MessageEvent) => {
      if (this.disposed) return;

      try {
        const messages = JSON.parse(event.data as string);
        // Alpaca sends arrays of messages
        const msgArray = Array.isArray(messages) ? messages : [messages];

        for (const msg of msgArray) {
          this.handleMessage(msg);
        }
      } catch (error) {
        console.warn('[TradeIQ AlpacaWS] Failed to parse message:', error);
      }
    };

    this.ws.onerror = (event) => {
      console.warn('[TradeIQ AlpacaWS] Error:', event);
    };

    this.ws.onclose = (event) => {
      if (this.disposed) return;
      console.warn(`[TradeIQ AlpacaWS] Closed (code=${event.code})`);
      this.cleanupConnection();

      if (this.currentSymbol) {
        this.scheduleReconnect();
      }
    };
  }

  private handleMessage(msg: Record<string, unknown>): void {
    // Handle authentication response
    if (msg.T === 'success' && msg.msg === 'authenticated') {
      console.log('[TradeIQ AlpacaWS] Authenticated successfully');
      this.setConnectionState('connected');
      this.reconnectAttempts = 0;

      // Subscribe to bars for the current symbol
      if (this.currentSymbol && this.currentTimeframe) {
        const barSize = ALPACA_BAR_SIZES[this.currentTimeframe] || '1Min';
        this.ws?.send(JSON.stringify({
          action: 'subscribe',
          bars: [{ symbol: this.currentSymbol, timeframe: barSize }],
        }));
      }
      return;
    }

    if (msg.T === 'error') {
      console.warn('[TradeIQ AlpacaWS] Error:', msg.msg || msg.code);
      return;
    }

    if (msg.T === 'subscription') {
      console.log('[TradeIQ AlpacaWS] Subscribed:', JSON.stringify(msg));
      return;
    }

    // Handle bar updates
    if (msg.T === 'b' && this.barCallback && this.currentSymbol) {
      const barMsg = msg as unknown as AlpacaWSBarMessage;
      if (barMsg.S === this.currentSymbol) {
        const candle: Candle = {
          time: Math.floor(new Date(barMsg.t).getTime() / 1000),
          open: barMsg.o,
          high: barMsg.h,
          low: barMsg.l,
          close: barMsg.c,
          volume: barMsg.v,
        };

        this.barCallback({
          symbol: this.currentSymbol,
          timeframe: this.currentTimeframe || '1m',
          candle,
        });
      }
    }

    // Trade and quote messages are available for future use
    // (order flow analysis, tick-by-tick updates, etc.)
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[TradeIQ AlpacaWS] Max reconnect attempts reached`);
      this.setConnectionState('disconnected');
      return;
    }

    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY
    );
    this.reconnectAttempts++;
    this.setConnectionState('reconnecting');

    console.log(`[TradeIQ AlpacaWS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

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

  private setConnectionState(state: AlpacaWSConnectionState): void {
    if (this.connectionState === state) return;
    this.connectionState = state;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────

let alpacaWsInstance: AlpacaWebSocket | null = null;

/**
 * Get or create the shared Alpaca WebSocket instance.
 * Returns null if Alpaca API keys are not configured.
 */
export function getAlpacaWS(): AlpacaWebSocket | null {
  const apiKey = process.env.NEXT_PUBLIC_ALPACA_API_KEY || '';
  const apiSecret = process.env.NEXT_PUBLIC_ALPACA_API_SECRET || '';

  if (!apiKey || !apiSecret) return null;

  if (!alpacaWsInstance) {
    alpacaWsInstance = new AlpacaWebSocket(apiKey, apiSecret, true);
  }
  return alpacaWsInstance;
}

/**
 * Dispose of the shared Alpaca WebSocket instance.
 */
export function disposeAlpacaWS(): void {
  if (alpacaWsInstance) {
    alpacaWsInstance.dispose();
    alpacaWsInstance = null;
  }
}
