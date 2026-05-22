'use client';

import { useAppStore } from '@/lib/store';
import { Star, TrendingUp, TrendingDown } from 'lucide-react';

interface WatchlistQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  /** Whether this price is from a live WebSocket */
  isRealtime?: boolean;
}

interface WatchlistPanelProps {
  quotes: WatchlistQuote[];
  isLoading?: boolean;
  /** When true, render as horizontal scrollable chips for mobile */
  compact?: boolean;
}

/**
 * Format price with appropriate decimal precision.
 * BTC → "$103,245.67", XRP → "$0.5523", DOGE → "$0.162500"
 */
function formatWatchlistPrice(price: number | null | undefined): string {
  if (price == null) return '—';
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(5);
  return price.toFixed(6);
}

export function WatchlistPanel({ quotes, isLoading, compact }: WatchlistPanelProps) {
  const { selectedSymbol, setSelectedSymbol } = useAppStore();

  // ── Compact Mode: Horizontal scrollable chips (for mobile) ──
  if (compact) {
    return (
      <div className="chips-scroll">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="chip chip-inactive animate-pulse" style={{ minWidth: '80px' }}>
              ...
            </div>
          ))
        ) : quotes.length === 0 ? (
          <span className="text-[10px] text-gray-500 px-2">Cargando...</span>
        ) : (
          quotes.map((q) => {
            const isSelected = q.symbol === selectedSymbol;
            const isPositive = q.change >= 0;

            return (
              <button
                key={q.symbol}
                onClick={() => setSelectedSymbol(q.symbol)}
                className={`chip ${isSelected ? 'chip-active' : 'chip-inactive'}`}
              >
                <span className="font-bold">{q.symbol}</span>
                {q.isRealtime && (
                  <span className="relative flex h-1.5 w-1.5 mr-0.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                )}
                <span className={`font-mono text-[10px] ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isPositive ? '+' : ''}{(q.changePercent ?? 0).toFixed(1)}%
                </span>
              </button>
            );
          })
        )}
      </div>
    );
  }

  // ── Full Mode: Vertical list (for sidebar / drawer) ──
  return (
    <div className="space-y-0.5 sm:space-y-1 custom-scrollbar max-h-[250px] sm:max-h-[300px] overflow-y-auto">
      {isLoading ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-white/5 animate-pulse" />
        ))
      ) : quotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-gray-500">
          <Star className="w-6 h-6 mb-2 opacity-30" />
          <p className="text-[10px]">Cargando datos...</p>
        </div>
      ) : (
        quotes.map((q) => {
          const isSelected = q.symbol === selectedSymbol;
          const isPositive = q.change >= 0;

          return (
            <button
              key={q.symbol}
              onClick={() => setSelectedSymbol(q.symbol)}
              className={`w-full flex items-center justify-between p-1.5 sm:p-2.5 rounded-lg transition-all text-left min-h-[44px] ${
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
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-bold text-white truncate">{q.symbol}</p>
                    {q.isRealtime && (
                      <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 truncate">{q.name}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-2">
                <p className="text-xs font-mono text-white">${formatWatchlistPrice(q.price)}</p>
                <div className={`flex items-center gap-0.5 text-[10px] ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isPositive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                  {isPositive ? '+' : ''}{(q.changePercent ?? 0).toFixed(2)}%
                </div>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
