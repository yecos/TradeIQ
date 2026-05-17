'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Plus, X } from 'lucide-react';

interface JournalEntry {
  id: string;
  symbol: string;
  direction: string;
  entryPrice: number;
  exitPrice?: number;
  stopLoss: number;
  takeProfit: number;
  result?: string;
  pnl?: number;
  notes: string;
  createdAt: string;
}

interface JournalPanelProps {
  entries: JournalEntry[];
  onAddEntry: (entry: Partial<JournalEntry>) => void;
}

export function JournalPanel({ entries, onAddEntry }: JournalPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    symbol: '',
    direction: 'LONG',
    entryPrice: '',
    exitPrice: '',
    stopLoss: '',
    takeProfit: '',
    notes: '',
    lessons: '',
  });

  const handleSubmit = () => {
    onAddEntry({
      symbol: form.symbol,
      direction: form.direction,
      entryPrice: parseFloat(form.entryPrice),
      exitPrice: form.exitPrice ? parseFloat(form.exitPrice) : undefined,
      stopLoss: parseFloat(form.stopLoss),
      takeProfit: parseFloat(form.takeProfit),
      notes: form.notes,
    });
    setShowForm(false);
    setForm({ symbol: '', direction: 'LONG', entryPrice: '', exitPrice: '', stopLoss: '', takeProfit: '', notes: '', lessons: '' });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs font-semibold text-gray-300">Bitácora</span>
        </div>
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
                className="h-7 text-xs bg-white/5 border-white/10"
                placeholder="0.00"
                value={form.entryPrice}
                onChange={(e) => setForm({ ...form, entryPrice: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-[10px] text-gray-400">Salida</Label>
              <Input
                type="number"
                className="h-7 text-xs bg-white/5 border-white/10"
                placeholder="0.00"
                value={form.exitPrice}
                onChange={(e) => setForm({ ...form, exitPrice: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-[10px] text-gray-400">Stop Loss</Label>
              <Input
                type="number"
                className="h-7 text-xs bg-white/5 border-white/10"
                placeholder="0.00"
                value={form.stopLoss}
                onChange={(e) => setForm({ ...form, stopLoss: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-[10px] text-gray-400">Take Profit</Label>
              <Input
                type="number"
                className="h-7 text-xs bg-white/5 border-white/10"
                placeholder="0.00"
                value={form.takeProfit}
                onChange={(e) => setForm({ ...form, takeProfit: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label className="text-[10px] text-gray-400">Notas</Label>
            <Textarea
              className="text-xs bg-white/5 border-white/10 min-h-[50px]"
              placeholder="Notas sobre la operación..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <Button
            size="sm"
            className="w-full h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
            onClick={handleSubmit}
            disabled={!form.symbol || !form.entryPrice}
          >
            Guardar Entrada
          </Button>
        </div>
      )}

      <div className="space-y-1.5 custom-scrollbar max-h-[250px] overflow-y-auto">
        {entries.length === 0 ? (
          <p className="text-[10px] text-gray-500 text-center py-4">
            Sin entradas en la bitácora
          </p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="p-2 rounded-lg trading-card text-[10px]">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-white">{entry.symbol}</span>
                  <Badge
                    className={`text-[8px] border-0 ${
                      entry.direction === 'LONG' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                    }`}
                  >
                    {entry.direction}
                  </Badge>
                </div>
                {entry.result && (
                  <Badge
                    className={`text-[8px] border-0 ${
                      entry.result === 'win' ? 'bg-emerald-500/15 text-emerald-400' :
                      entry.result === 'loss' ? 'bg-red-500/15 text-red-400' :
                      'bg-gray-500/15 text-gray-400'
                    }`}
                  >
                    {entry.result === 'win' ? 'GANADA' : entry.result === 'loss' ? 'PERDIDA' : 'NEUTRA'}
                  </Badge>
                )}
              </div>
              <div className="flex gap-3 text-gray-400">
                <span>Entrada: ${entry.entryPrice.toFixed(2)}</span>
                {entry.exitPrice && <span>Salida: ${entry.exitPrice.toFixed(2)}</span>}
              </div>
              {entry.notes && <p className="text-gray-500 mt-1 truncate">{entry.notes}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
