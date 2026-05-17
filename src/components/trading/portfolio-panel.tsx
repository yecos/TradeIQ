'use client';

import { useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePortfolio } from '@/hooks/use-portfolio';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  BarChart3,
  RefreshCw,
  Target,
  Flame,
  Award,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Link2,
} from 'lucide-react';
import { toast } from 'sonner';

interface PortfolioPanelProps {
  brokerConnected: boolean;
}

// ─── Sparkline Component ────────────────────────────────────────────────────

function EquitySparkline({ dailyPnl, totalPnl }: { dailyPnl: number; totalPnl: number }) {
  // Generate a 20-point sparkline reflecting the trend direction
  const points = useMemo(() => {
    const count = 20;
    const pts: number[] = [];
    // Seed based on direction
    const trendUp = dailyPnl >= 0 && totalPnl >= 0;
    const trendMixed = (dailyPnl >= 0) !== (totalPnl >= 0);
    let y = trendUp ? 60 : trendMixed ? 50 : 40;

    for (let i = 0; i < count; i++) {
      const progress = i / (count - 1);
      // Pseudo-random deterministic variation
      const noise = Math.sin(i * 3.7 + 1.2) * 8 + Math.cos(i * 2.3 + 0.5) * 5;
      if (trendUp) {
        y = 70 - progress * 40 + noise;
      } else if (trendMixed) {
        y = 50 + noise;
      } else {
        y = 30 + progress * 40 + noise;
      }
      y = Math.max(5, Math.min(95, y));
      pts.push(y);
    }
    return pts;
  }, [dailyPnl, totalPnl]);

  const svgW = 120;
  const svgH = 36;
  const polyPts = points
    .map((y, i) => `${(i / (points.length - 1)) * svgW},${(y / 100) * svgH}`)
    .join(' ');

  const isPositive = dailyPnl >= 0;
  const strokeColor = isPositive ? '#34d399' : '#f87171';
  // Build area path for the gradient fill below the line
  const areaPath = points
    .map((y, i) => {
      const x = (i / (points.length - 1)) * svgW;
      const yPos = (y / 100) * svgH;
      return `${i === 0 ? 'M' : 'L'}${x},${yPos}`;
    })
    .join(' ') + ` L${svgW},${svgH} L0,${svgH} Z`;

  return (
    <svg
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="flex-shrink-0"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="sparkGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#sparkGrad)" />
      <polyline
        points={polyPts}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Win Rate Circular Indicator ────────────────────────────────────────────

function WinRateCircle({ winRate }: { winRate: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const filled = (winRate / 100) * circumference;
  const color =
    winRate >= 60 ? '#34d399' : winRate >= 40 ? '#fbbf24' : '#f87171';

  return (
    <div className="relative w-12 h-12 flex items-center justify-center">
      <svg width="48" height="48" viewBox="0 0 48 48" className="-rotate-90">
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="3"
        />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
        />
      </svg>
      <span className="absolute text-[10px] font-mono font-bold text-white">
        {winRate.toFixed(0)}%
      </span>
    </div>
  );
}

// ─── PnL Display Helper ─────────────────────────────────────────────────────

function PnLValue({
  value,
  showPercent,
  percentValue,
  size = 'xs',
}: {
  value: number;
  showPercent?: boolean;
  percentValue?: number;
  size?: 'xs' | 'sm';
}) {
  const isPositive = value >= 0;
  const colorClass = isPositive ? 'text-emerald-400' : 'text-red-400';
  const sizeClass = size === 'sm' ? 'text-sm' : 'text-xs';

  return (
    <span className={`font-mono font-bold ${colorClass} ${sizeClass}`}>
      {isPositive ? '+' : ''}${value.toFixed(2)}
      {showPercent && percentValue != null && (
        <span className="ml-1 opacity-70">
          ({isPositive ? '+' : ''}{percentValue.toFixed(2)}%)
        </span>
      )}
    </span>
  );
}

// ─── Metric Card ────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sublabel,
  icon,
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="p-2 rounded bg-white/5">
      <p className="text-[9px] text-gray-500 flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-xs font-mono text-white mt-0.5">{value}</p>
      {sublabel && (
        <p className="text-[9px] text-gray-500 mt-0.5">{sublabel}</p>
      )}
    </div>
  );
}

// ─── Main PortfolioPanel ────────────────────────────────────────────────────

export function PortfolioPanel({ brokerConnected }: PortfolioPanelProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = usePortfolio({
    brokerConnected,
  });

  // Close position mutation
  const closePositionMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const res = await fetch(
        `/api/broker/positions?symbol=${encodeURIComponent(symbol)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Failed to close position');
      return res.json();
    },
    onSuccess: (_, symbol) => {
      toast.success(`Posición ${symbol} cerrada`);
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['brokerData'] });
    },
    onError: () => {
      toast.error('Error al cerrar posición');
    },
  });

  const handleClosePosition = useCallback(
    (symbol: string) => {
      closePositionMutation.mutate(symbol);
    },
    [closePositionMutation]
  );

  // ─── Empty State: No Broker Connected ──────────────────────────────────
  if (!brokerConnected) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs font-semibold text-gray-300">
              Portafolio
            </span>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-10 text-gray-500">
          <Link2 className="w-8 h-8 mb-3 opacity-40" />
          <p className="text-xs text-center leading-relaxed">
            Conecta tu broker para ver el portafolio
          </p>
        </div>
      </div>
    );
  }

  // ─── Loading State ─────────────────────────────────────────────────────
  if (isLoading && !data) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs font-semibold text-gray-300">
              Portafolio
            </span>
          </div>
          <RefreshCw className="w-3 h-3 animate-spin text-gray-500" />
        </div>
        <div className="p-4 rounded-lg trading-card space-y-3">
          <div className="h-6 w-32 rounded bg-white/5 animate-pulse" />
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-12 rounded bg-white/5 animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Error State ───────────────────────────────────────────────────────
  if (error && !data) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs font-semibold text-gray-300">
              Portafolio
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-5 w-5 p-0 text-gray-500"
            onClick={() => refetch()}
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-gray-500">
          <XCircle className="w-6 h-6 mb-2 text-red-400" />
          <p className="text-[10px] text-center">Error al cargar portafolio</p>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] text-gray-400 mt-2"
            onClick={() => refetch()}
          >
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  const snapshot = data?.snapshot;
  const positions = data?.positions ?? [];
  const metrics = data?.metrics;

  const equity = snapshot?.equity ?? 0;
  const dailyPnl = snapshot?.dailyPnl ?? 0;
  const totalPnl = snapshot?.totalPnl ?? 0;
  const unrealizedPnl = snapshot?.unrealizedPnl ?? 0;

  // Compute daily P&L percentage
  const dailyPnlPercent =
    equity > 0 && dailyPnl !== 0
      ? (dailyPnl / (equity - dailyPnl)) * 100
      : 0;

  // Compute total P&L percentage
  const totalPnlPercent =
    equity > 0 && totalPnl !== 0
      ? metrics?.totalPnlPercent ?? (totalPnl / (equity - totalPnl)) * 100
      : 0;

  return (
    <div className="space-y-3 custom-scrollbar max-h-[500px] overflow-y-auto p-0.5">
      {/* ─── A. Portfolio Summary Card ─────────────────────────────────── */}
      <div className="p-3 rounded-lg trading-card space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-semibold text-gray-300">
              Portafolio
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Badge className="text-[8px] border-0 bg-emerald-500/15 text-emerald-400">
              ACTIVO
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 w-5 p-0 text-gray-500"
              onClick={() => refetch()}
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Equity Value */}
        <div>
          <p className="text-[10px] text-gray-500">Valor de Cuenta</p>
          <p className="text-lg font-bold font-mono text-white leading-tight">
            ${equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        {/* Sparkline + P&L Row */}
        <div className="flex items-center gap-3">
          <EquitySparkline dailyPnl={dailyPnl} totalPnl={totalPnl} />
          <div className="flex-1 space-y-1">
            {/* Daily P&L */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500">P&L Diario</span>
              <div className="flex items-center gap-1">
                {dailyPnl >= 0 ? (
                  <ArrowUpRight className="w-3 h-3 text-emerald-400" />
                ) : (
                  <ArrowDownRight className="w-3 h-3 text-red-400" />
                )}
                <PnLValue value={dailyPnl} percentValue={dailyPnlPercent} showPercent />
              </div>
            </div>
            {/* Total P&L */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500">P&L Total</span>
              <div className="flex items-center gap-1">
                {totalPnl >= 0 ? (
                  <ArrowUpRight className="w-3 h-3 text-emerald-400" />
                ) : totalPnl < 0 ? (
                  <ArrowDownRight className="w-3 h-3 text-red-400" />
                ) : (
                  <Minus className="w-3 h-3 text-gray-500" />
                )}
                <PnLValue value={totalPnl} percentValue={totalPnlPercent} showPercent />
              </div>
            </div>
            {/* Unrealized P&L */}
            {unrealizedPnl !== 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">No Realizado</span>
                <PnLValue value={unrealizedPnl} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── B. Key Metrics Grid (2x3) ────────────────────────────────── */}
      {metrics && (
        <div className="p-3 rounded-lg trading-card space-y-2">
          <div className="flex items-center gap-1.5 mb-1">
            <BarChart3 className="w-3 h-3 text-gray-400" />
            <span className="text-xs font-semibold text-gray-300">
              Métricas
            </span>
          </div>

          {/* Win Rate Row */}
          <div className="flex items-center gap-3 p-2 rounded bg-white/5">
            <WinRateCircle winRate={metrics.winRate} />
            <div>
              <p className="text-[10px] text-gray-500">Win Rate</p>
              <p className="text-sm font-bold font-mono text-white">
                {metrics.winRate.toFixed(1)}%
              </p>
              <p className="text-[9px] text-gray-500">
                {metrics.winningTrades}G / {metrics.losingTrades}P de{' '}
                {metrics.totalTrades}
              </p>
            </div>
          </div>

          {/* 2x2 Metric Cards */}
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              label="Profit Factor"
              value={
                metrics.profitFactor === Infinity
                  ? '∞'
                  : metrics.profitFactor.toFixed(2)
              }
              icon={<Target className="w-2.5 h-2.5 text-emerald-400" />}
            />
            <MetricCard
              label="Total Trades"
              value={metrics.totalTrades.toString()}
              icon={<BarChart3 className="w-2.5 h-2.5 text-gray-400" />}
            />
            <MetricCard
              label="Ganancia Prom."
              value={`+$${metrics.avgWin.toFixed(2)}`}
              sublabel={
                metrics.bestTrade > 0
                  ? `Mejor: +$${metrics.bestTrade.toFixed(2)}`
                  : undefined
              }
              icon={<TrendingUp className="w-2.5 h-2.5 text-emerald-400" />}
            />
            <MetricCard
              label="Pérdida Prom."
              value={`-$${metrics.avgLoss.toFixed(2)}`}
              sublabel={
                metrics.worstTrade < 0
                  ? `Peor: -$${Math.abs(metrics.worstTrade).toFixed(2)}`
                  : undefined
              }
              icon={<TrendingDown className="w-2.5 h-2.5 text-red-400" />}
            />
          </div>

          {/* Current Streak */}
          <div className="flex items-center justify-between p-2 rounded bg-white/5">
            <div className="flex items-center gap-1.5">
              <Flame
                className={`w-3 h-3 ${
                  metrics.currentStreak > 0
                    ? 'text-emerald-400'
                    : metrics.currentStreak < 0
                    ? 'text-red-400'
                    : 'text-gray-500'
                }`}
              />
              <span className="text-[10px] text-gray-500">Racha Actual</span>
            </div>
            <div className="flex items-center gap-1">
              {metrics.currentStreak > 0 ? (
                <>
                  <Award className="w-3 h-3 text-emerald-400" />
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    {metrics.currentStreak} wins
                  </span>
                </>
              ) : metrics.currentStreak < 0 ? (
                <>
                  <XCircle className="w-3 h-3 text-red-400" />
                  <span className="text-xs font-mono font-bold text-red-400">
                    {Math.abs(metrics.currentStreak)} losses
                  </span>
                </>
              ) : (
                <span className="text-xs font-mono text-gray-500">—</span>
              )}
            </div>
          </div>

          {/* Avg Duration (if meaningful) */}
          {metrics.avgTradeDurationHours > 0 && (
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[9px] text-gray-600">
                Duración Prom.
              </span>
              <span className="text-[9px] font-mono text-gray-400">
                {metrics.avgTradeDurationHours >= 24
                  ? `${(metrics.avgTradeDurationHours / 24).toFixed(1)}d`
                  : `${metrics.avgTradeDurationHours.toFixed(1)}h`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ─── C. Open Positions List ────────────────────────────────────── */}
      <div className="rounded-lg trading-card overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="w-3 h-3 text-gray-400" />
            <span className="text-xs font-semibold text-gray-300">
              Posiciones
            </span>
            {positions.length > 0 && (
              <Badge className="text-[8px] border-0 bg-white/10 text-gray-400 ml-1">
                {positions.length}
              </Badge>
            )}
          </div>
        </div>

        {positions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-gray-500">
            <BarChart3 className="w-6 h-6 mb-2 opacity-30" />
            <p className="text-[10px]">Sin posiciones abiertas</p>
          </div>
        ) : (
          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {positions.map((pos) => (
              <div
                key={pos.symbol}
                className="px-3 py-2 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
              >
                {/* Top Row: Symbol + Side + Close */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white">
                      {pos.symbol}
                    </span>
                    <Badge
                      className={`text-[7px] border-0 ${
                        pos.side === 'long'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-red-500/15 text-red-400'
                      }`}
                    >
                      {pos.side.toUpperCase()}
                    </Badge>
                    <span className="text-[9px] text-gray-500">
                      x{pos.qty}
                    </span>
                  </div>
                  <button
                    className="text-[9px] text-red-400/70 hover:text-red-400 transition-colors"
                    onClick={() => handleClosePosition(pos.symbol)}
                    disabled={closePositionMutation.isPending}
                  >
                    Cerrar
                  </button>
                </div>

                {/* Mid Row: Entry + Current Price */}
                <div className="flex items-center justify-between text-[9px] mb-1">
                  <span className="text-gray-500">
                    Entry: ${pos.avgEntryPrice.toFixed(2)}
                  </span>
                  <span className="text-gray-400">
                    Ahora: ${pos.currentPrice.toFixed(2)}
                  </span>
                </div>

                {/* Bottom Row: Unrealized P&L + Market Value */}
                <div className="flex items-center justify-between">
                  <PnLValue
                    value={pos.unrealizedPnl}
                    showPercent
                    percentValue={pos.unrealizedPnlPercent}
                  />
                  <span className="text-[9px] font-mono text-gray-500">
                    ${pos.marketValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Loading Indicator for Refetch ─────────────────────────────── */}
      {isLoading && data && (
        <div className="flex items-center justify-center py-1">
          <RefreshCw className="w-3 h-3 animate-spin text-gray-600" />
        </div>
      )}
    </div>
  );
}
