export interface AlertCondition {
  field: 'price' | 'change_percent' | 'volume' | 'confluence_score';
  operator: '>=' | '<=' | '==' | '!=' | 'crosses_above' | 'crosses_below';
  value: number;
}

export interface AlertDefinition {
  id?: string;
  type: 'price_target' | 'confluence' | 'risk_event' | 'trade_executed' | 'position_closed';
  symbol: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  condition: AlertCondition;
  isRead: boolean;
  isTriggered: boolean;
  triggeredAt?: string;
}

export interface MarketDataSnapshot {
  price?: number;
  changePercent?: number;
  volume?: number;
  confluenceScore?: number;
}

// Track previous values for crosses_above / crosses_below detection
const previousValues = new Map<string, number>();

export class AlertEngine {
  /**
   * Evaluate a condition against current market data.
   * Returns true if the condition is met.
   */
  evaluateCondition(
    condition: AlertCondition,
    currentData: MarketDataSnapshot,
  ): boolean {
    const currentValue = this.resolveFieldValue(condition.field, currentData);
    if (currentValue === null) return false;

    const key = `${condition.field}`;
    const previousValue = previousValues.get(key);

    // Store current value for next evaluation
    previousValues.set(key, currentValue);

    switch (condition.operator) {
      case '>=':
        return currentValue >= condition.value;
      case '<=':
        return currentValue <= condition.value;
      case '==':
        return currentValue === condition.value;
      case '!=':
        return currentValue !== condition.value;
      case 'crosses_above':
        // Previous value was below threshold, current is at or above
        if (previousValue === undefined) return currentValue >= condition.value;
        return previousValue < condition.value && currentValue >= condition.value;
      case 'crosses_below':
        // Previous value was above threshold, current is at or below
        if (previousValue === undefined) return currentValue <= condition.value;
        return previousValue > condition.value && currentValue <= condition.value;
      default:
        return false;
    }
  }

  /**
   * Resolve a field name to its current numeric value from market data.
   */
  private resolveFieldValue(
    field: AlertCondition['field'],
    data: MarketDataSnapshot,
  ): number | null {
    switch (field) {
      case 'price':
        return data.price ?? null;
      case 'change_percent':
        return data.changePercent ?? null;
      case 'volume':
        return data.volume ?? null;
      case 'confluence_score':
        return data.confluenceScore ?? null;
      default:
        return null;
    }
  }

  /**
   * Create a price target alert definition.
   */
  createPriceTargetAlert(
    symbol: string,
    targetPrice: number,
    operator: '>=' | '<=' | 'crosses_above' | 'crosses_below',
  ): AlertDefinition {
    const operatorLabel: Record<string, string> = {
      '>=': 'supere',
      '<=': 'infle',
      crosses_above: 'cruce arriba de',
      crosses_below: 'cruce abajo de',
    };

    return {
      type: 'price_target',
      symbol,
      title: `Precio objetivo: ${symbol}`,
      message: `Alertar cuando ${symbol} ${operatorLabel[operator]} $${targetPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      severity: 'info',
      condition: {
        field: 'price',
        operator,
        value: targetPrice,
      },
      isRead: false,
      isTriggered: false,
    };
  }

  /**
   * Create a confluence alert (when confluence score exceeds threshold).
   */
  createConfluenceAlert(symbol: string, minScore: number): AlertDefinition {
    return {
      type: 'confluence',
      symbol,
      title: `Confluencia alta: ${symbol}`,
      message: `Alertar cuando la confluencia de ${symbol} supere ${minScore}%`,
      severity: 'warning',
      condition: {
        field: 'confluence_score',
        operator: '>=',
        value: minScore,
      },
      isRead: false,
      isTriggered: false,
    };
  }

  /**
   * Create a risk event alert.
   */
  createRiskEventAlert(
    symbol: string,
    event: string,
    severity: 'warning' | 'critical',
  ): AlertDefinition {
    return {
      type: 'risk_event',
      symbol,
      title: `Evento de riesgo: ${symbol}`,
      message: event,
      severity,
      condition: {
        field: 'price',
        operator: '!=',
        value: 0, // Risk events are manually triggered, condition is a placeholder
      },
      isRead: false,
      isTriggered: true,
      triggeredAt: new Date().toISOString(),
    };
  }

  /**
   * Create a trade execution alert.
   */
  createTradeAlert(
    symbol: string,
    direction: string,
    price: number,
  ): AlertDefinition {
    return {
      type: 'trade_executed',
      symbol,
      title: `Operación ejecutada: ${symbol}`,
      message: `${direction === 'LONG' ? 'Compra' : 'Venta'} ${symbol} a $${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      severity: 'info',
      condition: {
        field: 'price',
        operator: '==',
        value: price,
      },
      isRead: false,
      isTriggered: true,
      triggeredAt: new Date().toISOString(),
    };
  }

  /**
   * Check all alerts against current market data and return IDs of triggered alerts.
   */
  evaluateAlerts(
    alerts: AlertDefinition[],
    marketData: MarketDataSnapshot,
  ): string[] {
    const triggeredIds: string[] = [];

    for (const alert of alerts) {
      if (alert.isTriggered) continue; // Already triggered

      const isTriggered = this.evaluateCondition(alert.condition, marketData);
      if (isTriggered) {
        triggeredIds.push(alert.id ?? '');
      }
    }

    return triggeredIds;
  }

  /**
   * Reset the previous values tracker (useful for testing or on app reset).
   */
  resetPreviousValues(): void {
    previousValues.clear();
  }
}

// Singleton instance for reuse
export const alertEngine = new AlertEngine();
