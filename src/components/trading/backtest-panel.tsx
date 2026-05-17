'use client';

import { useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { BacktestResult } from '@/lib/backtest/types';
import {
  Play,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Target,
  AlertTriangle,
  Trophy,
  ArrowDownRight,
  ArrowUpRight,
  Activity,
} from 'lucide-react';
import { toast } from 'sonner';

const AVAILABLE_VECTORS = [
  { id: 'technical', label: 'Técnicos', color: 'bg-emerald-500' },
  { id: 'pattern', label: 'Patrones', color: 'bg-yellow-500' },
  { id: 'volume', label: 'Volumen', color: 'bg-purple-500' },
  { id: 'news', label: 'Noticias', color: 'bg-red-500' },
  { id: 'sentiment', label: 'Sentimiento', color: 'bg-pink-500' },
  { id: 'macro', label: 'Macro', color: 'bg-blue-500' },
];

export function BacktestPanel() {
  const { selectedSymbol } = useAppStore();
  const [selectedVectors, setSelectedVectors] = useState<string[]>(['technical', 'pattern', 'volume']);
  const [minConfluence, setMinConfluence] = useState(40);
  const [initialCapital, setInitialCapital] = useState(10000);
  const [result, setResult] = useState<BacktestResult | null>(null);

  const toggleVector = (vectorId: string) => {
    setSelectedVectors(prev =>
      prev.includes(vectorId)
        ? prev.filter(v => v !== vectorId)
        : [...prev, vectorId]
    );
  };

  const runBacktestTest = useCallback(async () => {
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedSymbol,
          vectors: selectedVectors,
          minConfluenceScore: minConfluence,
          initialCapital,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Backtest failed');
      }

      const data: BacktestResult = await res.json();
      setResult(data);
      toast.success(`Backtest completado: ${data.metrics.totalTrades} trades`);
    } catch (error) {
      toast.error(`Error en backtest: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [selectedSymbol, selectedVectors, minConfluence, initialCapital]);

  return (
    <div className="space-y-4">
      {/* Configuration */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Configuración</h3>

        {/* Vectors */}
        <div className="space-y-2">
          <span className="text-[10px] text-gray-500">Vectores</span>
          <div className="space-y-1.5">
            {AVAILABLE_VECTORS.map(v => (
              <div key={v.id} className="flex items-center gap-2">
                <Switch
                  checked={selectedVectors.includes(v.id)}
                  onCheckedChange={() => toggleVector(v.id)}
                  className="data-[state=checked]:bg-emerald-600 h-3.5 w-7"
                />
                <div className={`w-1.5 h-1.5 rounded-full ${v.color}`} />
                <span className="text-[11px] text-gray-300">{v.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Min Confluence */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] text-gray-500">Confluencia mínima</Label>
            <span className="text-[11px] font-mono text-emerald-400">{minConfluence}%</span>
          </div>
          <Input
            type="range"
            min={20}
            max={80}
            value={minConfluence}
            onChange={(e) => setMinConfluence(Number(e.target.value))}
            className="h-1 accent-emerald-500"
          />
        </div>

        {/* Initial Capital */}
        <div className="space-y-1">
          <Label className="text-[10px] text-gray-500">Capital inicial</Label>
          <Input
            type="number"
            value={initialCapital}
            onChange={(e) => setInitialCapital(Number(e.target.value))}
            className="h-7 text-xs bg-white/5 border-white/10"
          />
        </div>

        {/* Run button */}
        <Button
          onClick={runBacktestTest}
          className="w-full h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          disabled={selectedVectors.length === 0}
        >
          <Play className="w-3 h-3" />
          Ejecutar Backtest — {selectedSymbol}
        </Button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Resultados</h3>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              label="Total P&L"
              value={`${result.metrics.totalPnlPercent > 0 ? '+' : ''}${result.metrics.totalPnlPercent}%`}
              icon={result.metrics.totalPnlPercent >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              color={result.metrics.totalPnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}
            />
            <MetricCard
              label="Win Rate"
              value={`${result.metrics.winRate.toFixed(1)}%`}
              icon={<Trophy className="w-3 h-3" />}
              color={result.metrics.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}
            />
            <MetricCard
              label="Profit Factor"
              value={result.metrics.profitFactor.toFixed(2)}
              icon={<Target className="w-3 h-3" />}
              color={result.metrics.profitFactor >= 1.5 ? 'text-emerald-400' : 'text-yellow-400'}
            />
            <MetricCard
              label="Max Drawdown"
              value={`-${result.metrics.maxDrawdown}%`}
              icon={<AlertTriangle className="w-3 h-3" />}
              color="text-red-400"
            />
            <MetricCard
              label="Sharpe Ratio"
              value={result.metrics.sharpeRatio.toFixed(2)}
              icon={<Activity className="w-3 h-3" />}
              color={result.metrics.sharpeRatio >= 1 ? 'text-emerald-400' : 'text-yellow-400'}
            />
            <MetricCard
              label="Total Trades"
              value={result.metrics.totalTrades.toString()}
              icon={<BarChart3 className="w-3 h-3" />}
              color="text-blue-400"
            />
          </div>

          {/* Detailed breakdown */}
          <div className="space-y-2 text-[11px]">
            <div className="flex justify-between text-gray-400">
              <span>Ganancias</span>
              <span className="text-emerald-400">{result.metrics.wins}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Pérdidas</span>
              <span className="text-red-400">{result.metrics.losses}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Promedio ganancia</span>
              <span className="text-emerald-400">+{result.metrics.avgWin}%</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Promedio pérdida</span>
              <span className="text-red-400">-{result.metrics.avgLoss}%</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Mejor trade</span>
              <span className="text-emerald-400">+{result.metrics.bestTrade}%</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Peor trade</span>
              <span className="text-red-400">{result.metrics.worstTrade}%</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Prom. días en trade</span>
              <span className="text-white">{result.metrics.avgHoldingDays}</span>
            </div>

            {/* Direction breakdown */}
            <div className="pt-2 border-t border-white/5">
              <div className="flex justify-between text-gray-400">
                <span className="flex items-center gap-1"><ArrowUpRight className="w-3 h-3 text-emerald-400" /> LONG</span>
                <span>{result.metrics.longTrades} trades ({result.metrics.longWinRate.toFixed(1)}% win)</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span className="flex items-center gap-1"><ArrowDownRight className="w-3 h-3 text-red-400" /> SHORT</span>
                <span>{result.metrics.shortTrades} trades ({result.metrics.shortWinRate.toFixed(1)}% win)</span>
              </div>
            </div>
          </div>

          {/* Recent trades list */}
          {result.trades.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-[10px] text-gray-500 uppercase tracking-wider">Últimos trades</h4>
              <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-1">
                {result.trades.slice(-10).reverse().map(trade => (
                  <div
                    key={trade.id}
                    className="flex items-center justify-between text-[10px] p-1.5 rounded bg-white/[0.02]"
                  >
                    <div className="flex items-center gap-1.5">
                      <Badge className={`text-[8px] h-3.5 ${
                        trade.direction === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {trade.direction}
                      </Badge>
                      <span className="text-gray-400">${trade.entryPrice.toFixed(2)}</span>
                    </div>
                    <span className={`font-mono ${
                      trade.result === 'win' ? 'text-emerald-400' :
                      trade.result === 'loss' ? 'text-red-400' : 'text-gray-400'
                    }`}>
                      {trade.pnlPercent !== null ? `${trade.pnlPercent > 0 ? '+' : ''}${trade.pnlPercent}%` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Metric Card Component ---

function MetricCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-white/[0.02] rounded-lg p-2 space-y-1">
      <div className="flex items-center gap-1 text-gray-500">
        {icon}
        <span className="text-[9px]">{label}</span>
      </div>
      <p className={`text-sm font-bold font-mono ${color}`}>{value}</p>
    </div>
  );
}
