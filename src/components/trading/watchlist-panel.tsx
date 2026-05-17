'use client';

import { useAppStore } from '@/lib/store';
import { Star, TrendingUp, TrendingDown } from 'lucide-react';

interface WatchlistQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

interface WatchlistPanelProps {
  quotes: WatchlistQuote[];
  isLoading?: boolean;
}

export function WatchlistPanel({ quotes, isLoading }: WatchlistPanelProps) {
  const { selectedSymbol, setSelectedSymbol } = useAppStore();

  return (
    <div className="space-y-1 custom-scrollbar max-h-[300px] overflow-y-auto">
      {isLoading ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-white/5 animate-pulse" />
        ))
      ) : (
        quotes.map((q) => {
          const isSelected = q.symbol === selectedSymbol;
          const isPositive = q.change >= 0;

          return (
            <button
              key={q.symbol}
              onClick={() => setSelectedSymbol(q.symbol)}
              className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-all text-left ${
                isSelected
                  ? 'trading-card-accent glow-green'
                  : 'hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Star
                  className={`w-3.5 h-3.5 flex-shrink-0 ${
                    isSelected ? 'text-emerald-400 fill-emerald-400' : 'text-gray-600'
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{q.symbol}</p>
                  <p className="text-[10px] text-gray-500 truncate">{q.name}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-2">
                <p className="text-xs font-mono text-white">${q.price.toFixed(2)}</p>
                <div className={`flex items-center gap-0.5 text-[10px] ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isPositive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                  {isPositive ? '+' : ''}{q.changePercent.toFixed(2)}%
                </div>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
