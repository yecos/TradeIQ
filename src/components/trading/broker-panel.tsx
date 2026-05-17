'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Link2, Shield, Unlink } from 'lucide-react';

interface BrokerConfig {
  id?: string;
  brokerName: string;
  apiKey: string;
  apiSecret: string;
  isPaper: boolean;
  isActive: boolean;
}

interface BrokerPanelProps {
  config: BrokerConfig | null;
  onSave: (config: Partial<BrokerConfig>) => void;
  onDisconnect: () => void;
}

export function BrokerPanel({ config, onSave, onDisconnect }: BrokerPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    apiKey: config?.apiKey || '',
    apiSecret: config?.apiSecret || '',
    isPaper: config?.isPaper !== false,
  });

  const handleSave = () => {
    onSave({
      brokerName: 'alpaca',
      apiKey: form.apiKey,
      apiSecret: form.apiSecret,
      isPaper: form.isPaper,
    });
    setIsEditing(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs font-semibold text-gray-300">Broker</span>
        </div>
        {config?.isActive ? (
          <Badge className="text-[9px] border-0 bg-emerald-500/15 text-emerald-400">
            <Shield className="w-2.5 h-2.5 mr-1" />
            Conectado
          </Badge>
        ) : (
          <Badge className="text-[9px] border-0 bg-gray-500/15 text-gray-400">
            Desconectado
          </Badge>
        )}
      </div>

      {config?.isActive && !isEditing ? (
        <div className="p-3 rounded-lg trading-card">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs font-medium text-white">Alpaca Markets</p>
              <p className="text-[10px] text-gray-500">
                {config.isPaper ? 'Paper Trading' : 'Live Trading'} | API: ...{config.apiKey.slice(-4)}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
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
              onClick={onDisconnect}
            >
              <Unlink className="w-3 h-3 mr-1" />
              Desconectar
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-3 rounded-lg trading-card space-y-2">
          <p className="text-[10px] text-gray-400">
            Conecta tu cuenta de Alpaca para paper trading. Tus claves se guardan localmente.
          </p>
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
          <Button
            size="sm"
            className="w-full h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
            onClick={handleSave}
            disabled={!form.apiKey || !form.apiSecret}
          >
            Conectar
          </Button>
        </div>
      )}
    </div>
  );
}
