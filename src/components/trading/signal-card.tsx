'use client';

import type { ConfluenceResult } from '@/lib/types';
import { ArrowUpCircle, ArrowDownCircle, MinusCircle, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface SignalCardProps {
  signal: ConfluenceResult;
  onSave?: (signal: ConfluenceResult) => void;
}

export function SignalCard({ signal, onSave }: SignalCardProps) {
  const isLong = signal.overallDirection === 'LONG';
  const isShort = signal.overallDirection === 'SHORT';

  return (
    <div
      className={`p-3 rounded-lg trading-card ${
        isLong ? 'signal-long' : isShort ? 'signal-short' : 'signal-neutral'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isLong ? (
            <ArrowUpCircle className="w-4 h-4 text-emerald-400" />
          ) : isShort ? (
            <ArrowDownCircle className="w-4 h-4 text-red-400" />
          ) : (
            <MinusCircle className="w-4 h-4 text-yellow-400" />
          )}
          <span className="font-bold text-sm text-white">{signal.symbol}</span>
          <Badge
            className={`text-[10px] border-0 ${
              isLong
                ? 'bg-emerald-500/15 text-emerald-400'
                : isShort
                ? 'bg-red-500/15 text-red-400'
                : 'bg-yellow-500/15 text-yellow-400'
            }`}
          >
            {signal.overallDirection}
          </Badge>
        </div>
        <Badge
          className={`text-[10px] border-0 ${
            signal.confluenceScore >= 70
              ? 'bg-emerald-500/20 text-emerald-300'
              : signal.confluenceScore >= 40
              ? 'bg-yellow-500/20 text-yellow-300'
              : 'bg-gray-500/20 text-gray-400'
          }`}
        >
          {signal.confluenceScore}% confluencia
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-2 text-xs">
        <div>
          <span className="text-gray-500">Entrada</span>
          <p className="text-white font-mono">${signal.entryPrice.toFixed(2)}</p>
        </div>
        <div>
          <span className="text-gray-500">Stop Loss</span>
          <p className="text-red-400 font-mono">${signal.stopLoss.toFixed(2)}</p>
        </div>
        <div>
          <span className="text-gray-500">Take Profit</span>
          <p className="text-emerald-400 font-mono">${signal.takeProfit.toFixed(2)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-gray-500">
          R:R {signal.riskReward.toFixed(2)} | {signal.vectorSignals.length} vectores
        </span>
      </div>

      <p className="text-[10px] text-gray-400 mb-2 line-clamp-2">
        {signal.recommendation}
      </p>

      {onSave && (
        <Button
          size="sm"
          variant="ghost"
          className="w-full text-[10px] h-6 text-gray-400 hover:text-white"
          onClick={() => onSave(signal)}
        >
          <Save className="w-3 h-3 mr-1" />
          Guardar Señal
        </Button>
      )}
    </div>
  );
}
