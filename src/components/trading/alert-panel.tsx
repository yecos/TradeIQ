'use client';

import { useState, useCallback } from 'react';
import { useAlerts, type AlertItem } from '@/hooks/use-alerts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bell,
  BellOff,
  AlertTriangle,
  Siren,
  Plus,
  ChevronUp,
  X,
  CheckCheck,
  Trash2,
  Target,
  Shield,
  Zap,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';

interface AlertPanelProps {
  watchlist: string[];
  brokerConnected: boolean;
}

type AlertType = 'price_target' | 'confluence' | 'risk_event';
type Severity = 'info' | 'warning' | 'critical';
type PriceOperator = '>=' | '<=' | 'crosses_above' | 'crosses_below';

const OPERATOR_LABELS: Record<PriceOperator, string> = {
  '>=': '≥ Mayor o igual',
  '<=': '≤ Menor o igual',
  crosses_above: '↑ Cruce arriba',
  crosses_below: '↓ Cruce abajo',
};

const SEVERITY_COLORS: Record<Severity, { bg: string; text: string; border: string; dot: string }> = {
  info: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/20',
    dot: 'bg-blue-400',
  },
  warning: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    border: 'border-yellow-500/20',
    dot: 'bg-yellow-400',
  },
  critical: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    border: 'border-red-500/20',
    dot: 'bg-red-400',
  },
};

const TYPE_LABELS: Record<string, string> = {
  price_target: 'Precio Objetivo',
  confluence: 'Confluencia',
  risk_event: 'Riesgo',
  trade_executed: 'Operación Ejecutada',
  position_closed: 'Posición Cerrada',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  price_target: <Target className="w-3 h-3" />,
  confluence: <Zap className="w-3 h-3" />,
  risk_event: <AlertTriangle className="w-3 h-3" />,
  trade_executed: <TrendingUp className="w-3 h-3" />,
  position_closed: <Shield className="w-3 h-3" />,
};

function formatTimeAgo(dateStr: string): string {
  const now = new Date().getTime();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  return `${diffDay}d`;
}

function SeverityIcon({ severity }: { severity: string }) {
  const colors = SEVERITY_COLORS[severity as Severity] || SEVERITY_COLORS.info;
  switch (severity) {
    case 'critical':
      return <Siren className={`w-3.5 h-3.5 ${colors.text}`} />;
    case 'warning':
      return <AlertTriangle className={`w-3.5 h-3.5 ${colors.text}`} />;
    default:
      return <Bell className={`w-3.5 h-3.5 ${colors.text}`} />;
  }
}

