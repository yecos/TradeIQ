'use client';

import { useState } from 'react';
import type { ConfluenceResult } from '@/lib/types';
import { ArrowUpCircle, ArrowDownCircle, MinusCircle, Save, Zap, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface RiskAssessPreview {
  allowed: boolean;
  reason: string | null;
  positionSize: number;
  positionValue: number;
  riskAmount: number;
  riskPercent: number;
  warnings: string[];
}

interface SignalCardProps {
  signal: ConfluenceResult;
  onSave?: (signal: ConfluenceResult) => void;
  onExecute?: (signal: ConfluenceResult) => void;
  brokerConnected?: boolean;
}

export function SignalCard({ signal, onSave, onExecute, brokerConnected = false }: SignalCardProps) {
  const isLong = signal.overallDirection === 'LONG';
  const isShort = signal.overallDirection === 'SHORT';
  const [isAssessing, setIsAssessing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [riskPreview, setRiskPreview] = useState<RiskAssessPreview | null>(null);
  const [showRiskPreview, setShowRiskPreview] = useState(false);

  const assessTrade = async () => {
    if (!brokerConnected) {
      toast.error('Conecta un broker para ejecutar trades');
      return;
    }

    setIsAssessing(true);
    setShowRiskPreview(true);
    try {
      const res = await fetch('/api/trade/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confluence: signal }),
      });
      const data = await res.json();
      if (data.assessment) {
        setRiskPreview(data.assessment);
      } else {
        setRiskPreview({
          allowed: false,
          reason: data.error || 'Assessment failed',
          positionSize: 0,
          positionValue: 0,
          riskAmount: 0,
          riskPercent: 0,
          warnings: [],
        });
      }
    } catch {
      setRiskPreview({
        allowed: false,
        reason: 'Error de conexión',
        positionSize: 0,
        positionValue: 0,
        riskAmount: 0,
        riskPercent: 0,
        warnings: [],
      });
    }
    setIsAssessing(false);
  };

  const executeTrade = async () => {
    setIsExecuting(true);
    try {
      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confluence: signal }),
      });
      const data = await res.json();

      if (data.executed) {
        toast.success(`Orden ejecutada: ${signal.symbol} ${isLong ? 'BUY' : 'SELL'} x${data.risk?.positionSize || '?'}`);
        if (onExecute) onExecute(signal);
      } else {
        toast.error(`Trade rechazado: ${data.error || data.risk?.reason || 'Razón desconocida'}`);
      }
    } catch {
      toast.error('Error al ejecutar trade');
    }
    setIsExecuting(false);
    setShowRiskPreview(false);
    setRiskPreview(null);
  };

  return (
    <div
      className={`p-3 sm:p-4 rounded-lg trading-card ${
        isLong ? 'signal-long' : isShort ? 'signal-short' : 'signal-neutral'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isLong ? (
            <ArrowUpCircle className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
          ) : isShort ? (
            <ArrowDownCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
          ) : (
            <MinusCircle className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400" />
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
          className={`text-[10px] border-0 hidden sm:inline-flex ${
            signal.confluenceScore >= 70
              ? 'bg-emerald-500/20 text-emerald-300'
              : signal.confluenceScore >= 40
              ? 'bg-yellow-500/20 text-yellow-300'
              : 'bg-gray-500/20 text-gray-400'
          }`}
        >
          {signal.confluenceScore}% confluencia
        </Badge>
        <span
          className={`text-xs font-bold font-mono sm:hidden ${
            signal.confluenceScore >= 70
              ? 'text-emerald-400'
              : signal.confluenceScore >= 40
              ? 'text-yellow-400'
              : 'text-gray-400'
          }`}
        >
          {signal.confluenceScore}%
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-2 text-xs">
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

      {/* Risk Preview */}
      {showRiskPreview && riskPreview && (
        <div className={`p-2 rounded mb-2 text-[9px] ${
          riskPreview.allowed ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'
        }`}>
          {riskPreview.allowed ? (
            <>
              <div className="flex items-center gap-1 mb-1">
                <Zap className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400 font-semibold">Trade permitido</span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-gray-300">
                <span>Posición: {riskPreview.positionSize} shares</span>
                <span>Valor: ${riskPreview.positionValue.toFixed(2)}</span>
                <span>Riesgo: ${riskPreview.riskAmount.toFixed(2)}</span>
                <span>Riesgo%: {riskPreview.riskPercent.toFixed(2)}%</span>
              </div>
              {riskPreview.warnings.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {riskPreview.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1 text-yellow-400">
                      <AlertTriangle className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
              <span className="text-red-300">{riskPreview.reason}</span>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons — larger touch targets on mobile */}
      <div className="flex gap-1.5 sm:gap-2">
        {brokerConnected && signal.overallDirection !== 'NEUTRAL' && (
          <>
            {!showRiskPreview ? (
              <Button
                size="sm"
                className="flex-1 text-[10px] sm:text-xs h-8 sm:h-6 bg-emerald-600 hover:bg-emerald-700 min-h-[44px] sm:min-h-0"
                onClick={assessTrade}
                disabled={isAssessing}
              >
                {isAssessing ? (
                  <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin mr-1" />
                ) : (
                  <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
                )}
                Evaluar
              </Button>
            ) : riskPreview?.allowed ? (
              <Button
                size="sm"
                className="flex-1 text-[10px] sm:text-xs h-8 sm:h-6 bg-emerald-600 hover:bg-emerald-700 min-h-[44px] sm:min-h-0"
                onClick={executeTrade}
                disabled={isExecuting}
              >
                {isExecuting ? (
                  <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin mr-1" />
                ) : (
                  <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
                )}
                Confirmar
              </Button>
            ) : null}
          </>
        )}
        {onSave && (
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 text-[10px] sm:text-xs h-8 sm:h-6 text-gray-400 hover:text-white min-h-[44px] sm:min-h-0"
            onClick={() => onSave(signal)}
          >
            <Save className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
            Guardar
          </Button>
        )}
      </div>
    </div>
  );
}
