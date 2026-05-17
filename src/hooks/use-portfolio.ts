'use client';

import { useQuery } from '@tanstack/react-query';

export interface PortfolioSnapshot {
  timestamp: number;
  equity: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalPnl: number;
  positions: number;
  dailyPnl: number;
}

export interface PortfolioPosition {
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

export interface PortfolioMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  totalPnl: number;
  totalPnlPercent: number;
  bestTrade: number;
  worstTrade: number;
  avgTradeDurationHours: number;
  currentStreak: number;
}

export interface PortfolioData {
  snapshot: PortfolioSnapshot;
  positions: PortfolioPosition[];
  metrics: PortfolioMetrics;
}

interface UsePortfolioOptions {
  brokerConnected: boolean;
}

export function usePortfolio({ brokerConnected }: UsePortfolioOptions) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<PortfolioData>({
    queryKey: ['portfolio'],
    queryFn: async () => {
      const res = await fetch('/api/broker/portfolio');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<PortfolioData>;
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
    enabled: brokerConnected,
    retry: 1,
  });

  return {
    data: data ?? null,
    isLoading,
    error,
    refetch,
  };
}
