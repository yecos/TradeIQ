'use client';

import type { TechnicalAnalysis, PatternAnalysis, VolumeAnalysis, ConfluenceResult } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  AlertTriangle,
  BarChart3,
} from 'lucide-react';

interface AnalysisPanelProps {
  technical: TechnicalAnalysis | null;
  patterns: PatternAnalysis | null;
  volume: VolumeAnalysis | null;
  confluence: ConfluenceResult | null;
}

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === 'LONG') return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (direction === 'SHORT') return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-yellow-400" />;
}

function ScoreGauge({ score, label }: { score: number; label: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-gray-500">{label}</span>
        <span className={`font-mono ${
          score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-yellow-400' : 'text-red-400'
        }`}>
          {score}%
        </span>
      </div>
      <Progress value={score} className="h-1.5 bg-white/5" />
    </div>
  );
}

export function AnalysisPanel({ technical, patterns, volume, confluence }: AnalysisPanelProps) {
  return (
    <div className="space-y-4 custom-scrollbar max-h-[500px] overflow-y-auto p-1">
      {/* Confluence Score */}
      {confluence && (
        <div className="p-3 rounded-lg trading-card-accent">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-300">Confluencia</span>
            <div className="flex items-center gap-1.5">
              <DirectionIcon direction={confluence.overallDirection} />
              <span className={`text-sm font-bold ${
                confluence.overallDirection === 'LONG' ? 'text-emerald-400' :
                confluence.overallDirection === 'SHORT' ? 'text-red-400' : 'text-yellow-400'
              }`}>
                {confluence.overallDirection}
              </span>
            </div>
          </div>
          <ScoreGauge score={confluence.confluenceScore} label="Score" />
          <div className="grid grid-cols-4 gap-1.5 mt-2">
            <div className="text-center p-1.5 rounded bg-white/5">
              <p className="text-[9px] text-gray-500">Entrada</p>
              <p className="text-[10px] font-mono text-white">${confluence.entryPrice.toFixed(2)}</p>
            </div>
            <div className="text-center p-1.5 rounded bg-white/5">
              <p className="text-[9px] text-gray-500">SL</p>
              <p className="text-[10px] font-mono text-red-400">${confluence.stopLoss.toFixed(2)}</p>
            </div>
            <div className="text-center p-1.5 rounded bg-white/5">
              <p className="text-[9px] text-gray-500">TP</p>
              <p className="text-[10px] font-mono text-emerald-400">${confluence.takeProfit.toFixed(2)}</p>
            </div>
            <div className="text-center p-1.5 rounded bg-white/5">
              <p className="text-[9px] text-gray-500">R:R</p>
              <p className="text-[10px] font-mono text-white">{confluence.riskReward.toFixed(2)}</p>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">{confluence.recommendation}</p>
        </div>
      )}

      {/* Technical Indicators */}
      {technical && (
        <div className="p-3 rounded-lg trading-card">
          <div className="flex items-center gap-1.5 mb-2">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-semibold text-gray-300">Indicadores Técnicos</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded bg-white/5">
              <p className="text-[9px] text-gray-500">RSI (14)</p>
              <p className={`text-xs font-mono ${technical.rsi > 70 ? 'text-red-400' : technical.rsi < 30 ? 'text-emerald-400' : 'text-white'}`}>
                {technical.rsi.toFixed(1)}
              </p>
            </div>
            <div className="p-2 rounded bg-white/5">
              <p className="text-[9px] text-gray-500">MACD</p>
              <p className={`text-xs font-mono ${technical.macd.histogram > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {technical.macd.histogram.toFixed(2)}
              </p>
            </div>
            <div className="p-2 rounded bg-white/5">
              <p className="text-[9px] text-gray-500">EMA 20</p>
              <p className="text-xs font-mono text-white">${technical.ema20.toFixed(2)}</p>
            </div>
            <div className="p-2 rounded bg-white/5">
              <p className="text-[9px] text-gray-500">EMA 50</p>
              <p className="text-xs font-mono text-white">${technical.ema50.toFixed(2)}</p>
            </div>
            <div className="p-2 rounded bg-white/5">
              <p className="text-[9px] text-gray-500">ADX</p>
              <p className={`text-xs font-mono ${technical.adx > 25 ? 'text-emerald-400' : 'text-gray-400'}`}>
                {technical.adx.toFixed(1)}
              </p>
            </div>
            <div className="p-2 rounded bg-white/5">
              <p className="text-[9px] text-gray-500">ATR</p>
              <p className="text-xs font-mono text-white">${technical.atr.toFixed(2)}</p>
            </div>
          </div>
          <div className="mt-2 space-y-1">
            {technical.signals.slice(0, 3).map((s, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px]">
                <DirectionIcon direction={s.direction} />
                <span className="text-gray-400">{s.vectorName}:</span>
                <span className="text-gray-300">{s.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Patterns */}
      {patterns && patterns.patterns.length > 0 && (
        <div className="p-3 rounded-lg trading-card">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-xs font-semibold text-gray-300">Patrones de Vela</span>
          </div>
          {patterns.patterns.map((p, i) => (
            <div key={i} className="flex items-start gap-2 mb-2 last:mb-0">
              <Badge
                className={`text-[9px] border-0 flex-shrink-0 ${
                  p.type === 'bullish' ? 'bg-emerald-500/15 text-emerald-400' :
                  p.type === 'bearish' ? 'bg-red-500/15 text-red-400' :
                  'bg-yellow-500/15 text-yellow-400'
                }`}
              >
                {p.type === 'bullish' ? 'ALCISTA' : p.type === 'bearish' ? 'BAJISTA' : 'NEUTRAL'}
              </Badge>
              <div>
                <p className="text-[10px] font-medium text-white">{p.name}</p>
                <p className="text-[9px] text-gray-500">{p.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Volume */}
      {volume && (
        <div className="p-3 rounded-lg trading-card">
          <div className="flex items-center gap-1.5 mb-2">
            <BarChart3 className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs font-semibold text-gray-300">Volumen</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded bg-white/5">
              <p className="text-[9px] text-gray-500">Ratio</p>
              <p className={`text-xs font-mono ${volume.volumeRatio > 1.5 ? 'text-emerald-400' : 'text-white'}`}>
                {volume.volumeRatio.toFixed(2)}x
              </p>
            </div>
            <div className="p-2 rounded bg-white/5">
              <p className="text-[9px] text-gray-500">Acum/Dist</p>
              <p className={`text-xs font-mono ${
                volume.accumulationDistribution === 'accumulation' ? 'text-emerald-400' :
                volume.accumulationDistribution === 'distribution' ? 'text-red-400' : 'text-gray-400'
              }`}>
                {volume.accumulationDistribution === 'accumulation' ? 'Acumulación' :
                 volume.accumulationDistribution === 'distribution' ? 'Distribución' : 'Neutral'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* No data state */}
      {!technical && !patterns && !volume && !confluence && (
        <div className="flex flex-col items-center justify-center py-8 text-gray-500">
          <Activity className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-xs">Selecciona un símbolo y haz clic en Analizar</p>
        </div>
      )}
    </div>
  );
}
