'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

export interface AlertItem {
  id: string;
  userId: string | null;
  type: 'price_target' | 'confluence' | 'risk_event' | 'trade_executed' | 'position_closed';
  symbol: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  isRead: boolean;
  isTriggered: boolean;
  condition: string; // JSON string
  triggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateAlertPayload {
  type: string;
  symbol: string;
  title: string;
  message: string;
  severity: string;
  condition: Record<string, unknown>;
}

export function useAlerts() {
  const queryClient = useQueryClient();

  // Fetch alerts — auto-refetch every 30 seconds
  const {
    data: alerts = [],
    isLoading,
    error,
  } = useQuery<AlertItem[]>({
    queryKey: ['alerts'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/alerts');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return (data.alerts || []) as AlertItem[];
      } catch {
        return [] as AlertItem[];
      }
    },
    refetchInterval: 30000,
    staleTime: 10000,
  });

  // Unread count
  const unreadCount = alerts.filter((a) => !a.isRead).length;

  // Create alert mutation
  const createMutation = useMutation({
    mutationFn: async (payload: CreateAlertPayload) => {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to create alert');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isRead: true }),
      });
      if (!res.ok) throw new Error('Failed to mark as read');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  // Delete alert mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/alerts?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete alert');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    const unreadAlerts = alerts.filter((a) => !a.isRead);
    await Promise.all(
      unreadAlerts.map((alert) =>
        fetch('/api/alerts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: alert.id, isRead: true }),
        }),
      ),
    );
    queryClient.invalidateQueries({ queryKey: ['alerts'] });
  }, [alerts, queryClient]);

  // Sorted by createdAt desc (already comes sorted from API)
  const sortedAlerts = [...alerts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return {
    alerts: sortedAlerts,
    unreadCount,
    isLoading,
    error,
    createAlert: createMutation.mutateAsync,
    markAsRead: markAsReadMutation.mutateAsync,
    deleteAlert: deleteMutation.mutateAsync,
    markAllAsRead,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
