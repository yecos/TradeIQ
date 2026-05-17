'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Link2,
  Shield,
  Unlink,
  BarChart3,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';

interface BrokerConfig {
  id?: string;
  brokerName: string;
  apiKey: string;
  apiSecret: string;
  isPaper: boolean;
  isActive: boolean;
}

interface BrokerAccountInfo {
  equity: number;
  cash: number;
  buyingPower: number;
  longMarketValue: number;
  shortMarketValue: number;
  status: string;
  isPaper: boolean;
  patternDayTrader: boolean;
}

interface BrokerPositionInfo {
  symbol: string;
  qty: number;
  side: 'long' | 'short';
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  costBasis: number;
}

interface BrokerPanelProps {
  config: BrokerConfig | null;
  onSave: (config: Partial<BrokerConfig>) => void;
  onDisconnect: () => void;
}

export function BrokerPanel({ config, onSave, onDisconnect }: BrokerPanelProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    apiKey: config?.apiKey || '',
    apiSecret: config?.apiSecret || '',
    isPaper: config?.isPaper !== false,
  });
  const [showPositions, setShowPositions] = useState(true);

  // Fetch broker data (account + positions)
  const { data: brokerData, isLoading: isLoadingBroker, refetch: refetchBroker } = useQuery({
    queryKey: ['brokerData'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/broker');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{
          config: BrokerConfig | null;
          brokerConnected: boolean;
          isRealBroker: boolean;
          account: BrokerAccountInfo | null;
          positions: BrokerPositionInfo[];
        }>;
      } catch {
        return {
          config: null,
          brokerConnected: false,
          isRealBroker: false,
          account: null,
          positions: [],
        };
      }
    },
    refetchInterval: 30000,
    staleTime: 10000,
    enabled: !!config?.isActive,
  });

  // Connect to broker
  const connectMutation = useMutation({
    mutationFn: async (data: { apiKey: string; apiSecret: string; isPaper: boolean }) => {
      const res = await fetch('/api/broker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brokerName: 'alpaca',
          apiKey: data.apiKey,
          apiSecret: data.apiSecret,
          isPaper: data.isPaper,
        }),
      });
      if (!res.ok) throw new Error('Connection failed');
      return res.json() as Promise<{
        config: BrokerConfig;
        brokerConnected: boolean;
        connectionError?: string;
        accountNumber?: string;
        equity?: number;
      }>;
    },
    onSuccess: (data) => {
      if (data.brokerConnected) {
        toast.success(`Broker conectado — Cuenta ${data.accountNumber} ($${data.equity?.toFixed(2)})`);
        onSave({
          brokerName: 'alpaca',
          apiKey: form.apiKey,
          apiSecret: form.apiSecret,
          isPaper: form.isPaper,
          isActive: true,
        });
        setIsEditing(false);
        refetchBroker();
      } else {
        toast.error(`Error de conexión: ${data.connectionError || 'Credenciales inválidas'}`);
      }
    },
    onError: () => {
      toast.error('Error al conectar con Alpaca. Verifica tus credenciales.');
    },
  });

  // Close position mutation
  const closePositionMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const res = await fetch(`/api/broker/positions?symbol=${encodeURIComponent(symbol)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to close position');
      return res.json();
    },
    onSuccess: (_, symbol) => {
      toast.success(`Posición ${symbol} cerrada`);
      refetchBroker();
    },
    onError: () => {
      toast.error('Error al cerrar posición');
    },
  });

  const handleSave = () => {
    if (!form.apiKey || !form.apiSecret) {
      toast.error('API Key y API Secret son requeridos');
      return;
    }
    connectMutation.mutate({
      apiKey: form.apiKey,
      apiSecret: form.apiSecret,
      isPaper: form.isPaper,
    });
  };

  const handleDisconnect = useCallback(() => {
    // Send empty credentials to clear
    fetch('/api/broker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brokerName: 'alpaca', apiKey: '', apiSecret: '', isPaper: true }),
    }).then(() => {
      onDisconnect();
      queryClient.invalidateQueries({ queryKey: ['brokerData'] });
      toast.success('Broker desconectado');
    }).catch(() => {
      toast.error('Error al desconectar');
    });
  }, [onDisconnect, queryClient]);

  const account = brokerData?.account;
  const positions = brokerData?.positions || [];
  const isConnected = brokerData?.brokerConnected || false;
  const isReal = brokerData?.isRealBroker || false;

  // Calculate total P&L
  const totalPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs font-semibold text-gray-300">Broker</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isConnected ? (
            <>
              <Badge className="text-[9px] border-0 bg-emerald-500/15 text-emerald-400">
                <Shield className="w-2.5 h-2.5 mr-1" />
                {isReal ? (config?.isPaper !== false ? 'Paper' : 'Live') : 'Mock'}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 w-5 p-0 text-gray-500"
                onClick={() => refetchBroker()}
              >
                <RefreshCw className="w-3 h-3" />
              </Button>
            </>
          ) : (
            <Badge className="text-[9px] border-0 bg-gray-500/15 text-gray-400">
              Desconectado
            </Badge>
          )}
        </div>
      </div>

      {/* Connected: Show Account Info + Positions */}
      {isConnected && !isEditing ? (
        <>
          {/* Account Info Card */}
          {account && (
            <div className="p-3 rounded-lg trading-card space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-white">Alpaca Markets</p>
                <div className="flex items-center gap-1">
                  {config?.isPaper !== false && (
                    <Badge className="text-[8px] border-0 bg-yellow-500/15 text-yellow-400">
                      PAPER
                    </Badge>
                  )}
                  <span className="text-[9px] text-gray-500">...{config?.apiKey?.slice(-4) || '****'}</span>
                </div>
              </div>

              {/* Key Metrics Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[9px] text-gray-500">Equity</p>
                  <p className="text-xs font-mono font-bold text-white">
                    ${account.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-500">Cash</p>
                  <p className="text-xs font-mono text-white">
                    ${account.cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-500">Buying Power</p>
                  <p className="text-xs font-mono text-white">
                    ${account.buyingPower.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-500">Market Value</p>
                  <p className="text-xs font-mono text-white">
                    ${account.longMarketValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Total Unrealized P&L */}
              {positions.length > 0 && (
                <div className="pt-1 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] text-gray-500">Unrealized P&L ({positions.length} pos.)</p>
                    <p className={`text-xs font-mono font-bold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
                    </p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] text-gray-400"
                  onClick={() => setIsEditing(true)}
                >
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] text-red-400 hover:text-red-300"
                  onClick={handleDisconnect}
                >
                  <Unlink className="w-3 h-3 mr-1" />
                  Desconectar
                </Button>
              </div>
            </div>
          )}

          {/* Positions */}
          {positions.length > 0 && (
            <div className="rounded-lg trading-card overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-300 hover:bg-white/5"
                onClick={() => setShowPositions(!showPositions)}
              >
                <div className="flex items-center gap-1.5">
                  <BarChart3 className="w-3 h-3 text-gray-400" />
                  Posiciones ({positions.length})
                </div>
                {showPositions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showPositions && (
                <div className="border-t border-white/5 max-h-48 overflow-y-auto custom-scrollbar">
                  {positions.map((pos) => (
                    <div
                      key={pos.symbol}
                      className="px-3 py-2 border-b border-white/5 last:border-0 hover:bg-white/5"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white">{pos.symbol}</span>
                          <Badge className={`text-[7px] border-0 ${
                            pos.side === 'long' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                          }`}>
                            {pos.side.toUpperCase()}
                          </Badge>
                          <span className="text-[9px] text-gray-500">x{pos.qty}</span>
                        </div>
                        <button
                          className="text-[9px] text-red-400/70 hover:text-red-400"
                          onClick={() => closePositionMutation.mutate(pos.symbol)}
                          disabled={closePositionMutation.isPending}
                        >
                          Cerrar
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-[9px]">
                        <span className="text-gray-500">
                          Entry: ${pos.avgEntryPrice.toFixed(2)}
                        </span>
                        <span className={`font-mono ${pos.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)} ({pos.unrealizedPnlPercent >= 0 ? '+' : ''}{pos.unrealizedPnlPercent.toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isLoadingBroker && (
            <div className="flex items-center justify-center py-4">
              <RefreshCw className="w-4 h-4 animate-spin text-gray-500" />
            </div>
          )}
        </>
      ) : isEditing || !isConnected ? (
        /* Connection Form */
        <div className="p-3 rounded-lg trading-card space-y-2">
          {!isConnected && (
            <div className="flex items-start gap-1.5 p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
              <AlertTriangle className="w-3 h-3 text-yellow-400 mt-0.5 flex-shrink-0" />
              <p className="text-[9px] text-yellow-300">
                Conecta tu cuenta de Alpaca para operar. Paper trading es recomendado para pruebas.
              </p>
            </div>
          )}
          <div>
            <Label className="text-[10px] text-gray-400">API Key</Label>
            <Input
              className="h-7 text-xs bg-white/5 border-white/10"
              placeholder="PK..."
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-[10px] text-gray-400">API Secret</Label>
            <Input
              type="password"
              className="h-7 text-xs bg-white/5 border-white/10"
              placeholder="••••••••"
              value={form.apiSecret}
              onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.isPaper}
              onCheckedChange={(checked) => setForm({ ...form, isPaper: checked })}
              className="data-[state=checked]:bg-emerald-600 scale-75"
            />
            <span className="text-[10px] text-gray-400">Paper Trading (Recomendado)</span>
          </div>
          {!form.isPaper && (
            <div className="flex items-start gap-1.5 p-2 rounded bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-[9px] text-red-300">
                LIVE TRADING — Dinero real en juego. Solo usa esta opción si tienes experiencia.
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
              onClick={handleSave}
              disabled={!form.apiKey || !form.apiSecret || connectMutation.isPending}
            >
              {connectMutation.isPending ? (
                <RefreshCw className="w-3 h-3 animate-spin mr-1" />
              ) : null}
              {isConnected ? 'Reconectar' : 'Conectar'}
            </Button>
            {isConnected && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-gray-400"
                onClick={() => setIsEditing(false)}
              >
                Cancelar
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