export function AlertPanel({ watchlist, brokerConnected: _brokerConnected }: AlertPanelProps) {
  const {
    alerts,
    unreadCount,
    isLoading,
    createAlert,
    markAsRead,
    deleteAlert,
    markAllAsRead,
    isCreating,
  } = useAlerts();

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formSymbol, setFormSymbol] = useState('');
  const [formType, setFormType] = useState<AlertType>('price_target');
  const [formOperator, setFormOperator] = useState<PriceOperator>('>=');
  const [formTargetValue, setFormTargetValue] = useState('');
  const [formSeverity, setFormSeverity] = useState<Severity>('info');

  const handleCreateAlert = useCallback(async () => {
    if (!formSymbol.trim()) {
      toast.error('Ingresa un símbolo');
      return;
    }

    const targetValue = parseFloat(formTargetValue);
    if (formType === 'price_target' && (isNaN(targetValue) || targetValue <= 0)) {
      toast.error('Ingresa un precio objetivo válido');
      return;
    }
    if (formType === 'confluence' && (isNaN(targetValue) || targetValue < 0 || targetValue > 100)) {
      toast.error('Ingresa un puntaje de confluencia válido (0-100)');
      return;
    }

    try {
      let title = '';
      let message = '';
      let condition: Record<string, unknown> = {};

      if (formType === 'price_target') {
        title = `Precio objetivo: ${formSymbol.toUpperCase()}`;
        const opLabel = OPERATOR_LABELS[formOperator].replace(/[≥≤↑↓]\s*/, '');
        message = `Alertar cuando ${formSymbol.toUpperCase()} ${opLabel} $${targetValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        condition = { field: 'price', operator: formOperator, value: targetValue };
      } else if (formType === 'confluence') {
        title = `Confluencia alta: ${formSymbol.toUpperCase()}`;
        message = `Alertar cuando la confluencia de ${formSymbol.toUpperCase()} supere ${targetValue}%`;
        condition = { field: 'confluence_score', operator: '>=', value: targetValue };
      } else if (formType === 'risk_event') {
        title = `Evento de riesgo: ${formSymbol.toUpperCase()}`;
        message = `Alerta de riesgo para ${formSymbol.toUpperCase()}`;
        condition = { field: 'price', operator: '!=', value: 0 };
      }

      await createAlert({
        type: formType,
        symbol: formSymbol.toUpperCase(),
        title,
        message,
        severity: formSeverity,
        condition,
      });

      toast.success('Alerta creada');
      setFormSymbol('');
      setFormTargetValue('');
      setShowForm(false);
    } catch {
      toast.error('Error al crear alerta');
    }
  }, [formSymbol, formType, formOperator, formTargetValue, formSeverity, createAlert]);

  const handleMarkAsRead = useCallback(
    async (alert: AlertItem) => {
      try {
        if (!alert.isRead) {
          await markAsRead(alert.id);
        }
      } catch {
        // Silent fail
      }
    },
    [markAsRead],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteAlert(id);
        toast.success('Alerta eliminada');
      } catch {
        toast.error('Error al eliminar alerta');
      }
    },
    [deleteAlert],
  );

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllAsRead();
      toast.success('Todas las alertas marcadas como leídas');
    } catch {
      toast.error('Error al marcar alertas');
    }
  }, [markAllAsRead]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Bell className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs font-semibold text-gray-300">Alertas</span>
          {unreadCount > 0 && (
            <Badge className="text-[8px] border-0 bg-emerald-500/20 text-emerald-400 h-4 min-w-[16px]">
              {unreadCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-5 text-[9px] text-gray-500 hover:text-gray-300 px-1.5"
              onClick={handleMarkAllRead}
              title="Marcar todas como leídas"
            >
              <CheckCheck className="w-3 h-3 mr-0.5" />
              Leer
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-5 w-5 p-0 text-gray-500 hover:text-emerald-400"
            onClick={() => setShowForm(!showForm)}
            title="Crear alerta"
          >
            {showForm ? <ChevronUp className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      {/* Create Alert Form — collapsible */}
      {showForm && (
        <div className="p-3 rounded-lg trading-card space-y-2 mb-3 border border-white/5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">
              Nueva Alerta
            </span>
            <button
              className="text-gray-500 hover:text-gray-300"
              onClick={() => setShowForm(false)}
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {/* Symbol */}
          <div>
            <Label className="text-[10px] text-gray-400">Símbolo</Label>
            <div className="relative">
              <Input
                className="h-7 text-xs bg-white/5 border-white/10 font-mono uppercase"
                placeholder="BTC, AAPL..."
                value={formSymbol}
                onChange={(e) => setFormSymbol(e.target.value.toUpperCase())}
              />
              {/* Quick select from watchlist */}
              {formSymbol === '' && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {watchlist.slice(0, 8).map((s) => (
                    <button
                      key={s}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors font-mono"
                      onClick={() => setFormSymbol(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Type */}
          <div>
            <Label className="text-[10px] text-gray-400">Tipo</Label>
            <Select
              value={formType}
              onValueChange={(val) => {
                setFormType(val as AlertType);
                if (val === 'confluence') {
                  setFormOperator('>=');
                }
              }}
            >
              <SelectTrigger className="h-7 text-xs bg-white/5 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1a2e] border-white/10">
                <SelectItem value="price_target" className="text-xs">
                  <div className="flex items-center gap-1.5">
                    <Target className="w-3 h-3 text-blue-400" />
                    Precio Objetivo
                  </div>
                </SelectItem>
                <SelectItem value="confluence" className="text-xs">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3 h-3 text-yellow-400" />
                    Confluencia
                  </div>
                </SelectItem>
                <SelectItem value="risk_event" className="text-xs">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-red-400" />
                    Riesgo
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Condition — only for price_target and confluence */}
          {formType === 'price_target' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-gray-400">Condición</Label>
                <Select
                  value={formOperator}
                  onValueChange={(val) => setFormOperator(val as PriceOperator)}
                >
                  <SelectTrigger className="h-7 text-[10px] bg-white/5 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a2e] border-white/10">
                    {Object.entries(OPERATOR_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key} className="text-[10px]">
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-gray-400">Precio Objetivo</Label>
                <Input
                  type="number"
                  className="h-7 text-xs bg-white/5 border-white/10 font-mono"
                  placeholder="0.00"
                  value={formTargetValue}
                  onChange={(e) => setFormTargetValue(e.target.value)}
                />
              </div>
            </div>
          )}

          {formType === 'confluence' && (
            <div>
              <Label className="text-[10px] text-gray-400">Confluencia Mínima (%)</Label>
              <Input
                type="number"
                className="h-7 text-xs bg-white/5 border-white/10 font-mono"
                placeholder="70"
                min="0"
                max="100"
                value={formTargetValue}
                onChange={(e) => setFormTargetValue(e.target.value)}
              />
            </div>
          )}

          {formType === 'risk_event' && (
            <div className="flex items-start gap-1.5 p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
              <AlertTriangle className="w-3 h-3 text-yellow-400 mt-0.5 flex-shrink-0" />
              <p className="text-[9px] text-yellow-300">
                Se creará una alerta de riesgo inmediata para {formSymbol || '___'}
              </p>
            </div>
          )}

          {/* Severity */}
          <div>
            <Label className="text-[10px] text-gray-400">Severidad</Label>
            <div className="flex gap-1.5">
              {(['info', 'warning', 'critical'] as Severity[]).map((sev) => (
                <button
                  key={sev}
                  className={`flex-1 h-6 rounded text-[9px] font-medium transition-colors border ${
                    formSeverity === sev
                      ? `${SEVERITY_COLORS[sev].bg} ${SEVERITY_COLORS[sev].text} ${SEVERITY_COLORS[sev].border}`
                      : 'bg-white/5 text-gray-500 border-white/5 hover:bg-white/10'
                  }`}
                  onClick={() => setFormSeverity(sev)}
                >
                  {sev === 'info' ? 'Info' : sev === 'warning' ? 'Warning' : 'Crítica'}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <Button
            size="sm"
            className="w-full h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
            onClick={handleCreateAlert}
            disabled={isCreating || !formSymbol.trim()}
          >
            {isCreating ? (
              <span className="animate-pulse">Creando...</span>
            ) : (
              <>
                <Plus className="w-3 h-3 mr-1" />
                Crear Alerta
              </>
            )}
          </Button>
        </div>
      )}

      {/* Active Alerts List */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-1.5">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-4 h-4 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
          </div>
        ) : alerts.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-8 text-gray-500">
            <BellOff className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs">Sin alertas configuradas</p>
            <p className="text-[10px] text-gray-600 mt-1">
              Crea una alerta para monitorear el mercado
            </p>
          </div>
        ) : (
          alerts.map((alert) => {
            const colors = SEVERITY_COLORS[alert.severity as Severity] || SEVERITY_COLORS.info;

            return (
              <div
                key={alert.id}
                className={`group relative p-2.5 rounded-lg trading-card border border-white/5 transition-all cursor-pointer hover:border-white/10 ${
                  alert.isRead ? 'opacity-50' : ''
                }`}
                onClick={() => handleMarkAsRead(alert)}
              >
                {/* Pulsing indicator for triggered alerts */}
                {alert.isTriggered && !alert.isRead && (
                  <span className="absolute top-2 right-2 flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${colors.dot} opacity-75`} />
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${colors.dot}`} />
                  </span>
                )}

                <div className="flex items-start gap-2">
                  {/* Icon */}
                  <div className={`flex-shrink-0 mt-0.5 ${colors.text}`}>
                    <SeverityIcon severity={alert.severity} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[9px] text-gray-500 font-mono">
                        {TYPE_ICONS[alert.type]}
                      </span>
                      <span className="text-[9px] text-gray-500">
                        {TYPE_LABELS[alert.type] || alert.type}
                      </span>
                      <span className="text-[9px] text-gray-600">•</span>
                      <span className="text-[9px] font-mono text-gray-400">
                        {alert.symbol}
                      </span>
                    </div>
                    <p className="text-[11px] font-medium text-gray-200 truncate">
                      {alert.title}
                    </p>
                    <p className="text-[10px] text-gray-500 leading-tight mt-0.5 line-clamp-2">
                      {alert.message}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Badge
                        className={`text-[7px] border-0 h-4 ${colors.bg} ${colors.text}`}
                      >
                        {alert.severity === 'info'
                          ? 'INFO'
                          : alert.severity === 'warning'
                          ? 'WARN'
                          : 'CRIT'}
                      </Badge>
                      {alert.isTriggered && (
                        <Badge className="text-[7px] border-0 h-4 bg-emerald-500/15 text-emerald-400">
                          ACTIVA
                        </Badge>
                      )}
                      <span className="text-[8px] text-gray-600 ml-auto">
                        {formatTimeAgo(alert.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-white/10 text-gray-600 hover:text-red-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(alert.id);
                    }}
                    title="Eliminar alerta"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
