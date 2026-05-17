'use client';

import { useState, useMemo } from 'react';
import { useJournal, type AuditEvent } from '@/hooks/use-journal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  BookOpen,
  Plus,
  X,
  Download,
  Trash2,
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  ShieldAlert,
  Bell,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

const VECTOR_OPTIONS = [
  { id: 'technical', label: 'Técnico' },
  { id: 'pattern', label: 'Patrones' },
  { id: 'volume', label: 'Volumen' },
  { id: 'news', label: 'Noticias' },
  { id: 'sentiment', label: 'Sentimiento' },
  { id: 'macro', label: 'Macro' },
];

function formatPnl(value: number | null | undefined): string {
  if (value == null) return '—';
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}$${value.toFixed(2)}`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function formatTimeAgo(iso: string): string {
  try {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'ahora';
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d`;
  } catch {
    return '';
  }
}

function getAuditIcon(eventType: AuditEvent['eventType']) {
  switch (eventType) {
    case 'signal_generated':
      return <Zap className="w-3 h-3 text-emerald-400" />;
    case 'trade_assessed':
      return <Activity className="w-3 h-3 text-blue-400" />;
    case 'trade_executed':
      return <CheckCircle2 className="w-3 h-3 text-emerald-400" />;
    case 'trade_closed':
      return <XCircle className="w-3 h-3 text-gray-400" />;
    case 'risk_warning':
      return <ShieldAlert className="w-3 h-3 text-yellow-400" />;
    case 'alert_triggered':
      return <Bell className="w-3 h-3 text-orange-400" />;
    default:
      return <Activity className="w-3 h-3 text-gray-500" />;
  }
}

function getAuditLabel(eventType: AuditEvent['eventType']): string {
  switch (eventType) {
    case 'signal_generated':
      return 'Señal';
    case 'trade_assessed':
      return 'Evaluada';
    case 'trade_executed':
      return 'Ejecutada';
    case 'trade_closed':
      return 'Cerrada';
    case 'risk_warning':
      return 'Riesgo';
    case 'alert_triggered':
      return 'Alerta';
    default:
      return eventType;
  }
}

