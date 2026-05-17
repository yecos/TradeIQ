import type { VectorSignal } from '../types';

/**
 * Order Flow Analysis Module — Market microstructure analysis.
 *
 * For crypto: Uses Binance order book API (free, no auth)
 * For stocks: Uses simulated data based on price/volume patterns
 *
 * Features:
 * - Order book depth visualization (bid/ask imbalance)
 * - Cumulative delta (buy vs sell volume over time)
 * - Absorption detection (large resting orders absorbing market orders)
 * - Large order detection (whale activity)
 */

export interface OrderBookLevel {
  price: number;
  quantity: number;
  total: number; // Cumulative total at this level
}

export interface OrderBookSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  spreadPercent: number;
  bidDepth: number; // Total bid quantity
  askDepth: number; // Total ask quantity
  imbalance: number; // -1 (all asks) to 1 (all bids)
  timestamp: number;
}

export interface TradeFlow {
  buys: number; // Number of buy trades
  sells: number; // Number of sell trades
  buyVolume: number;
  sellVolume: number;
  delta: number; // buyVolume - sellVolume
  cumulativeDelta: number;
  largeBuys: number; // Trades > 2x average size
  largeSells: number;
}

export interface AbsorptionEvent {
  type: 'bid_absorption' | 'ask_absorption';
  priceLevel: number;
  volume: number;
  description: string;
}

export interface OrderFlowResult {
  orderBook: OrderBookSnapshot | null;
  tradeFlow: TradeFlow;
  absorptionEvents: AbsorptionEvent[];
  signals: VectorSignal[];
  source: 'real' | 'simulated';
}

