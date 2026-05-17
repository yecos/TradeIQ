'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/lib/store';
import { TradingChart } from '@/components/trading/trading-chart';
import { VectorPanel } from '@/components/trading/vector-panel';
import { SignalCard } from '@/components/trading/signal-card';
import { WatchlistPanel } from '@/components/trading/watchlist-panel';
import { AnalysisPanel } from '@/components/trading/analysis-panel';
import { JournalPanel } from '@/components/trading/journal-panel';
import { BrokerPanel } from '@/components/trading/broker-panel';
import { BacktestPanel } from '@/components/trading/backtest-panel';
import type { Candle, Quote, TechnicalAnalysis, PatternAnalysis, VolumeAnalysis, NewsAnalysis, SentimentAnalysis, MacroAnalysis, ConfluenceResult } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  Zap,
  Activity,
  BookOpen,
  Link2,
  BarChart3,
  FlaskConical,
  RefreshCw,
  TrendingUp,
  Target,
  Wifi,
  WifiOff,
  X,
  Clock,
  Menu,
  PanelRight,
  ChevronLeft,
  List,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { LoadingScreen } from '@/components/loading-screen';

interface JournalEntry {
  id: string;
  symbol: string;
  direction: string;
  entryPrice: number;
  exitPrice?: number;
  stopLoss: number;
  takeProfit: number;
  result?: string;
  pnl?: number;
  notes: string;
  createdAt: string;
}

interface BrokerConfig {
  id?: string;
  brokerName: string;
  apiKey: string;
  apiSecret: string;
  isPaper: boolean;
  isActive: boolean;
}

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  currency: string;
}

