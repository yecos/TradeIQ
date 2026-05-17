import { create } from 'zustand';
import type { ConfluenceResult } from './types';

interface AppState {
  // Selected symbol
  selectedSymbol: string;
  setSelectedSymbol: (symbol: string) => void;

  // Enabled vectors
  enabledVectors: string[];
  toggleVector: (vectorId: string) => void;
  setEnabledVectors: (vectors: string[]) => void;

  // Analysis state
  isAnalyzing: boolean;
  setIsAnalyzing: (val: boolean) => void;

  // Last confluence result
  lastConfluence: ConfluenceResult | null;
  setLastConfluence: (result: ConfluenceResult | null) => void;

  // Chart timeframe
  timeframe: string;
  setTimeframe: (tf: string) => void;

  // Signals
  signals: ConfluenceResult[];
  addSignal: (signal: ConfluenceResult) => void;
  clearSignals: () => void;

  // Watchlist
  watchlist: string[];
  setWatchlist: (symbols: string[]) => void;

  // Active panel
  activePanel: 'analysis' | 'signals' | 'journal' | 'broker';
  setActivePanel: (panel: 'analysis' | 'signals' | 'journal' | 'broker') => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedSymbol: 'NVDA',
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),

  enabledVectors: ['technical', 'pattern', 'volume'],
  toggleVector: (vectorId) =>
    set((state) => ({
      enabledVectors: state.enabledVectors.includes(vectorId)
        ? state.enabledVectors.filter((v) => v !== vectorId)
        : [...state.enabledVectors, vectorId],
    })),
  setEnabledVectors: (vectors) => set({ enabledVectors: vectors }),

  isAnalyzing: false,
  setIsAnalyzing: (val) => set({ isAnalyzing: val }),

  lastConfluence: null,
  setLastConfluence: (result) => set({ lastConfluence: result }),

  timeframe: '1D',
  setTimeframe: (tf) => set({ timeframe: tf }),

  signals: [],
  addSignal: (signal) => set((state) => ({ signals: [signal, ...state.signals].slice(0, 50) })),
  clearSignals: () => set({ signals: [] }),

  watchlist: ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'SPY', 'QQQ', 'AMD'],
  setWatchlist: (symbols) => set({ watchlist: symbols }),

  activePanel: 'analysis',
  setActivePanel: (panel) => set({ activePanel: panel }),
}));
