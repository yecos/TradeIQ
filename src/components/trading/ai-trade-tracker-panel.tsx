'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  CheckCircle2,
  XCircle,
  Timer,
  AlertTriangle,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  BarChart3,
  Trophy,
  Flame,
  Shield,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TradeRecord {
  id: string;
  symbol: string;
  timeframe: string;
  direction: string;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  riskReward: number | null;
  confidence: string | null;
  confluenceScore: number | null;
  aiAnalysis: string;
  status: string;
  actualExitPrice: number | null;
  pnlPercent: number | null;
  maxFavorable: number | null;
  maxAdverse: number | null;
  expiresAt: string | null;
  resolvedAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface TradeStats {
  totalTrades: number;
  wins: number;
  losses: number;
  expired: number;
  manualCloses: number;
  winRate: number;
  avgPnl: number;
  profitFactor: number;
  longWinRate: number;
  shortWinRate: number;
  altaWinRate: number;
  mediaWinRate: number;
  bajaWinRate: number;
  bySymbol: Array<{ symbol: string; total: number; wins: number; winRate: number }>;
  currentStreak: { count: number; type: string };
  pendingCount: number;
  equityCurve: Array<{ date: string; pnl: number }>;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  PENDING: { label: 'Pendiente', color: 'text-yellow-400', bg: 'bg-yellow-500/15', icon: Clock },
  HIT_TP: { label: 'TP Alcanzado', color: 'text-emerald-400', bg: 'bg-emerald-500/15', icon: CheckCircle2 },
  HIT_SL: { label: 'SL Alcanzado', color: 'text-red-400', bg: 'bg-red-500/15', icon: XCircle },
  EXPIRED: { label: 'Expirado', color: 'text-gray-400', bg: 'bg-gray-500/15', icon: Timer },
  MANUAL_CLOSE: { label: 'Cierre Manual', color: 'text-blue-400', bg: 'bg-blue-500/15', icon: Minus },
};

const formatPrice = (p: number) => p >= 1
  ? p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : p.toFixed(6);

const timeAgo = (dateStr: string) => {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
};

// ─── Component ───────────────────────────────────────────────────────────────

export function AITradeTrackerPanel() {
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [stats, setStats] = useState<TradeStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'HIT_TP' | 'HIT_SL' | 'EXPIRED'>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(true);

  // Fetch trades
  const fetchTrades = useCallback(async () => {
    try {
      const statusParam = filter !== 'ALL' ? `&status=${filter}` : '';
      const res = await fetch(`/api/ai-trades?limit=100${statusParam}`);
      if (res.ok) {
        const data = await res.json();
        setTrades(data.trades || []);
      }
    } catch { /* ignore */ }
  }, [filter]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-trades?stats=true');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch { /* ignore */ }
  }, []);

  // Load on mount + refresh
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await Promise.all([fetchTrades(), fetchStats()]);
      setIsLoading(false);
    };
    load();
    // Auto-refresh every 60 seconds
    const interval = setInterval(() => { fetchTrades(); fetchStats(); }, 60000);
    return () => clearInterval(interval);
  }, [fetchTrades, fetchStats]);

  // Show browser notification for resolved trades
  const showNotification = useCallback((resolved: { symbol: string; direction: string; status: string; pnlPercent: number }) => {
    const isWin = resolved.status === 'HIT_TP';
    const title = isWin ? 'Operacion exitosa!' : 'Operacion alcanzada SL';
    const body = `${resolved.symbol} ${resolved.direction}: ${resolved.status} (${resolved.pnlPercent >= 0 ? '+' : ''}${resolved.pnlPercent.toFixed(2)}%)`;

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  }, []);

  // Auto-check pending trades every 5 minutes
  useEffect(() => {
    const checkPending = async () => {
      if (!stats || stats.pendingCount === 0) return;
      setIsChecking(true);
      try {
        const res = await fetch('/api/ai-trades/check', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data.resolved?.length > 0) {
            for (const resolved of data.resolved) {
              showNotification(resolved);
            }
            await Promise.all([fetchTrades(), fetchStats()]);
          }
        }
      } catch { /* ignore */ }
      setIsChecking(false);
    };

    checkPending();
    const interval = setInterval(checkPending, 300000); // 5 minutes
    return () => clearInterval(interval);
  }, [stats?.pendingCount, fetchTrades, fetchStats, showNotification]);

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const handleCheckNow = async () => {
    setIsChecking(true);
    try {
      const res = await fetch('/api/ai-trades/check', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.resolved?.length > 0) {
          for (const resolved of data.resolved) showNotification(resolved);
        }
        await Promise.all([fetchTrades(), fetchStats()]);
      }
    } catch { /* ignore */ }
    setIsChecking(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/ai-trades?id=${id}`, { method: 'DELETE' });
      await Promise.all([fetchTrades(), fetchStats()]);
    } catch { /* ignore */ }
  };

  const handleManualClose = async (trade: TradeRecord) => {
    // Use entry price as approximation for manual close
    // Break even default for manual close
    try {
      await fetch('/api/ai-trades', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: trade.id,
          status: 'MANUAL_CLOSE',
          actualExitPrice: trade.entryPrice,
          notes: 'Cerrado manualmente',
        }),
      });
      await Promise.all([fetchTrades(), fetchStats()]);
    } catch { /* ignore */ }
  };

  const getDirectionIcon = (dir: string) => {
    if (dir === 'LONG') return <TrendingUp className="w-3 h-3 text-emerald-400" />;
    if (dir === 'SHORT') return <TrendingDown className="w-3 h-3 text-red-400" />;
    return <Minus className="w-3 h-3 text-yellow-400" />;
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-3">
      {/* ─── Stats Summary ─── */}
      {showStats && stats && (
        <div className="space-y-2">
          {/* Top Stats Row */}
          <div className="grid grid-cols-4 gap-1.5">
            <div className="bg-white/5 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-white">{stats.totalTrades}</p>
              <p className="text-[8px] text-gray-500 uppercase">Total</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2 text-center">
              <p className={`text-lg font-bold ${stats.winRate >= 50 ? 'text-emerald-400' : stats.winRate >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>
                {stats.winRate}%
              </p>
              <p className="text-[8px] text-gray-500 uppercase">Win Rate</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2 text-center">
              <p className={`text-lg font-bold ${stats.profitFactor >= 1.5 ? 'text-emerald-400' : stats.profitFactor >= 1 ? 'text-yellow-400' : 'text-red-400'}`}>
                {stats.profitFactor >= 100 ? '∞' : stats.profitFactor.toFixed(2)}
              </p>
              <p className="text-[8px] text-gray-500 uppercase">Profit Factor</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2 text-center">
              <p className={`text-lg font-bold ${stats.avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {stats.avgPnl >= 0 ? '+' : ''}{stats.avgPnl.toFixed(2)}%
              </p>
              <p className="text-[8px] text-gray-500 uppercase">PnL Prom.</p>
            </div>
          </div>

          {/* Second Stats Row */}
          <div className="grid grid-cols-3 gap-1.5">
            {/* Streak */}
            <div className="bg-white/5 rounded-lg p-2 text-center">
              <div className="flex items-center justify-center gap-1">
                {stats.currentStreak.type === 'win' ? (
                  <Flame className="w-3.5 h-3.5 text-emerald-400" />
                ) : stats.currentStreak.type === 'loss' ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <Minus className="w-3.5 h-3.5 text-gray-500" />
                )}
                <p className="text-sm font-bold text-white">{stats.currentStreak.count}</p>
              </div>
              <p className="text-[8px] text-gray-500 uppercase">
                {stats.currentStreak.type === 'win' ? 'Racha Aciertos' : stats.currentStreak.type === 'loss' ? 'Racha Fallos' : 'Sin racha'}
              </p>
            </div>
            {/* Pending */}
            <div className="bg-white/5 rounded-lg p-2 text-center">
              <div className="flex items-center justify-center gap-1">
                <Clock className="w-3.5 h-3.5 text-yellow-400" />
                <p className="text-sm font-bold text-yellow-400">{stats.pendingCount}</p>
              </div>
              <p className="text-[8px] text-gray-500 uppercase">Pendientes</p>
            </div>
            {/* Direction Win Rate */}
            <div className="bg-white/5 rounded-lg p-2 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-[9px] text-emerald-400">L:{stats.longWinRate}%</span>
                <span className="text-[9px] text-red-400">S:{stats.shortWinRate}%</span>
              </div>
              <p className="text-[8px] text-gray-500 uppercase">Long / Short</p>
            </div>
          </div>

          {/* Confidence Win Rate */}
          {(stats.altaWinRate > 0 || stats.mediaWinRate > 0 || stats.bajaWinRate > 0) && (
            <div className="flex items-center gap-2 px-1">
              <Shield className="w-3 h-3 text-violet-400 flex-shrink-0" />
              <span className="text-[9px] text-gray-500">Confianza:</span>
              <Badge className="text-[8px] border-0 bg-emerald-500/15 text-emerald-400 px-1.5">Alta {stats.altaWinRate}%</Badge>
              <Badge className="text-[8px] border-0 bg-yellow-500/15 text-yellow-400 px-1.5">Media {stats.mediaWinRate}%</Badge>
              <Badge className="text-[8px] border-0 bg-red-500/15 text-red-400 px-1.5">Baja {stats.bajaWinRate}%</Badge>
            </div>
          )}

          {/* Top Symbols */}
          {stats.bySymbol.length > 0 && (
            <div className="flex items-center gap-2 px-1 overflow-x-auto">
              <Trophy className="w-3 h-3 text-amber-400 flex-shrink-0" />
              <span className="text-[9px] text-gray-500 flex-shrink-0">Top:</span>
              {stats.bySymbol.slice(0, 5).map(s => (
                <Badge key={s.symbol} className="text-[8px] border-0 bg-white/5 text-gray-300 px-1.5 flex-shrink-0">
                  {s.symbol} {s.winRate}%
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Toggle stats */}
      <button
        onClick={() => setShowStats(!showStats)}
        className="flex items-center gap-1 text-[9px] text-gray-500 hover:text-gray-300 transition-colors"
      >
        {showStats ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {showStats ? 'Ocultar estadisticas' : 'Mostrar estadisticas'}
      </button>

      {/* ─── Filters & Actions ─── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(['ALL', 'PENDING', 'HIT_TP', 'HIT_SL', 'EXPIRED'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-shrink-0 px-2 py-1 rounded-md text-[9px] font-medium transition-colors ${
              filter === f
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                : 'bg-white/5 text-gray-500 hover:text-gray-300 border border-transparent'
            }`}>
            {f === 'ALL' ? 'Todos' : STATUS_CONFIG[f]?.label || f}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[9px] text-gray-500 hover:text-gray-300"
            onClick={handleCheckNow} disabled={isChecking}>
            {isChecking ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Verificar
          </Button>
        </div>
      </div>

      {/* ─── Trade List ─── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 min-h-0">
        {trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Target className="w-8 h-8 text-gray-600 mb-2" />
            <p className="text-xs text-gray-500 mb-1">Sin operaciones registradas</p>
            <p className="text-[10px] text-gray-600">
              Pregunta a la IA y registra sus recomendaciones
            </p>
          </div>
        ) : (
          trades.map(trade => {
            const statusCfg = STATUS_CONFIG[trade.status] || STATUS_CONFIG.PENDING;
            const StatusIcon = statusCfg.icon;
            const isExpanded = expandedId === trade.id;
            const isPending = trade.status === 'PENDING';

            return (
              <div key={trade.id} className={`rounded-lg border ${
                isPending ? 'border-yellow-500/20 bg-yellow-500/5' :
                trade.status === 'HIT_TP' ? 'border-emerald-500/20 bg-emerald-500/5' :
                trade.status === 'HIT_SL' ? 'border-red-500/20 bg-red-500/5' :
                'border-white/5 bg-white/[0.02]'
              }`}>
                {/* Trade Card Header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : trade.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left"
                >
                  {/* Direction */}
                  {getDirectionIcon(trade.direction)}
                  <span className="text-xs font-bold text-white">{trade.symbol}</span>
                  <Badge className={`text-[8px] border-0 ${statusCfg.bg} ${statusCfg.color} px-1.5`}>
                    <StatusIcon className="w-2.5 h-2.5 mr-0.5" />
                    {statusCfg.label}
                  </Badge>
                  {trade.confidence && (
                    <Badge className={`text-[8px] border-0 px-1.5 ${
                      trade.confidence === 'Alta' ? 'bg-emerald-500/15 text-emerald-400' :
                      trade.confidence === 'Media' ? 'bg-yellow-500/15 text-yellow-400' :
                      'bg-red-500/15 text-red-400'
                    }`}>
                      {trade.confidence}
                    </Badge>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {trade.pnlPercent != null && (
                      <span className={`text-[10px] font-mono font-bold ${
                        trade.pnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(2)}%
                      </span>
                    )}
                    <span className="text-[9px] text-gray-600">{timeAgo(trade.createdAt)}</span>
                    {isExpanded ? <ChevronUp className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
                  </div>
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="px-3 pb-2 space-y-2 border-t border-white/5 pt-2">
                    {/* Price Levels */}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[8px] text-gray-500 uppercase">Entrada</p>
                        <p className="text-[10px] font-mono text-white">${formatPrice(trade.entryPrice)}</p>
                      </div>
                      <div>
                        <p className="text-[8px] text-gray-500 uppercase">Stop Loss</p>
                        <p className="text-[10px] font-mono text-red-400">${trade.stopLoss != null ? formatPrice(trade.stopLoss) : 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[8px] text-gray-500 uppercase">Take Profit</p>
                        <p className="text-[10px] font-mono text-emerald-400">${trade.takeProfit != null ? formatPrice(trade.takeProfit) : 'N/A'}</p>
                      </div>
                    </div>

                    {/* R:R, Confluence, MFE/MAE */}
                    <div className="flex items-center gap-3">
                      {trade.riskReward != null && (
                        <span className="text-[9px] text-gray-400">R:R <span className="text-white font-mono">{trade.riskReward.toFixed(2)}</span></span>
                      )}
                      {trade.confluenceScore != null && (
                        <span className="text-[9px] text-gray-400">Conf. <span className="text-white font-mono">{trade.confluenceScore}%</span></span>
                      )}
                      {trade.maxFavorable != null && (
                        <span className="text-[9px] text-gray-400">MFE <span className="text-emerald-400 font-mono">+{trade.maxFavorable.toFixed(2)}%</span></span>
                      )}
                      {trade.maxAdverse != null && (
                        <span className="text-[9px] text-gray-400">MAE <span className="text-red-400 font-mono">-{trade.maxAdverse.toFixed(2)}%</span></span>
                      )}
                    </div>

                    {/* Expiration */}
                    {trade.expiresAt && isPending && (
                      <div className="flex items-center gap-1">
                        <Timer className="w-3 h-3 text-yellow-400" />
                        <span className="text-[9px] text-yellow-400">
                          Expira: {new Date(trade.expiresAt).toLocaleString('es', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}

                    {/* Actual Exit */}
                    {trade.actualExitPrice != null && (
                      <div className="flex items-center gap-1">
                        <BarChart3 className="w-3 h-3 text-gray-400" />
                        <span className="text-[9px] text-gray-400">
                          Salida: <span className="text-white font-mono">${formatPrice(trade.actualExitPrice)}</span>
                        </span>
                      </div>
                    )}

                    {/* Timeframe */}
                    <Badge className="text-[8px] border-0 bg-white/5 text-gray-400 px-1.5">{trade.timeframe}</Badge>

                    {/* Actions */}
                    {isPending && (
                      <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                        <Button size="sm" variant="ghost"
                          className="h-6 text-[9px] text-blue-400 hover:text-blue-300"
                          onClick={() => handleManualClose(trade)}>
                          Cerrar Manualmente
                        </Button>
                        <Button size="sm" variant="ghost"
                          className="h-6 text-[9px] text-red-400 hover:text-red-300"
                          onClick={() => handleDelete(trade.id)}>
                          <Trash2 className="w-3 h-3 mr-1" /> Eliminar
                        </Button>
                      </div>
                    )}

                    {!isPending && (
                      <Button size="sm" variant="ghost"
                        className="h-6 text-[9px] text-red-400 hover:text-red-300"
                        onClick={() => handleDelete(trade.id)}>
                        <Trash2 className="w-3 h-3 mr-1" /> Eliminar
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