export default function TradeIQDashboard() {
  const {
    selectedSymbol,
    enabledVectors,
    isAnalyzing,
    setIsAnalyzing,
    setLastConfluence,
    signals,
    addSignal,
    watchlist,
    timeframe,
    setTimeframe,
  } = useAppStore();

  const [technical, setTechnical] = useState<TechnicalAnalysis | null>(null);
  const [patterns, setPatterns] = useState<PatternAnalysis | null>(null);
  const [volumeAnalysis, setVolumeAnalysis] = useState<VolumeAnalysis | null>(null);
  const [newsAnalysis, setNewsAnalysis] = useState<NewsAnalysis | null>(null);
  const [sentimentAnalysis, setSentimentAnalysis] = useState<SentimentAnalysis | null>(null);
  const [macroAnalysis, setMacroAnalysis] = useState<MacroAnalysis | null>(null);
  const [confluence, setConfluence] = useState<ConfluenceResult | null>(null);
  const [analysisForSymbol, setAnalysisForSymbol] = useState<string>('');
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [brokerConfig, setBrokerConfig] = useState<BrokerConfig | null>(null);
  const [activeTab, setActiveTab] = useState('analysis');
  const [searchSymbol, setSearchSymbol] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Mobile drawer states
  const [showWatchlistDrawer, setShowWatchlistDrawer] = useState(false);
  const [showAnalysisDrawer, setShowAnalysisDrawer] = useState(false);

  // Only show analysis if it matches the current symbol
  const activeTechnical = analysisForSymbol === selectedSymbol ? technical : null;
  const activePatterns = analysisForSymbol === selectedSymbol ? patterns : null;
  const activeVolume = analysisForSymbol === selectedSymbol ? volumeAnalysis : null;
  const activeNews = analysisForSymbol === selectedSymbol ? newsAnalysis : null;
  const activeSentiment = analysisForSymbol === selectedSymbol ? sentimentAnalysis : null;
  const activeMacro = analysisForSymbol === selectedSymbol ? macroAnalysis : null;
  const activeConfluence = analysisForSymbol === selectedSymbol ? confluence : null;

  // Fetch market status (provider info + data quality)
  const { data: marketStatus } = useQuery({
    queryKey: ['marketStatus'],
    queryFn: async () => {
      const res = await fetch('/api/market/status');
      return res.json() as Promise<{
        provider: string;
        isRealData: boolean;
        isFallback: boolean;
        activeProviders: string[];
        dataQuality?: {
          source: 'real' | 'mock' | 'stale' | 'partial';
          isMockData: boolean;
          isStale: boolean;
          staleSymbols: string[];
          lastRealDataTime: number | null;
          warnings: string[];
        };
        timestamp: number;
      }>;
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // Fetch quotes using TanStack Query — refetch every 15s for near-real-time
  const { data: quotes = [], isLoading: isLoadingQuotes, refetch: refetchQuotes } = useQuery({
    queryKey: ['quotes', watchlist],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/market/quote?symbols=${watchlist.join(',')}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return (data.quotes || []) as Quote[];
      } catch (error) {
        console.warn('[TradeIQ] Quote fetch failed:', error);
        return [] as Quote[];
      }
    },
    refetchInterval: 15000,
    retry: 1,
    staleTime: 5000,
  });

  // Fetch candles using TanStack Query
  const { data: candles = [] } = useQuery({
    queryKey: ['candles', selectedSymbol, timeframe],
    queryFn: async () => {
      try {
        const daysForTimeframe: Record<string, number> = {
          '1m': 1, '5m': 2, '15m': 5, '1H': 30, '4H': 90, '1D': 180, '1W': 365,
        };
        const days = daysForTimeframe[timeframe] || 180;
        const res = await fetch(`/api/market/candles?symbol=${selectedSymbol}&days=${days}&interval=${timeframe}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return (data.candles || []) as Candle[];
      } catch (error) {
        console.warn('[TradeIQ] Candle fetch failed:', error);
        return [] as Candle[];
      }
    },
    refetchInterval: timeframe === '1m' || timeframe === '5m' ? 10000 :
                     timeframe === '15m' || timeframe === '1H' ? 30000 : 60000,
    retry: 1,
    staleTime: 10000,
  });

  // Symbol search with debounce
  const searchSymbols = useCallback(async (query: string) => {
    if (query.length < 1) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/market/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setSearchResults(data.results || []);
      setShowSearchDropdown(true);
    } catch {
      setSearchResults([]);
    }
    setIsSearching(false);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchSymbol(value.toUpperCase());
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchSymbols(value.toUpperCase()), 300);
  }, [searchSymbols]);

  const selectSymbol = useCallback((symbol: string) => {
    useAppStore.getState().setSelectedSymbol(symbol);
    setSearchSymbol('');
    setSearchResults([]);
    setShowSearchDropdown(false);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile drawers on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowWatchlistDrawer(false);
        setShowAnalysisDrawer(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  // Run analysis
  const runAnalysis = useCallback(async () => {
    if (enabledVectors.length === 0) {
      toast.error('Activa al menos un vector de análisis');
      return;
    }
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedSymbol, vectors: enabledVectors }),
      });
      const data = await res.json();

      setAnalysisForSymbol(selectedSymbol);
      if (data.technical) setTechnical(data.technical);
      if (data.patterns) setPatterns(data.patterns);
      if (data.volume) setVolumeAnalysis(data.volume);
      if (data.news) setNewsAnalysis(data.news);
      if (data.sentiment) setSentimentAnalysis(data.sentiment);
      if (data.macro) setMacroAnalysis(data.macro);
      if (data.confluence) {
        setConfluence(data.confluence);
        setLastConfluence(data.confluence);
        if (data.confluence.overallDirection !== 'NEUTRAL' && data.confluence.confluenceScore >= 40) {
          addSignal(data.confluence);
        }
      }
      toast.success(`Análisis completado: ${data.confluence?.overallDirection} (${data.confluence?.confluenceScore}% confluencia)`);
    } catch {
      toast.error('Error al analizar. Intenta de nuevo.');
    }
    setIsAnalyzing(false);
  }, [selectedSymbol, enabledVectors, setIsAnalyzing, setLastConfluence, addSignal]);

  const saveSignal = useCallback(async (signal: ConfluenceResult) => {
    try {
      await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: signal.symbol, direction: signal.overallDirection,
          entryPrice: signal.entryPrice, stopLoss: signal.stopLoss, takeProfit: signal.takeProfit,
          riskReward: signal.riskReward, confluenceScore: signal.confluenceScore,
          vectorsUsed: signal.vectorSignals.map(s => s.vectorName), analysisDetail: signal.vectorSignals,
        }),
      });
      toast.success('Señal guardada');
    } catch {
      toast.error('Error al guardar señal');
    }
  }, []);

  const addJournalEntry = useCallback(async (entry: Partial<JournalEntry>) => {
    try {
      await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      setJournalEntries(prev => [{ ...entry, id: Date.now().toString(), createdAt: new Date().toISOString() } as JournalEntry, ...prev]);
      toast.success('Entrada guardada en bitácora');
    } catch {
      toast.error('Error al guardar entrada');
    }
  }, []);

  const saveBrokerConfig = useCallback(async (config: Partial<BrokerConfig>) => {
    try {
      await fetch('/api/broker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      setBrokerConfig({ ...config, isActive: true } as BrokerConfig);
      toast.success('Broker configurado');
    } catch {
      toast.error('Error al configurar broker');
    }
  }, []);

  const disconnectBroker = useCallback(async () => {
    try {
      await fetch('/api/broker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerName: 'alpaca', apiKey: '', apiSecret: '', isPaper: true }),
      });
      setBrokerConfig(null);
      toast.success('Broker desconectado');
    } catch {
      toast.error('Error al desconectar');
    }
  }, []);

  const handleRefreshQuotes = useCallback(() => {
    refetchQuotes();
  }, [refetchQuotes]);

  // Loading screen state
  const isQuotesLoaded = quotes.length > 0;
  const isCandlesLoaded = candles.length > 0;
  const isStatusLoaded = !!marketStatus;
  const loadProgress = (
    (isStatusLoaded ? 30 : 0) +
    (isQuotesLoaded ? 45 : 0) +
    (isCandlesLoaded ? 25 : 0)
  );
  const loadStep = !isStatusLoaded
    ? 'Connecting to market data providers...'
    : !isQuotesLoaded
    ? 'Fetching watchlist quotes...'
    : !isCandlesLoaded
    ? 'Loading chart data...'
    : 'Ready!';

  const currentQuote = quotes.find(q => q.symbol === selectedSymbol);
  const isLive = marketStatus?.isRealData && !marketStatus?.isFallback;
  const hasCoinGecko = marketStatus?.activeProviders?.includes('coingecko');
  const hasBinance = marketStatus?.activeProviders?.includes('binance');
  const hasPolygon = marketStatus?.activeProviders?.includes('polygon');

  // Shared right panel content (used in both desktop sidebar and mobile drawer)
  const rightPanelContent = (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
      <TabsList className="w-full h-9 bg-transparent border-b border-white/5 rounded-none p-0 justify-start overflow-x-auto">
        <TabsTrigger
          value="analysis"
          className="h-9 text-[10px] data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 data-[state=active]:text-emerald-400 data-[state=active]:shadow-none rounded-none px-3 flex-shrink-0"
        >
          <Activity className="w-3 h-3 mr-1" />
          Análisis
        </TabsTrigger>
        <TabsTrigger
          value="signals"
          className="h-9 text-[10px] data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 data-[state=active]:text-emerald-400 data-[state=active]:shadow-none rounded-none px-3 flex-shrink-0"
        >
          <Zap className="w-3 h-3 mr-1" />
          Señales
          {signals.length > 0 && (
            <Badge className="ml-1 text-[8px] border-0 bg-emerald-500/20 text-emerald-400 h-4 min-w-[16px]">
              {signals.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger
          value="backtest"
          className="h-9 text-[10px] data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 data-[state=active]:text-emerald-400 data-[state=active]:shadow-none rounded-none px-3 flex-shrink-0"
        >
          <FlaskConical className="w-3 h-3 mr-1" />
          Backtest
        </TabsTrigger>
        <TabsTrigger
          value="journal"
          className="h-9 text-[10px] data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 data-[state=active]:text-emerald-400 data-[state=active]:shadow-none rounded-none px-3 flex-shrink-0"
        >
          <BookOpen className="w-3 h-3 mr-1" />
          Bitácora
        </TabsTrigger>
        <TabsTrigger
          value="broker"
          className="h-9 text-[10px] data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 data-[state=active]:text-emerald-400 data-[state=active]:shadow-none rounded-none px-3 flex-shrink-0"
        >
          <Link2 className="w-3 h-3 mr-1" />
          Broker
        </TabsTrigger>
      </TabsList>

      <div className="flex-1 overflow-hidden">
        <TabsContent value="analysis" className="h-full m-0 p-3 overflow-y-auto custom-scrollbar">
          <AnalysisPanel
            technical={activeTechnical}
            patterns={activePatterns}
            volume={activeVolume}
            confluence={activeConfluence}
            news={activeNews}
            sentiment={activeSentiment}
            macro={activeMacro}
          />
        </TabsContent>

        <TabsContent value="signals" className="h-full m-0 p-3 overflow-y-auto custom-scrollbar">
          <div className="space-y-2">
            {signals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                <Zap className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs">Ejecuta un análisis para ver señales</p>
              </div>
            ) : (
              signals.map((signal, i) => (
                <SignalCard key={i} signal={signal} onSave={saveSignal} />
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="backtest" className="h-full m-0 p-3 overflow-y-auto custom-scrollbar">
          <BacktestPanel />
        </TabsContent>

        <TabsContent value="journal" className="h-full m-0 p-3 overflow-y-auto custom-scrollbar">
          <JournalPanel entries={journalEntries} onAddEntry={addJournalEntry} />
        </TabsContent>

        <TabsContent value="broker" className="h-full m-0 p-3 overflow-y-auto custom-scrollbar">
          <BrokerPanel
            config={brokerConfig}
            onSave={saveBrokerConfig}
            onDisconnect={disconnectBroker}
          />
        </TabsContent>
      </div>
    </Tabs>
  );

  // Shared left sidebar content
  const leftSidebarContent = (
    <>
      {/* Watchlist */}
      <div className="p-3 border-b border-white/5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Watchlist
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-5 w-5 p-0 text-gray-500"
            onClick={handleRefreshQuotes}
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>
        <WatchlistPanel quotes={quotes} isLoading={isLoadingQuotes} />
      </div>
      {/* Vector Selector */}
      <div className="p-3 flex-1 overflow-y-auto custom-scrollbar">
        <VectorPanel />
      </div>
    </>
  );

  return (
    <div className="h-screen flex flex-col trading-bg text-white overflow-hidden">
      {/* Animated Loading Screen */}
      <LoadingScreen progress={loadProgress} step={loadStep} />

      {/* Data Quality Warning Banner */}
      {marketStatus?.dataQuality?.isMockData && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-3 py-1.5 flex items-center justify-center gap-2 flex-shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <span className="text-[10px] sm:text-xs text-red-300 font-medium">
            DATOS SIMULADOS — No operar con dinero real basado en estos datos
          </span>
          {marketStatus.dataQuality.warnings.length > 0 && (
            <span className="text-[9px] text-red-400/70 hidden sm:inline">
              ({marketStatus.dataQuality.warnings[0]})
            </span>
          )}
        </div>
      )}
      {!marketStatus?.dataQuality?.isMockData && marketStatus?.dataQuality?.isStale && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/30 px-3 py-1.5 flex items-center justify-center gap-2 flex-shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
          <span className="text-[10px] sm:text-xs text-yellow-300 font-medium">
            DATOS ANTIGUOS — Algunos símbolos tienen datos retrasados
          </span>
        </div>
      )}

      {/* ===== HEADER — Desktop ===== */}
      <header className="h-12 border-b border-white/5 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Mobile: Watchlist toggle */}
          <button
            className="md:hidden p-1.5 rounded-md hover:bg-white/5 text-gray-400"
            onClick={() => setShowWatchlistDrawer(true)}
          >
            <List className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Target className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="font-bold text-sm hidden sm:inline">TradeIQ</span>
            <Badge className="text-[8px] border-0 bg-emerald-500/10 text-emerald-400 hidden sm:inline">BETA</Badge>
          </div>

          {/* Symbol Search */}
          <div className="relative ml-2 sm:ml-4" ref={searchRef}>
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar..."
              className="h-7 w-28 sm:w-48 pl-7 pr-7 text-xs bg-white/5 border border-white/10 rounded-md focus:outline-none focus:border-emerald-500/50 text-white placeholder-gray-500"
              value={searchSymbol}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchSymbol) selectSymbol(searchSymbol);
              }}
              onFocus={() => searchResults.length > 0 && setShowSearchDropdown(true)}
            />
            {searchSymbol && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                onClick={() => { setSearchSymbol(''); setSearchResults([]); setShowSearchDropdown(false); }}
              >
                <X className="w-3 h-3" />
              </button>
            )}

            {/* Search Dropdown */}
            {showSearchDropdown && (searchResults.length > 0 || isSearching) && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto custom-scrollbar">
                {isSearching ? (
                  <div className="p-3 text-xs text-gray-500 text-center">Buscando...</div>
                ) : (
                  searchResults.map((result) => (
                    <button
                      key={result.symbol}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 text-left transition-colors"
                      onClick={() => selectSymbol(result.symbol)}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[8px] px-1 py-0.5 rounded font-medium ${
                          result.type === 'crypto' ? 'bg-yellow-500/20 text-yellow-400' :
                          result.type === 'etf' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-white/10 text-gray-400'
                        }`}>
                          {result.type === 'crypto' ? 'CRYPTO' : result.type === 'etf' ? 'ETF' : 'STOCK'}
                        </span>
                        <div>
                          <span className="text-xs font-bold text-white">{result.symbol}</span>
                          <span className="text-[10px] text-gray-500 ml-2 hidden sm:inline">{result.name}</span>
                        </div>
                      </div>
                      <span className="text-[9px] text-gray-600">{result.exchange}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Data Provider Badge — hidden on very small screens */}
          <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/10 bg-white/5">
            {isLive ? (
              <Wifi className="w-3 h-3 text-emerald-400" />
            ) : (
              <WifiOff className="w-3 h-3 text-yellow-500" />
            )}
            <div className="flex items-center gap-1">
              {hasCoinGecko && <span className="text-[9px] font-medium text-emerald-400">CG</span>}
              {hasCoinGecko && hasBinance && <span className="text-[8px] text-gray-600">+</span>}
              {hasBinance && <span className="text-[9px] font-medium text-yellow-400">BIN</span>}
              {(hasCoinGecko || hasBinance) && hasPolygon && <span className="text-[8px] text-gray-600">+</span>}
              {hasPolygon && <span className="text-[9px] font-medium text-blue-400">POL</span>}
              {!hasCoinGecko && !hasBinance && !hasPolygon && (
                <span className="text-[9px] font-medium text-yellow-500">MOCK</span>
              )}
              {marketStatus?.isFallback && <span className="text-[9px] text-red-400">FB</span>}
            </div>
          </div>

          {/* Mobile: live dot indicator */}
          <div className={`sm:hidden w-2 h-2 rounded-full ${isLive ? 'bg-emerald-400' : 'bg-yellow-500'}`} />

          {/* Current Symbol Info */}
          {currentQuote && currentQuote.price != null && (
            <div className="flex items-center gap-1 sm:gap-3">
              <span className="text-xs sm:text-sm font-bold">{currentQuote.symbol}</span>
              <span className="text-xs sm:text-sm font-mono hidden sm:inline">
                ${currentQuote.price >= 1 ? currentQuote.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : currentQuote.price.toFixed(4)}
              </span>
              <span className={`text-[10px] sm:text-xs font-mono ${(currentQuote.change ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {(currentQuote.change ?? 0) >= 0 ? '+' : ''}{(currentQuote.changePercent ?? 0).toFixed(2)}%
              </span>
            </div>
          )}

          {/* Analyze Button */}
          <Button
            size="sm"
            className={`h-7 text-xs gap-1 ${
              isAnalyzing ? 'bg-gray-600' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
            onClick={runAnalysis}
            disabled={isAnalyzing || enabledVectors.length === 0}
          >
            {isAnalyzing ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Zap className="w-3 h-3" />
            )}
            <span className="hidden sm:inline">{isAnalyzing ? 'Analizando...' : 'Analizar'}</span>
          </Button>

          {/* Broker Status — desktop only */}
          <div className="hidden lg:flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${brokerConfig?.isActive ? 'bg-emerald-400' : 'bg-gray-600'}`} />
            <span className="text-[10px] text-gray-500">
              {brokerConfig?.isActive ? 'Broker OK' : 'Sin broker'}
            </span>
          </div>

          {/* Mobile: Analysis panel toggle */}
          <button
            className="md:hidden p-1.5 rounded-md hover:bg-white/5 text-gray-400"
            onClick={() => setShowAnalysisDrawer(true)}
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT SIDEBAR — Desktop only */}
        <aside className="hidden md:flex w-56 border-r border-white/5 flex-col overflow-hidden flex-shrink-0">
          {leftSidebarContent}
        </aside>

        {/* CENTER — CHART */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Timeframe Selector + Chart */}
          <div className="flex-1 p-1.5 sm:p-2 min-h-0 flex flex-col">
            {/* Timeframe Bar */}
            <div className="flex items-center gap-0.5 sm:gap-1 mb-1 px-1 overflow-x-auto">
              <Clock className="w-3 h-3 text-gray-500 mr-1 flex-shrink-0" />
              {(['1m', '5m', '15m', '1H', '4H', '1D', '1W'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-1.5 sm:px-2 py-0.5 text-[10px] font-medium rounded transition-colors flex-shrink-0 ${
                    timeframe === tf
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {tf}
                </button>
              ))}
              {/* OHLC — desktop only */}
              <div className="ml-auto hidden md:flex items-center gap-2">
                {currentQuote && currentQuote.price != null && (
                  <span className="text-[10px] text-gray-500">
                    O: <span className="text-gray-300">${(currentQuote.open ?? 0) >= 1 ? (currentQuote.open ?? 0).toFixed(2) : (currentQuote.open ?? 0).toFixed(4)}</span>
                    {' '}H: <span className="text-gray-300">${(currentQuote.high ?? 0) >= 1 ? (currentQuote.high ?? 0).toFixed(2) : (currentQuote.high ?? 0).toFixed(4)}</span>
                    {' '}L: <span className="text-gray-300">${(currentQuote.low ?? 0) >= 1 ? (currentQuote.low ?? 0).toFixed(2) : (currentQuote.low ?? 0).toFixed(4)}</span>
                    {' '}C: <span className={(currentQuote.change ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>${currentQuote.price >= 1 ? currentQuote.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : currentQuote.price.toFixed(4)}</span>
                  </span>
                )}
              </div>
            </div>
            {/* Chart Container */}
            <div className="flex-1 rounded-lg overflow-hidden trading-card min-h-0">
              <TradingChart candles={candles} symbol={selectedSymbol} />
            </div>
          </div>

          {/* Bottom Analysis Summary Bar */}
          {activeConfluence && (
            <div className="h-14 sm:h-16 border-t border-white/5 px-2 sm:px-4 flex items-center gap-3 sm:gap-6 flex-shrink-0 overflow-x-auto">
              {/* Direction */}
              <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                {activeConfluence.overallDirection === 'LONG' ? (
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                ) : activeConfluence.overallDirection === 'SHORT' ? (
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-red-400 rotate-180" />
                ) : (
                  <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400" />
                )}
                <div>
                  <p className="text-[10px] sm:text-xs font-bold">
                    {activeConfluence.overallDirection === 'LONG' ? 'ALCISTA' :
                     activeConfluence.overallDirection === 'SHORT' ? 'BAJISTA' : 'NEUTRAL'}
                  </p>
                  <p className="text-[8px] sm:text-[10px] text-gray-500">Dirección</p>
                </div>
              </div>

              {/* Confluence Score */}
              <div className="flex-shrink-0">
                <p className={`text-sm sm:text-lg font-bold font-mono ${
                  activeConfluence.confluenceScore >= 70 ? 'text-emerald-400' :
                  activeConfluence.confluenceScore >= 40 ? 'text-yellow-400' : 'text-gray-400'
                }`}>
                  {activeConfluence.confluenceScore}%
                </p>
                <p className="text-[8px] sm:text-[10px] text-gray-500">Confluencia</p>
              </div>

              {/* R:R */}
              <div className="flex-shrink-0">
                <p className="text-xs sm:text-sm font-bold font-mono text-white">
                  {(activeConfluence.riskReward ?? 0).toFixed(2)}
                </p>
                <p className="text-[8px] sm:text-[10px] text-gray-500">R:B</p>
              </div>

              {/* Entry */}
              <div className="flex-shrink-0 hidden xs:block">
                <p className="text-xs sm:text-sm font-mono text-white">${(activeConfluence.entryPrice ?? 0).toFixed(2)}</p>
                <p className="text-[8px] sm:text-[10px] text-gray-500">Entrada</p>
              </div>

              {/* SL */}
              <div className="flex-shrink-0 hidden sm:block">
                <p className="text-xs sm:text-sm font-mono text-red-400">${(activeConfluence.stopLoss ?? 0).toFixed(2)}</p>
                <p className="text-[8px] sm:text-[10px] text-gray-500">SL</p>
              </div>

              {/* TP */}
              <div className="flex-shrink-0 hidden sm:block">
                <p className="text-xs sm:text-sm font-mono text-emerald-400">${(activeConfluence.takeProfit ?? 0).toFixed(2)}</p>
                <p className="text-[8px] sm:text-[10px] text-gray-500">TP</p>
              </div>

              {/* Timeframe Recommendation */}
              {activeConfluence.timeframeRecommendation && (
                <div className="flex-shrink-0 hidden sm:block border-l border-white/10 pl-3 ml-1">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-gray-500" />
                    <span className="text-[9px] sm:text-[10px] font-bold text-white">
                      {activeConfluence.timeframeRecommendation.strategyLabel}
                    </span>
                    <span className="text-[8px] sm:text-[9px] text-gray-400">
                      {activeConfluence.timeframeRecommendation.estimatedDuration}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      activeConfluence.timeframeRecommendation.conviction === 'high' ? 'bg-emerald-400' :
                      activeConfluence.timeframeRecommendation.conviction === 'medium' ? 'bg-yellow-400' : 'bg-red-400'
                    }`} />
                    <p className="text-[8px] sm:text-[9px] text-gray-500">
                      Convicción {activeConfluence.timeframeRecommendation.convictionLabel}
                    </p>
                  </div>
                </div>
              )}

              {/* Active Vectors — desktop only */}
              <div className="ml-auto hidden md:block">
                <div className="flex items-center gap-1">
                  {activeConfluence.vectorSignals.map((s, i) => (
                    <div
                      key={i}
                      className={`w-2 h-2 rounded-full ${
                        s.direction === 'LONG' ? 'bg-emerald-400' :
                        s.direction === 'SHORT' ? 'bg-red-400' : 'bg-yellow-400'
                      }`}
                      title={`${s.vectorName}: ${s.direction}`}
                    />
                  ))}
                </div>
                <p className="text-[10px] text-gray-500">{activeConfluence.vectorSignals.length} señales</p>
              </div>
            </div>
          )}
        </main>

        {/* RIGHT PANEL — Desktop only */}
        <aside className="hidden md:flex w-72 border-l border-white/5 flex-col overflow-hidden flex-shrink-0">
          {rightPanelContent}
        </aside>
      </div>

      {/* ===== MOBILE DRAWERS ===== */}

      {/* Watchlist Drawer (left side) */}
      {showWatchlistDrawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowWatchlistDrawer(false)}
          />
          {/* Drawer */}
          <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-[#0a0a0f] border-r border-white/10 flex flex-col animate-slide-in-left">
            <div className="h-12 flex items-center justify-between px-4 border-b border-white/5">
              <span className="text-sm font-bold">Watchlist & Vectores</span>
              <button
                onClick={() => setShowWatchlistDrawer(false)}
                className="p-1.5 rounded-md hover:bg-white/5 text-gray-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {leftSidebarContent}
            </div>
          </div>
        </div>
      )}

      {/* Analysis Drawer (right side) */}
      {showAnalysisDrawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowAnalysisDrawer(false)}
          />
          {/* Drawer */}
          <div className="absolute right-0 top-0 bottom-0 w-[320px] max-w-[85vw] bg-[#0a0a0f] border-l border-white/10 flex flex-col animate-slide-in-right">
            <div className="h-12 flex items-center justify-between px-4 border-b border-white/5">
              <span className="text-sm font-bold">Análisis & Señales</span>
              <button
                onClick={() => setShowAnalysisDrawer(false)}
                className="p-1.5 rounded-md hover:bg-white/5 text-gray-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {rightPanelContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