const CRYPTO_SYMBOLS = new Set(['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'LINK', 'UNI', 'ATOM', 'LTC', 'NEAR', 'AAVE', 'ARB', 'OP', 'APT', 'SUI']);

function getBinanceSymbol(symbol: string): string {
  return `${symbol.toLowerCase()}usdt`;
}

/**
 * Fetch real order book from Binance for crypto symbols
 */
async function fetchBinanceOrderBook(symbol: string, limit: number = 20): Promise<OrderBookSnapshot | null> {
  try {
    const binanceSymbol = getBinanceSymbol(symbol);
    const url = `https://api.binance.com/api/v3/depth?symbol=${binanceSymbol.toUpperCase()}&limit=${limit}`;

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;

    const data = await response.json();

    let bidTotal = 0;
    const bids: OrderBookLevel[] = (data.bids || []).map(([price, qty]: [string, string]) => {
      const p = parseFloat(price);
      const q = parseFloat(qty);
      bidTotal += q;
      return { price: p, quantity: q, total: bidTotal };
    });

    let askTotal = 0;
    const asks: OrderBookLevel[] = (data.asks || []).map(([price, qty]: [string, string]) => {
      const p = parseFloat(price);
      const q = parseFloat(qty);
      askTotal += q;
      return { price: p, quantity: q, total: askTotal };
    });

    if (bids.length === 0 || asks.length === 0) return null;

    const bestBid = bids[0].price;
    const bestAsk = asks[0].price;
    const spread = bestAsk - bestBid;
    const spreadPercent = (spread / bestAsk) * 100;

    const totalDepth = bidTotal + askTotal;
    const imbalance = totalDepth === 0 ? 0 : (bidTotal - askTotal) / totalDepth;

    return {
      bids,
      asks,
      spread: Math.round(spread * 100) / 100,
      spreadPercent: Math.round(spreadPercent * 10000) / 10000,
      bidDepth: Math.round(bidTotal * 100) / 100,
      askDepth: Math.round(askTotal * 100) / 100,
      imbalance: Math.round(imbalance * 1000) / 1000,
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch recent trades from Binance for trade flow analysis
 */
async function fetchBinanceTrades(symbol: string, limit: number = 100): Promise<{ price: number; qty: number; isBuyerMaker: boolean; time: number }[] | null> {
  try {
    const binanceSymbol = getBinanceSymbol(symbol);
    const url = `https://api.binance.com/api/v3/trades?symbol=${binanceSymbol.toUpperCase()}&limit=${limit}`;

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Analyze trade flow from recent trades
 */
export function analyzeTradeFlow(trades: { qty: number; isBuyerMaker: boolean }[]): TradeFlow {
  let buys = 0;
  let sells = 0;
  let buyVolume = 0;
  let sellVolume = 0;
  let totalVolume = 0;

  for (const trade of trades) {
    totalVolume += trade.qty;

    // isBuyerMaker = true means the trade was initiated by a seller (market sell)
    if (trade.isBuyerMaker) {
      sells++;
      sellVolume += trade.qty;
    } else {
      buys++;
      buyVolume += trade.qty;
    }
  }

  const avgSize = trades.length > 0 ? totalVolume / trades.length : 0;
  let largeBuys = 0;
  let largeSells = 0;

  for (const trade of trades) {
    if (trade.qty > avgSize * 2) {
      if (trade.isBuyerMaker) {
        largeSells++;
      } else {
        largeBuys++;
      }
    }
  }

  const delta = buyVolume - sellVolume;

  return {
    buys,
    sells,
    buyVolume: Math.round(buyVolume * 100) / 100,
    sellVolume: Math.round(sellVolume * 100) / 100,
    delta: Math.round(delta * 100) / 100,
    cumulativeDelta: Math.round(delta * 100) / 100, // In real implementation, this would accumulate over time
    largeBuys,
    largeSells,
  };
}

/**
 * Detect absorption events from order book
 */
export function detectAbsorption(orderBook: OrderBookSnapshot, avgLevelQty: number): AbsorptionEvent[] {
  const events: AbsorptionEvent[] = [];

  // Check for large bid clusters (bid absorption = support)
  for (const bid of orderBook.bids) {
    if (bid.quantity > avgLevelQty * 5) {
      events.push({
        type: 'bid_absorption',
        priceLevel: bid.price,
        volume: bid.quantity,
        description: `Soporte fuerte en ${bid.price} (${bid.quantity.toFixed(2)} unidades, ${(bid.quantity / avgLevelQty).toFixed(1)}x promedio)`,
      });
    }
  }

  // Check for large ask clusters (ask absorption = resistance)
  for (const ask of orderBook.asks) {
    if (ask.quantity > avgLevelQty * 5) {
      events.push({
        type: 'ask_absorption',
        priceLevel: ask.price,
        volume: ask.quantity,
        description: `Resistencia fuerte en ${ask.price} (${ask.quantity.toFixed(2)} unidades, ${(ask.quantity / avgLevelQty).toFixed(1)}x promedio)`,
      });
    }
  }

  return events;
}

/**
 * Generate simulated order book for non-crypto symbols
 */
export function generateSimulatedOrderBook(midPrice: number): OrderBookSnapshot {
  const tickSize = midPrice > 1000 ? 0.1 : midPrice > 100 ? 0.01 : 0.0001;
  const numLevels = 15;
  const bids: OrderBookLevel[] = [];
  const asks: OrderBookLevel[] = [];

  let bidTotal = 0;
  let askTotal = 0;

  // Generate a slight bias (random imbalance)
  const bias = (Math.random() - 0.5) * 0.2; // -0.1 to 0.1

  for (let i = 0; i < numLevels; i++) {
    // Bids go down from mid price
    const bidPrice = midPrice - (i + 1) * tickSize * (1 + Math.random());
    const bidQty = (50 + Math.random() * 200) * (1 + bias);
    bidTotal += bidQty;
    bids.push({ price: Math.round(bidPrice * 10000) / 10000, quantity: Math.round(bidQty * 100) / 100, total: Math.round(bidTotal * 100) / 100 });

    // Asks go up from mid price
    const askPrice = midPrice + (i + 1) * tickSize * (1 + Math.random());
    const askQty = (50 + Math.random() * 200) * (1 - bias);
    askTotal += askQty;
    asks.push({ price: Math.round(askPrice * 10000) / 10000, quantity: Math.round(askQty * 100) / 100, total: Math.round(askTotal * 100) / 100 });
  }

  const spread = asks[0].price - bids[0].price;
  const totalDepth = bidTotal + askTotal;

  return {
    bids,
    asks,
    spread: Math.round(spread * 10000) / 10000,
    spreadPercent: Math.round((spread / asks[0].price) * 10000) / 10000,
    bidDepth: Math.round(bidTotal * 100) / 100,
    askDepth: Math.round(askTotal * 100) / 100,
    imbalance: Math.round((bidTotal - askTotal) / totalDepth * 1000) / 1000,
    timestamp: Date.now(),
  };
}

/**
 * Main function: Analyze order flow for a symbol
 */
export async function analyzeOrderFlow(symbol: string, currentPrice?: number): Promise<OrderFlowResult> {
  const isCrypto = CRYPTO_SYMBOLS.has(symbol.toUpperCase());

  if (isCrypto) {
    try {
      // Fetch real data from Binance in parallel
      const [orderBook, trades] = await Promise.all([
        fetchBinanceOrderBook(symbol),
        fetchBinanceTrades(symbol),
      ]);

      if (orderBook) {
        const tradeFlow = trades
          ? analyzeTradeFlow(trades.map(t => ({ qty: parseFloat(String(t.qty)), isBuyerMaker: t.isBuyerMaker })))
          : generateSimulatedTradeFlow();

        // Detect absorption
        const avgQty = [...orderBook.bids, ...orderBook.asks].reduce((s, l) => s + l.quantity, 0) / (orderBook.bids.length + orderBook.asks.length);
        const absorption = detectAbsorption(orderBook, avgQty);

        // Generate signals
        const signals = generateOrderFlowSignals(orderBook, tradeFlow, absorption);

        return {
          orderBook,
          tradeFlow,
          absorptionEvents: absorption,
          signals,
          source: 'real',
        };
      }
    } catch {
      // Fall through to simulated
    }
  }

  // Simulated data for stocks or when Binance API fails
  const price = currentPrice || 150;
  const orderBook = generateSimulatedOrderBook(price);
  const tradeFlow = generateSimulatedTradeFlow();
  const avgQty = [...orderBook.bids, ...orderBook.asks].reduce((s, l) => s + l.quantity, 0) / (orderBook.bids.length + orderBook.asks.length);
  const absorption = detectAbsorption(orderBook, avgQty);
  const signals = generateOrderFlowSignals(orderBook, tradeFlow, absorption);

  return {
    orderBook,
    tradeFlow,
    absorptionEvents: absorption,
    signals,
    source: 'simulated',
  };
}

function generateSimulatedTradeFlow(): TradeFlow {
  const buyBias = Math.random() > 0.5 ? 1.1 : 0.9;
  const buyVolume = Math.round((5000 + Math.random() * 10000) * buyBias);
  const sellVolume = Math.round((5000 + Math.random() * 10000) / buyBias);

  return {
    buys: Math.round(50 * buyBias),
    sells: Math.round(50 / buyBias),
    buyVolume,
    sellVolume,
    delta: buyVolume - sellVolume,
    cumulativeDelta: buyVolume - sellVolume,
    largeBuys: Math.floor(Math.random() * 5),
    largeSells: Math.floor(Math.random() * 5),
  };
}

function generateOrderFlowSignals(
  orderBook: OrderBookSnapshot,
  tradeFlow: TradeFlow,
  absorption: AbsorptionEvent[]
): VectorSignal[] {
  const signals: VectorSignal[] = [];

  // Signal 1: Order book imbalance
  if (Math.abs(orderBook.imbalance) > 0.15) {
    const direction = orderBook.imbalance > 0 ? 'LONG' : 'SHORT';
    const strength = Math.round(Math.abs(orderBook.imbalance) * 100);
    signals.push({
      vectorId: 'orderflow',
      vectorName: 'Order Flow',
      direction,
      strength: Math.min(100, strength),
      confidence: 60,
      detail: `Desbalance del libro de órdenes: ${(orderBook.imbalance * 100).toFixed(1)}% hacia ${direction === 'LONG' ? 'compras' : 'ventas'}. Bid: ${orderBook.bidDepth.toFixed(0)}, Ask: ${orderBook.askDepth.toFixed(0)}.`,
    });
  }

  // Signal 2: Cumulative delta
  if (Math.abs(tradeFlow.delta) > 0) {
    const totalVolume = tradeFlow.buyVolume + tradeFlow.sellVolume;
    if (totalVolume > 0) {
      const deltaPercent = tradeFlow.delta / totalVolume;
      if (Math.abs(deltaPercent) > 0.1) {
        const direction = deltaPercent > 0 ? 'LONG' : 'SHORT';
        const strength = Math.round(Math.abs(deltaPercent) * 200);
        signals.push({
          vectorId: 'orderflow_delta',
          vectorName: 'Delta Flow',
          direction,
          strength: Math.min(100, strength),
          confidence: 55,
          detail: `Delta acumulativo ${direction === 'LONG' ? 'positivo' : 'negativo'} (${tradeFlow.delta.toFixed(0)}). Compras: ${tradeFlow.buyVolume.toFixed(0)}, Ventas: ${tradeFlow.sellVolume.toFixed(0)}.`,
        });
      }
    }
  }

  // Signal 3: Large orders (whale activity)
  if (tradeFlow.largeBuys > tradeFlow.largeSells + 2) {
    signals.push({
      vectorId: 'orderflow_whale',
      vectorName: 'Whale Activity',
      direction: 'LONG',
      strength: Math.min(100, tradeFlow.largeBuys * 15),
      confidence: 50,
      detail: `${tradeFlow.largeBuys} órdenes grandes de compra detectadas vs ${tradeFlow.largeSells} de venta. Posible acumulación institucional.`,
    });
  } else if (tradeFlow.largeSells > tradeFlow.largeBuys + 2) {
    signals.push({
      vectorId: 'orderflow_whale',
      vectorName: 'Whale Activity',
      direction: 'SHORT',
      strength: Math.min(100, tradeFlow.largeSells * 15),
      confidence: 50,
      detail: `${tradeFlow.largeSells} órdenes grandes de venta detectadas vs ${tradeFlow.largeBuys} de compra. Posible distribución institucional.`,
    });
  }

  // Signal 4: Absorption events
  const bidAbsorption = absorption.filter(e => e.type === 'bid_absorption');
  const askAbsorption = absorption.filter(e => e.type === 'ask_absorption');

  if (bidAbsorption.length > 0 && bidAbsorption.length > askAbsorption.length) {
    signals.push({
      vectorId: 'orderflow_absorption',
      vectorName: 'Absorción',
      direction: 'LONG',
      strength: 65,
      confidence: 55,
      detail: `Absorción en bids detectada: soporte fuerte en ${bidAbsorption.map(e => e.priceLevel).join(', ')}. Presión vendedora absorbida.`,
    });
  } else if (askAbsorption.length > 0 && askAbsorption.length > bidAbsorption.length) {
    signals.push({
      vectorId: 'orderflow_absorption',
      vectorName: 'Absorción',
      direction: 'SHORT',
      strength: 65,
      confidence: 55,
      detail: `Absorción en asks detectada: resistencia fuerte en ${askAbsorption.map(e => e.priceLevel).join(', ')}. Presión compradora absorbida.`,
    });
  }

  // If no signals generated, return neutral
  if (signals.length === 0) {
    signals.push({
      vectorId: 'orderflow',
      vectorName: 'Order Flow',
      direction: 'NEUTRAL',
      strength: 25,
      confidence: 40,
      detail: `Order flow equilibrado. Spread: ${orderBook.spreadPercent}%. Imbalance: ${(orderBook.imbalance * 100).toFixed(1)}%.`,
    });
  }

  return signals;
}