export function JournalPanel() {
  const {
    entries,
    stats,
    auditEvents,
    isLoading,
    addEntry,
    deleteEntry,
    exportCSV,
    isAdding,
    isDeleting,
  } = useJournal();

  const [showForm, setShowForm] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const [form, setForm] = useState({
    symbol: '',
    direction: 'LONG',
    entryPrice: '',
    exitPrice: '',
    stopLoss: '',
    takeProfit: '',
    result: '',
    pnl: '',
    notes: '',
    lessons: '',
    vectorsUsed: [] as string[],
  });

  const formValid = useMemo(() => {
    return form.symbol.trim().length > 0 && form.entryPrice !== '' && parseFloat(form.entryPrice) > 0;
  }, [form.symbol, form.entryPrice]);

  const handleSubmit = async () => {
    if (!formValid) return;
    try {
      await addEntry({
        symbol: form.symbol.toUpperCase().trim(),
        direction: form.direction,
        entryPrice: parseFloat(form.entryPrice),
        exitPrice: form.exitPrice ? parseFloat(form.exitPrice) : null,
        stopLoss: parseFloat(form.stopLoss) || 0,
        takeProfit: parseFloat(form.takeProfit) || 0,
        result: form.result || null,
        pnl: form.pnl ? parseFloat(form.pnl) : null,
        notes: form.notes,
        lessons: form.lessons,
        vectorsUsed: form.vectorsUsed,
      });
      setShowForm(false);
      setForm({
        symbol: '',
        direction: 'LONG',
        entryPrice: '',
        exitPrice: '',
        stopLoss: '',
        takeProfit: '',
        result: '',
        pnl: '',
        notes: '',
        lessons: '',
        vectorsUsed: [],
      });
      toast.success('Entrada guardada en bitácora');
    } catch {
      toast.error('Error al guardar entrada');
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteEntry(id);
      toast.success('Entrada eliminada');
    } catch {
      toast.error('Error al eliminar entrada');
    } finally {
      setDeletingId(null);
    }
  };

  const handleExport = async () => {
    try {
      await exportCSV();
      toast.success('CSV exportado');
    } catch {
      toast.error('Error al exportar CSV');
    }
  };

  const toggleVector = (id: string) => {
    setForm((prev) => ({
      ...prev,
      vectorsUsed: prev.vectorsUsed.includes(id)
        ? prev.vectorsUsed.filter((v) => v !== id)
        : [...prev.vectorsUsed, id],
    }));
  };

  const pnlColor = (val: number | null | undefined) => {
    if (val == null) return 'text-gray-500';
    return val >= 0 ? 'text-emerald-400' : 'text-red-400';
  };

  return (
    <div className="space-y-3">
      {/* ===== A. HEADER ===== */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-sm font-semibold text-gray-300">Bitácora</span>
          {entries.length > 0 && (
            <Badge className="text-[8px] border-0 bg-white/10 text-gray-400 h-4 min-w-[16px] px-1.5">
              {entries.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] text-gray-400 hover:text-gray-200 px-1.5"
            onClick={handleExport}
            disabled={entries.length === 0}
            title="Exportar CSV"
          >
            <Download className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] text-emerald-400 hover:text-emerald-300"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {showForm ? 'Cancelar' : 'Nueva'}
          </Button>
        </div>
      </div>

      {/* ===== B. STATS SUMMARY ===== */}
      {stats && stats.totalTrades > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          <div className="p-2 rounded-lg trading-card">
            <p className="text-[10px] text-gray-500">Total Trades</p>
            <p className="text-xs font-bold font-mono text-white">{stats.totalTrades}</p>
          </div>
          <div className="p-2 rounded-lg trading-card">
            <p className="text-[10px] text-gray-500">Win Rate</p>
            <p className={`text-xs font-bold font-mono ${stats.winRate >= 50 ? 'text-emerald-400' : stats.winRate >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>
              {stats.winRate.toFixed(1)}%
            </p>
          </div>
          <div className="p-2 rounded-lg trading-card">
            <p className="text-[10px] text-gray-500">Avg P&L</p>
            <p className={`text-xs font-bold font-mono ${pnlColor(stats.avgPnl)}`}>
              {formatPnl(stats.avgPnl)}
            </p>
          </div>
          <div className="p-2 rounded-lg trading-card">
            <p className="text-[10px] text-gray-500">Profit Factor</p>
            <p className={`text-xs font-bold font-mono ${stats.profitFactor >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
              {stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* ===== C. ADD ENTRY FORM ===== */}
      {showForm && (
        <div className="p-3 rounded-lg trading-card space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-gray-400">Símbolo</Label>
              <Input
                className="h-7 text-xs bg-white/5 border-white/10"
                placeholder="AAPL"
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <Label className="text-[10px] text-gray-400">Dirección</Label>
              <select
                className="w-full h-7 text-xs bg-white/5 border border-white/10 rounded-md px-2 text-white"
                value={form.direction}
                onChange={(e) => setForm({ ...form, direction: e.target.value })}
              >
                <option value="LONG">LONG</option>
                <option value="SHORT">SHORT</option>
              </select>
            </div>
            <div>
              <Label className="text-[10px] text-gray-400">Entrada</Label>
              <Input
                type="number"
                className="h-7 text-xs bg-white/5 border-white/10 font-mono"
                placeholder="0.00"
                value={form.entryPrice}
                onChange={(e) => setForm({ ...form, entryPrice: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-[10px] text-gray-400">Salida</Label>
              <Input
                type="number"
                className="h-7 text-xs bg-white/5 border-white/10 font-mono"
                placeholder="0.00"
                value={form.exitPrice}
                onChange={(e) => setForm({ ...form, exitPrice: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-[10px] text-gray-400">Stop Loss</Label>
              <Input
                type="number"
                className="h-7 text-xs bg-white/5 border-white/10 font-mono"
                placeholder="0.00"
                value={form.stopLoss}
                onChange={(e) => setForm({ ...form, stopLoss: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-[10px] text-gray-400">Take Profit</Label>
              <Input
                type="number"
                className="h-7 text-xs bg-white/5 border-white/10 font-mono"
                placeholder="0.00"
                value={form.takeProfit}
                onChange={(e) => setForm({ ...form, takeProfit: e.target.value })}
              />
            </div>
          </div>

          {/* Result + P&L row */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-gray-400">Resultado</Label>
              <select
                className="w-full h-7 text-xs bg-white/5 border border-white/10 rounded-md px-2 text-white"
                value={form.result}
                onChange={(e) => setForm({ ...form, result: e.target.value })}
              >
                <option value="">— Pendiente —</option>
                <option value="win">GANADA</option>
                <option value="loss">PERDIDA</option>
                <option value="breakeven">BREAKEVEN</option>
              </select>
            </div>
            <div>
              <Label className="text-[10px] text-gray-400">P&L</Label>
              <Input
                type="number"
                className="h-7 text-xs bg-white/5 border-white/10 font-mono"
                placeholder="0.00"
                value={form.pnl}
                onChange={(e) => setForm({ ...form, pnl: e.target.value })}
              />
            </div>
          </div>

          {/* Vector Selector */}
          <div>
            <Label className="text-[10px] text-gray-400 mb-1 block">Vectores</Label>
            <div className="flex flex-wrap gap-1">
              {VECTOR_OPTIONS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => toggleVector(v.id)}
                  className={`px-2 py-0.5 text-[9px] rounded-full border transition-colors ${
                    form.vectorsUsed.includes(v.id)
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-white/5 text-gray-500 border-white/10 hover:text-gray-300'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-[10px] text-gray-400">Notas</Label>
            <Textarea
              className="text-xs bg-white/5 border-white/10 min-h-[40px]"
              placeholder="Notas sobre la operación..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          {/* Lessons */}
          <div>
            <Label className="text-[10px] text-gray-400">Lecciones</Label>
            <Textarea
              className="text-xs bg-white/5 border-white/10 min-h-[40px]"
              placeholder="¿Qué aprendiste de esta operación?"
              value={form.lessons}
              onChange={(e) => setForm({ ...form, lessons: e.target.value })}
            />
          </div>

          <Button
            size="sm"
            className="w-full h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
            onClick={handleSubmit}
            disabled={!formValid || isAdding}
          >
            {isAdding ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Guardar Entrada
          </Button>
        </div>
      )}

      {/* ===== D. JOURNAL ENTRIES LIST ===== */}
      <div className="space-y-1.5 max-h-96 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            <span className="text-[10px] text-gray-500 ml-2">Cargando...</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-gray-500">
            <BookOpen className="w-6 h-6 mb-2 opacity-30" />
            <p className="text-[10px]">Sin entradas en la bitácora</p>
          </div>
        ) : (
          entries.map((entry) => {
            const isWin = entry.result === 'win';
            const isLoss = entry.result === 'loss';
            const borderClass = isWin
              ? 'border-l-2 border-l-emerald-500'
              : isLoss
              ? 'border-l-2 border-l-red-500'
              : 'border-l-2 border-l-transparent';

            return (
              <div
                key={entry.id}
                className={`p-2 rounded-lg trading-card group relative ${borderClass}`}
                onMouseEnter={() => setHoveredId(entry.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Delete button - hover reveal */}
                {hoveredId === entry.id && (
                  <button
                    className="absolute top-1.5 right-1.5 p-0.5 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                    onClick={() => handleDelete(entry.id)}
                    disabled={isDeleting && deletingId === entry.id}
                  >
                    {isDeleting && deletingId === entry.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                  </button>
                )}

                {/* Row 1: Symbol + Direction + Result badge */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white text-xs">{entry.symbol}</span>
                    <Badge
                      className={`text-[8px] border-0 ${
                        entry.direction === 'LONG'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-red-500/15 text-red-400'
                      }`}
                    >
                      {entry.direction === 'LONG' ? (
                        <TrendingUp className="w-2.5 h-2.5 mr-0.5" />
                      ) : (
                        <TrendingDown className="w-2.5 h-2.5 mr-0.5" />
                      )}
                      {entry.direction}
                    </Badge>
                  </div>
                  {entry.result && (
                    <Badge
                      className={`text-[8px] border-0 ${
                        isWin
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : isLoss
                          ? 'bg-red-500/15 text-red-400'
                          : 'bg-gray-500/15 text-gray-400'
                      }`}
                    >
                      {isWin ? 'GANADA' : isLoss ? 'PERDIDA' : 'NEUTRA'}
                    </Badge>
                  )}
                </div>

                {/* Row 2: Prices + P&L */}
                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                  <span className="font-mono">E: ${entry.entryPrice.toFixed(2)}</span>
                  {entry.exitPrice != null && (
                    <span className="font-mono">S: ${entry.exitPrice.toFixed(2)}</span>
                  )}
                  {entry.pnl != null && (
                    <span className={`font-mono font-bold ${pnlColor(entry.pnl)}`}>
                      {formatPnl(entry.pnl)}
                    </span>
                  )}
                </div>

                {/* Row 3: Notes preview + Date */}
                <div className="flex items-center justify-between mt-1">
                  {entry.notes ? (
                    <p className="text-[9px] text-gray-500 truncate max-w-[70%]">{entry.notes}</p>
                  ) : (
                    <span />
                  )}
                  <span className="text-[9px] text-gray-600 flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    {formatDate(entry.createdAt)}
                  </span>
                </div>

                {/* Vectors used */}
                {entry.vectorsUsed && entry.vectorsUsed !== '[]' && (
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {(() => {
                      try {
                        const vecs = JSON.parse(entry.vectorsUsed) as string[];
                        return vecs.map((v) => (
                          <span
                            key={v}
                            className="text-[8px] px-1 py-0 rounded bg-white/5 text-gray-500"
                          >
                            {v}
                          </span>
                        ));
                      } catch {
                        return null;
                      }
                    })()}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ===== E. AUDIT TRAIL TOGGLE ===== */}
      <div className="border-t border-white/5 pt-2">
        <button
          className="flex items-center justify-between w-full text-left"
          onClick={() => setShowAudit(!showAudit)}
        >
          <div className="flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-gray-500" />
            <span className="text-[10px] font-semibold text-gray-400">Auditoría</span>
            {auditEvents.length > 0 && (
              <Badge className="text-[8px] border-0 bg-yellow-500/10 text-yellow-400 h-3.5 min-w-[14px] px-1">
                {auditEvents.length}
              </Badge>
            )}
          </div>
          {showAudit ? (
            <ChevronUp className="w-3 h-3 text-gray-500" />
          ) : (
            <ChevronDown className="w-3 h-3 text-gray-500" />
          )}
        </button>

        {showAudit && (
          <div className="mt-1.5 space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
            {auditEvents.length === 0 ? (
              <p className="text-[9px] text-gray-600 text-center py-3">
                Sin eventos de auditoría
              </p>
            ) : (
              auditEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-1.5 p-1.5 rounded trading-card text-[9px]"
                >
                  <div className="mt-0.5 flex-shrink-0">{getAuditIcon(event.eventType)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-white">{event.symbol}</span>
                      <Badge
                        className={`text-[7px] border-0 h-3 px-1 ${
                          event.eventType === 'signal_generated'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : event.eventType === 'trade_executed'
                            ? 'bg-blue-500/15 text-blue-400'
                            : event.eventType === 'trade_closed'
                            ? 'bg-gray-500/15 text-gray-400'
                            : event.eventType === 'risk_warning'
                            ? 'bg-yellow-500/15 text-yellow-400'
                            : event.eventType === 'alert_triggered'
                            ? 'bg-orange-500/15 text-orange-400'
                            : 'bg-white/10 text-gray-400'
                        }`}
                      >
                        {getAuditLabel(event.eventType)}
                      </Badge>
                      {event.direction && (
                        <span className={`text-[8px] ${event.direction === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {event.direction}
                        </span>
                      )}
                    </div>
                    {event.price != null && (
                      <span className="text-gray-500 font-mono">${event.price.toFixed(2)}</span>
                    )}
                    {event.pnl != null && (
                      <span className={`font-mono ml-1 ${pnlColor(event.pnl)}`}>
                        {formatPnl(event.pnl)}
                      </span>
                    )}
                  </div>
                  <span className="text-[8px] text-gray-600 flex-shrink-0 mt-0.5">
                    {formatTimeAgo(event.timestamp)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
