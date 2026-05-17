'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/lib/store';
import { TradingChart } from '@/components/trading/trading-chart';
import { VectorPanel } from '@/components/trading/vector-panel';
import { SignalCard } from '@/components/trading/signal-card';
import { WatchlistPanel } from '@/components/trading/watchlist-panel';
import { AnalysisPanel } from '@/components/trading/analysis-panel';
import { JournalPanel } from '@/components/trading/journal-panel';
import { BrokerPanel } from '@/components/trading/broker-panel';
import type { Candle, Quote, TechnicalAnalysis, PatternAnalysis, VolumeAnalysis, ConfluenceResult } from '@/lib/types';
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
  RefreshCw,
  TrendingUp,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';

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
  } = useAppStore();

  const [technical, setTechnical] = useState<TechnicalAnalysis | null>(null);
  const [patterns, setPatterns] = useState<PatternAnalysis | null>(null);
  const [volumeAnalysis, setVolumeAnalysis] = useState<VolumeAnalysis | null>(null);
  const [confluence, setConfluence] = useState<ConfluenceResult | null>(null);
  const [analysisForSymbol, setAnalysisForSymbol] = useState<string>('');
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [brokerConfig, setBrokerConfig] = useState<BrokerConfig | null>(null);
  const [activeTab, setActiveTab] = useState('analysis');
  const [searchSymbol, setSearchSymbol] = useState('');

  // Only show analysis if it matches the current symbol
  const activeTechnical = analysisForSymbol === selectedSymbol ? technical : null;
  const activePatterns = analysisForSymbol === selectedSymbol ? patterns : null;
  const activeVolume = analysisForSymbol === selectedSymbol ? volumeAnalysis : null;
  const activeConfluence = analysisForSymbol === selectedSymbol ? confluence : null;

  // Fetch quotes using TanStack Query
  const { data: quotes = [], isLoading: isLoadingQuotes, refetch: refetchQuotes } = useQuery({
    queryKey: ['quotes', watchlist],
    queryFn: async () => {
      const res = await fetch(`/api/market/quote?symbols=${watchlist.join(',')}`);
      const data = await res.json();
      return (data.quotes || []) as Quote[];
    },
    refetchInterval: 30000,
  });

  // Fetch candles using TanStack Query
  const { data: candles = [], isLoading: isLoadingChart } = useQuery({
    queryKey: ['candles', selectedSymbol],
    queryFn: async () => {
      const res = await fetch(`/api/market/candles?symbol=${selectedSymbol}&days=180`);
      const data = await res.json();
      return (data.candles || []) as Candle[];
    },
  });

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
        body: JSON.stringify({
          symbol: selectedSymbol,
          vectors: enabledVectors,
        }),
      });
      const data = await res.json();

      setAnalysisForSymbol(selectedSymbol);
      if (data.technical) setTechnical(data.technical);
      if (data.patterns) setPatterns(data.patterns);
      if (data.volume) setVolumeAnalysis(data.volume);
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

  // Save signal to DB
  const saveSignal = useCallback(async (signal: ConfluenceResult) => {
    try {
      await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: signal.symbol,
          direction: signal.overallDirection,
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit,
          riskReward: signal.riskReward,
          confluenceScore: signal.confluenceScore,
          vectorsUsed: signal.vectorSignals.map(s => s.vectorName),
          analysisDetail: signal.vectorSignals,
        }),
      });
      toast.success('Señal guardada');
    } catch {
      toast.error('Error al guardar señal');
    }
  }, []);

  // Add journal entry
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

  // Save broker config
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

  // Disconnect broker
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

  // Manual refresh handler
  const handleRefreshQuotes = useCallback(() => {
    refetchQuotes();
  }, [refetchQuotes]);

  // Current quote
  const currentQuote = quotes.find(q => q.symbol === selectedSymbol);

  return (
    <div className="h-screen flex flex-col trading-bg text-white overflow-hidden">
      {/* HEADER */}
      <header className="h-12 border-b border-white/5 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Target className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="font-bold text-sm">TradeIQ</span>
            <Badge className="text-[8px] border-0 bg-emerald-500/10 text-emerald-400">BETA</Badge>
          </div>

          {/* Symbol Search */}
          <div className="relative ml-4">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar símbolo..."
              className="h-7 w-40 pl-7 pr-2 text-xs bg-white/5 border border-white/10 rounded-md focus:outline-none focus:border-emerald-500/50 text-white placeholder-gray-500"
              value={searchSymbol}
              onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchSymbol) {
                  useAppStore.getState().setSelectedSymbol(searchSymbol);
                  setSearchSymbol('');
                }
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Current Symbol Info */}
          {currentQuote && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold">{currentQuote.symbol}</span>
              <span className="text-sm font-mono">${currentQuote.price.toFixed(2)}</span>
              <span className={`text-xs font-mono ${currentQuote.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {currentQuote.change >= 0 ? '+' : ''}{currentQuote.changePercent.toFixed(2)}%
              </span>
            </div>
          )}

          {/* Analyze Button */}
          <Button
            size="sm"
            className={`h-7 text-xs gap-1.5 ${
              isAnalyzing
                ? 'bg-gray-600'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
            onClick={runAnalysis}
            disabled={isAnalyzing || enabledVectors.length === 0}
          >
            {isAnalyzing ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Zap className="w-3 h-3" />
            )}
            {isAnalyzing ? 'Analizando...' : 'Analizar'}
          </Button>

          {/* Broker Status */}
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${brokerConfig?.isActive ? 'bg-emerald-400' : 'bg-gray-600'}`} />
            <span className="text-[10px] text-gray-500">
              {brokerConfig?.isActive ? 'Broker OK' : 'Sin broker'}
            </span>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT SIDEBAR */}
        <aside className="w-56 border-r border-white/5 flex flex-col overflow-hidden flex-shrink-0">
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
        </aside>

        {/* CENTER - CHART */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Chart Area */}
          <div className="flex-1 p-2 min-h-0">
            <div className="w-full h-full rounded-lg overflow-hidden trading-card">
              <TradingChart candles={candles} symbol={selectedSymbol} />
            </div>
          </div>

          {/* Bottom Analysis Summary Bar */}
          {activeConfluence && (
            <div className="h-16 border-t border-white/5 px-4 flex items-center gap-6 flex-shrink-0">
              {/* Direction */}
              <div className="flex items-center gap-2">
                {activeConfluence.overallDirection === 'LONG' ? (
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                ) : activeConfluence.overallDirection === 'SHORT' ? (
                  <TrendingUp className="w-5 h-5 text-red-400 rotate-180" />
                ) : (
                  <BarChart3 className="w-5 h-5 text-yellow-400" />
                )}
                <div>
                  <p className="text-xs font-bold">
                    {activeConfluence.overallDirection === 'LONG' ? 'ALCISTA' :
                     activeConfluence.overallDirection === 'SHORT' ? 'BAJISTA' : 'NEUTRAL'}
                  </p>
                  <p className="text-[10px] text-gray-500">Dirección</p>
                </div>
              </div>

              {/* Confluence Score */}
              <div>
                <p className={`text-lg font-bold font-mono ${
                  activeConfluence.confluenceScore >= 70 ? 'text-emerald-400' :
                  activeConfluence.confluenceScore >= 40 ? 'text-yellow-400' : 'text-gray-400'
                }`}>
                  {activeConfluence.confluenceScore}%
                </p>
                <p className="text-[10px] text-gray-500">Confluencia</p>
              </div>

              {/* R:R */}
              <div>
                <p className="text-sm font-bold font-mono text-white">
                  {activeConfluence.riskReward.toFixed(2)}
                </p>
                <p className="text-[10px] text-gray-500">Riesgo:Beneficio</p>
              </div>

              {/* Entry */}
              <div>
                <p className="text-sm font-mono text-white">${activeConfluence.entryPrice.toFixed(2)}</p>
                <p className="text-[10px] text-gray-500">Entrada</p>
              </div>

              {/* SL */}
              <div>
                <p className="text-sm font-mono text-red-400">${activeConfluence.stopLoss.toFixed(2)}</p>
                <p className="text-[10px] text-gray-500">Stop Loss</p>
              </div>

              {/* TP */}
              <div>
                <p className="text-sm font-mono text-emerald-400">${activeConfluence.takeProfit.toFixed(2)}</p>
                <p className="text-[10px] text-gray-500">Take Profit</p>
              </div>

              {/* Active Vectors */}
              <div className="ml-auto">
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

        {/* RIGHT PANEL */}
        <aside className="w-72 border-l border-white/5 flex flex-col overflow-hidden flex-shrink-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            <TabsList className="w-full h-9 bg-transparent border-b border-white/5 rounded-none p-0 justify-start">
              <TabsTrigger
                value="analysis"
                className="h-9 text-[10px] data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 data-[state=active]:text-emerald-400 data-[state=active]:shadow-none rounded-none px-3"
              >
                <Activity className="w-3 h-3 mr-1" />
                Análisis
              </TabsTrigger>
              <TabsTrigger
                value="signals"
                className="h-9 text-[10px] data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 data-[state=active]:text-emerald-400 data-[state=active]:shadow-none rounded-none px-3"
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
                value="journal"
                className="h-9 text-[10px] data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 data-[state=active]:text-emerald-400 data-[state=active]:shadow-none rounded-none px-3"
              >
                <BookOpen className="w-3 h-3 mr-1" />
                Bitácora
              </TabsTrigger>
              <TabsTrigger
                value="broker"
                className="h-9 text-[10px] data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 data-[state=active]:text-emerald-400 data-[state=active]:shadow-none rounded-none px-3"
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
        </aside>
      </div>
    </div>
  );
}
