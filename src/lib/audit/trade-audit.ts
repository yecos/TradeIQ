export interface TradeAuditEvent {
  id?: string;
  eventType: 'signal_generated' | 'trade_assessed' | 'trade_executed' | 'trade_closed' | 'risk_warning' | 'alert_triggered';
  symbol: string;
  direction?: string;
  price?: number;
  quantity?: number;
  pnl?: number;
  details: string; // JSON with event-specific data
  timestamp: string;
}

type TradeEventType = TradeAuditEvent['eventType'];

const EVENT_TYPE_LABELS: Record<TradeEventType, string> = {
  signal_generated: 'Señal generada',
  trade_assessed: 'Operación evaluada',
  trade_executed: 'Operación ejecutada',
  trade_closed: 'Operación cerrada',
  risk_warning: 'Alerta de riesgo',
  alert_triggered: 'Alerta activada',
};

export function getEventTypeLabel(type: TradeEventType): string {
  return EVENT_TYPE_LABELS[type] || type;
}

export class TradeAudit {
  private events: TradeAuditEvent[] = [];
  private static instance: TradeAudit | null = null;

  private constructor() {}

  static getInstance(): TradeAudit {
    if (!TradeAudit.instance) {
      TradeAudit.instance = new TradeAudit();
    }
    return TradeAudit.instance;
  }

  /** Log a trade event (stores in memory) */
  logEvent(event: Omit<TradeAuditEvent, 'id' | 'timestamp'>): TradeAuditEvent {
    const newEvent: TradeAuditEvent = {
      ...event,
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date().toISOString(),
    };
    this.events.unshift(newEvent);

    // Keep max 500 events in memory
    if (this.events.length > 500) {
      this.events = this.events.slice(0, 500);
    }

    return newEvent;
  }

  /** Get recent events */
  getRecentEvents(limit: number = 50): TradeAuditEvent[] {
    return this.events.slice(0, limit);
  }

  /** Get events for a specific symbol */
  getEventsBySymbol(symbol: string): TradeAuditEvent[] {
    return this.events.filter((e) => e.symbol === symbol);
  }

  /** Get events by type */
  getEventsByType(eventType: TradeEventType): TradeAuditEvent[] {
    return this.events.filter((e) => e.eventType === eventType);
  }

  /** Get events in a date range */
  getEventsByDateRange(start: Date, end: Date): TradeAuditEvent[] {
    return this.events.filter((e) => {
      const t = new Date(e.timestamp).getTime();
      return t >= start.getTime() && t <= end.getTime();
    });
  }

  /** Export events as CSV */
  exportCSV(): string {
    const headers = ['ID', 'Tipo de Evento', 'Símbolo', 'Dirección', 'Precio', 'Cantidad', 'P&L', 'Detalles', 'Fecha/Hora'];
    const rows = this.events.map((e) => [
      e.id,
      e.eventType,
      e.symbol,
      e.direction || '',
      e.price?.toString() || '',
      e.quantity?.toString() || '',
      e.pnl?.toString() || '',
      `"${e.details.replace(/"/g, '""')}"`,
      e.timestamp,
    ]);
    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  /** Clear all events */
  clear(): void {
    this.events = [];
  }
}
