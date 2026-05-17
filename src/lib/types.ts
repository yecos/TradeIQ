// Market Data Types
export interface Candle {
  time: number; // Unix timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  marketCap?: number;
}

export interface SymbolInfo {
  symbol: string;
  name: string;
  type: string; // 'stock', 'etf', 'crypto', etc.
  exchange: string;
  currency: string;
}

// Vector Types
export type VectorCategory = 'technical' | 'pattern' | 'volume' | 'news' | 'sentiment' | 'macro';

export interface VectorDefinition {
  id: string;
  category: VectorCategory;
  name: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  defaultEnabled: boolean;
  defaultWeight: number;
}

export interface VectorSignal {
  vectorId: string;
  vectorName: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  strength: number; // 0-100
  confidence: number; // 0-100
  detail: string;
  priceTarget?: number;
}

// Analysis Types
export interface TechnicalAnalysis {
  rsi: number;
  macd: { value: number; signal: number; histogram: number };
  bollingerBands: { upper: number; middle: number; lower: number };
  ema20: number;
  ema50: number;
  sma200: number;
  adx: number;
  atr: number;
  stochRSI: { k: number; d: number };
  signals: VectorSignal[];
}

export interface PatternAnalysis {
  patterns: {
    name: string;
    type: 'bullish' | 'bearish' | 'neutral';
    reliability: number; // 0-100
    index: number;
    description: string;
  }[];
  signals: VectorSignal[];
}

export interface VolumeAnalysis {
  volumeTrend: 'increasing' | 'decreasing' | 'stable';
  volumeRatio: number; // current vs average
  obv: number; // On Balance Volume trend
  accumulationDistribution: 'accumulation' | 'distribution' | 'neutral';
  signals: VectorSignal[];
}

export interface NewsAnalysis {
  sentiment: number; // -1 to 1
  sentimentLabel: 'very_bearish' | 'bearish' | 'neutral' | 'bullish' | 'very_bullish';
  headlines: {
    title: string;
    sentiment: number;
    impact: 'high' | 'medium' | 'low';
    date: string;
  }[];
  signals: VectorSignal[];
}

export interface SentimentAnalysis {
  fearGreedIndex: number; // 0-100
  socialSentiment: number; // -1 to 1
  putCallRatio?: number;
  signals: VectorSignal[];
}

export interface MacroAnalysis {
  fedRateTrend: 'hawkish' | 'dovish' | 'neutral';
  economicEvents: {
    event: string;
    impact: 'high' | 'medium' | 'low';
    date: string;
    forecast?: string;
    previous?: string;
  }[];
  signals: VectorSignal[];
}

// Confluence Engine Types
export interface ConfluenceResult {
  symbol: string;
  overallDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  confluenceScore: number; // 0-100
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  vectorSignals: VectorSignal[];
  recommendation: string;
  timestamp: number;
}

// Broker Types
export interface BrokerPosition {
  symbol: string;
  qty: number;
  side: string;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
}

export interface BrokerOrder {
  id: string;
  symbol: string;
  side: string;
  qty: number;
  type: string;
  limitPrice?: number;
  stopPrice?: number;
  status: string;
  createdAt: string;
}

// Signal Types (for DB model mapping)
export interface SignalWithDetails {
  id: string;
  symbol: string;
  direction: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  confluenceScore: number;
  vectorsUsed: string[];
  analysisDetail: Record<string, unknown>;
  status: string;
  createdAt: string;
  updatedAt: string;
}
