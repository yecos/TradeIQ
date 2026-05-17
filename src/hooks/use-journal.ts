'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface JournalEntry {
  id: string;
  symbol: string;
  direction: string;
  entryPrice: number;
  exitPrice?: number | null;
  stopLoss: number;
  takeProfit: number;
  result?: string | null;
  pnl?: number | null;
  notes: string;
  lessons: string;
  vectorsUsed: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPnl: number;
  profitFactor: number;
  bestTrade: number;
  worstTrade: number;
  avgRR: number;
}

export interface AuditEvent {
  id: string;
  eventType: 'signal_generated' | 'trade_assessed' | 'trade_executed' | 'trade_closed' | 'risk_warning' | 'alert_triggered';
  symbol: string;
  direction?: string;
  price?: number;
  quantity?: number;
  pnl?: number;
  details: string;
  timestamp: string;
}

export function useJournal() {
  const queryClient = useQueryClient();

  // Fetch journal entries
  const {
    data: entriesData,
    isLoading: isLoadingEntries,
  } = useQuery({
    queryKey: ['journal'],
    queryFn: async () => {
      const res = await fetch('/api/journal');
      if (!res.ok) throw new Error('Failed to fetch journal');
      const data = await res.json();
      return data.entries as JournalEntry[];
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // Fetch stats
  const {
    data: statsData,
    isLoading: isLoadingStats,
  } = useQuery({
    queryKey: ['journal', 'stats'],
    queryFn: async () => {
      const res = await fetch('/api/journal?stats=true');
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      return data.stats as JournalStats;
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // Fetch audit events
  const {
    data: auditData,
    isLoading: isLoadingAudit,
  } = useQuery({
    queryKey: ['journal', 'audit'],
    queryFn: async () => {
      const res = await fetch('/api/journal/audit?limit=30');
      if (!res.ok) throw new Error('Failed to fetch audit');
      const data = await res.json();
      return data.events as AuditEvent[];
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  // Add entry mutation
  const addEntryMutation = useMutation({
    mutationFn: async (entry: Record<string, unknown>) => {
      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (!res.ok) throw new Error('Failed to add entry');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal'] });
      queryClient.invalidateQueries({ queryKey: ['journal', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['journal', 'audit'] });
    },
  });

  // Delete entry mutation
  const deleteEntryMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/journal?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete entry');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal'] });
      queryClient.invalidateQueries({ queryKey: ['journal', 'stats'] });
    },
  });

  // Export CSV
  const exportCSV = async () => {
    try {
      const res = await fetch('/api/journal?format=csv');
      if (!res.ok) throw new Error('Failed to export CSV');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bitacora_tradeiq.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('CSV export error:', error);
      throw error;
    }
  };

  // Log audit event
  const logAuditEvent = async (event: Omit<AuditEvent, 'id' | 'timestamp'>) => {
    try {
      await fetch('/api/journal/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
      queryClient.invalidateQueries({ queryKey: ['journal', 'audit'] });
    } catch (error) {
      console.error('Audit log error:', error);
    }
  };

  return {
    entries: entriesData || [],
    stats: statsData || null,
    auditEvents: auditData || [],
    isLoading: isLoadingEntries || isLoadingStats,
    isLoadingAudit,
    addEntry: addEntryMutation.mutateAsync,
    deleteEntry: deleteEntryMutation.mutateAsync,
    exportCSV,
    logAuditEvent,
    isAdding: addEntryMutation.isPending,
    isDeleting: deleteEntryMutation.isPending,
  };
}
