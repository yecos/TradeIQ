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
  /** True if this quote comes from mock/simulated data */
  isMock?: boolean;
}

export interface SymbolInfo {
  symbol: string;
  name: string;
  type: string; // 'stock', 'etf', 'crypto', etc.
  exchange: string;
  currency: string;
}

// Data Quality Types
export interface DataQualityReport {
  source: 'real' | 'mock' | 'stale' | 'partial';
  isMockData: boolean;
  isStale: boolean;
  staleSymbols: string[];
  lastRealDataTime: number | null;
  warnings: string[];
}

// Risk Management Types
export interface RiskConfig {
  maxRiskPerTradePercent: number;
  maxDailyLossPercent: number;
  maxDrawdownPercent: number;
  maxOpenPositions: number;
  minAccountEquity: number;
  tradingHours: { start: number; end: number } | null;
  tradingEnabled: boolean;
}

export interface RiskAssessment {
  allowed: boolean;
  reason: string | null;
  positionSize: number;
  positionValue: number;
  riskAmount: number;
  riskPercent: number;
  dailyPnl: number;
  currentDrawdown: number;
  openPositions: number;
  warnings: string[];
}

export interface AccountSnapshot {
  equity: number;
  equityPeak: number;
  dailyPnl: number;
  dailyPnlStart: number;
  openPositions: number;
  unrealizedPnl: number;
  lastTradeTime: number | null;
}

// Vector Types
export type VectorCategory = 'technical' | 'pattern' | 'volume' | 'news' | 'sentiment' | 'macro' | 'orderflow';

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
  /** If true, this vector uses simulated/approximated data, not real market data */
  isSimulated?: boolean;
}

export interface VectorSignal {
  vectorId: string;
  vectorName: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  strength: number; // 0-100
  confidence: number; // 0-100
  detail: string;
  priceTarget?: number;
  /** If true, this signal was generated from simulated/approximated data, not real market data */
  isSimulated?: boolean;
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

// Timeframe Recommendation
export interface TimeframeRecommendation {
  strategy: 'scalping' | 'intraday' | 'swing' | 'position';
  strategyLabel: string;
  suggestedTimeframes: string[];
  estimatedDuration: string;
  estimatedDurationHours: { min: number; max: number };
  conviction: 'high' | 'medium' | 'low';
  convictionLabel: string;
  reasoning: string[];
}

// Multi-Timeframe Analysis Types
export interface TimeframeConfig {
  label: string;
  interval: string;
  weight: number;
  role: 'trend' | 'confirmation' | 'entry';
  candleCount: number;
}

export interface TimeframeAnalysis {
  timeframe: string;
  label: string;
  role: 'trend' | 'confirmation' | 'entry';
  weight: number;
  technical: TechnicalAnalysis | null;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  strength: number;
  confidence: number;
}

export interface MultiTimeframeResult {
  timeframes: TimeframeAnalysis[];
  trendDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  entryDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  overallDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  alignment: number;
  trendStrength: number;
  entryPrecision: number;
  signals: VectorSignal[];
  recommendation: string;
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
  timeframeRecommendation?: TimeframeRecommendation;
  timestamp: number;
  /** If true, this confluence result is based on simulated/approximated data */
  isSimulated?: boolean;
  /** Warning message for simulated data contexts */
  dataWarning?: string;
}

// Order Flow Types
export interface OrderBookLevel {
  price: number;
  quantity: number;
  total: number;
}

export interface OrderBookSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  spreadPercent: number;
  bidDepth: number;
  askDepth: number;
  imbalance: number;
  timestamp: number;
}

export interface TradeFlow {
  buys: number;
  sells: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
  cumulativeDelta: number;
  largeBuys: number;
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
