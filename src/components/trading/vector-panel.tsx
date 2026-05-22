'use client';

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { VECTOR_DEFINITIONS } from '@/lib/vector-definitions';
import { useAppStore } from '@/lib/store';
import {
  TrendingUp,
  CandlestickChart,
  BarChart3,
  Newspaper,
  Brain,
  Building2,
  AlertTriangle,
} from 'lucide-react';

const iconMap: Record<string, React.ElementType> = {
  TrendingUp,
  CandlestickChart,
  BarChart3,
  Newspaper,
  Brain,
  Building2,
};

export function VectorPanel() {
  const { enabledVectors, toggleVector } = useAppStore();

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Vectores de Análisis
      </h3>
      <div className="space-y-2">
        {VECTOR_DEFINITIONS.map((vector) => {
          const Icon = iconMap[vector.icon] || TrendingUp;
          const isEnabled = enabledVectors.includes(vector.name);
          const isSimulated = vector.isSimulated;

          return (
            <div
              key={vector.id}
              className={`flex items-center justify-between p-2.5 rounded-lg transition-all ${
                isSimulated
                  ? 'trading-card opacity-40 border border-dashed border-white/10'
                  : isEnabled
                  ? 'trading-card-accent'
                  : 'trading-card opacity-50'
              }`}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${vector.color}20` }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: vector.color }} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Label className={`text-xs font-medium cursor-pointer truncate block ${
                      isSimulated ? 'text-gray-400' : 'text-gray-200'
                    }`}>
                      {vector.label}
                    </Label>
                    {isSimulated && (
                      <Badge className="text-[7px] border-0 bg-amber-500/20 text-amber-400 h-4 px-1 flex items-center gap-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        SIMULADO
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 truncate">
                    {vector.description}
                  </p>
                </div>
              </div>
              <Switch
                checked={isEnabled}
                onCheckedChange={() => toggleVector(vector.name)}
                className="data-[state=checked]:bg-emerald-600 scale-75"
                aria-label={`Toggle ${vector.label} vector`}
              />
            </div>
          );
        })}
      </div>
      <div className="pt-2 border-t border-white/5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-500">Vectores activos</span>
          <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-0">
            {enabledVectors.length}/{VECTOR_DEFINITIONS.length}
          </Badge>
        </div>
      </div>
    </div>
  );
}
