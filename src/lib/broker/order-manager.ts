import type { ConfluenceResult } from '../types';
import type { BrokerProvider, BrokerOrder, OrderRequest } from './broker-interface';
import type { RiskConfig, RiskAssessment, AccountSnapshot } from '../risk/risk-engine';
import { RiskEngine } from '../risk/risk-engine';

/**
 * Order Manager — orchestrates the full trade lifecycle:
 *
 * 1. Receives a ConfluenceResult (signal from analysis)
 * 2. Runs RiskEngine.assessTrade() to check if the trade is allowed
 * 3. If allowed, submits the order to the broker
 * 4. Returns the result (order + risk assessment)
 *
 * This is the ONLY place where signals become real orders.
 * All risk checks happen here before any broker API call.
 */

export interface TradeExecutionResult {
  /** Whether the trade was executed */
  executed: boolean;
  /** Risk assessment details */
  risk: RiskAssessment;
  /** The broker order (if executed) */
  order: BrokerOrder | null;
  /** Error message if something went wrong */
  error?: string;
  /** Timestamp of the execution attempt */
  timestamp: number;
}

export class OrderManager {
  private riskEngine: RiskEngine;
  private broker: BrokerProvider;

  constructor(broker: BrokerProvider, riskConfig?: Partial<RiskConfig>) {
    this.broker = broker;
    this.riskEngine = new RiskEngine(riskConfig);
  }

  /**
   * Execute a trade from a confluence signal.
   *
   * Steps:
   * 1. Build account snapshot from broker
   * 2. Run risk assessment
   * 3. If allowed, submit order to broker
   * 4. Return result
   */
  async executeTrade(confluence: ConfluenceResult): Promise<TradeExecutionResult> {
    const timestamp = Date.now();

    try {
      // Step 1: Get account snapshot from broker
      const account = await this.buildAccountSnapshot();

      // Step 2: Risk assessment
      const risk = this.riskEngine.assessTrade(confluence, account);

      if (!risk.allowed) {
        return {
          executed: false,
          risk,
          order: null,
          error: risk.reason || 'Trade not allowed by risk engine',
          timestamp,
        };
      }

      // Step 3: Build order request from confluence + risk
      const orderRequest = this.buildOrderRequest(confluence, risk);

      // Step 4: Submit order to broker
      const order = await this.broker.submitOrder(orderRequest);

      return {
        executed: true,
        risk,
        order,
        timestamp,
      };
    } catch (error) {
      return {
        executed: false,
        risk: {
          allowed: false,
          reason: 'Execution error',
          positionSize: 0,
          positionValue: 0,
          riskAmount: 0,
          riskPercent: 0,
          dailyPnl: 0,
          currentDrawdown: 0,
          openPositions: 0,
          warnings: [],
        },
        order: null,
        error: error instanceof Error ? error.message : 'Unknown execution error',
        timestamp,
      };
    }
  }

  /**
   * Pre-flight check: assess a trade without actually executing it.
   * Useful for showing the user what would happen before they confirm.
   */
  async assessTrade(confluence: ConfluenceResult): Promise<RiskAssessment> {
    const account = await this.buildAccountSnapshot();
    return this.riskEngine.assessTrade(confluence, account);
  }

  /**
   * Get the current risk configuration.
   */
  getRiskConfig(): RiskConfig {
    return this.riskEngine.getConfig();
  }

  /**
   * Update risk configuration at runtime.
   */
  updateRiskConfig(updates: Partial<RiskConfig>): void {
    this.riskEngine.updateConfig(updates);
  }

  /**
   * Get the broker provider (for direct access if needed).
   */
  getBroker(): BrokerProvider {
    return this.broker;
  }

  // ─── Private helpers ───

  /**
   * Build an AccountSnapshot from the broker's live data.
   */
  private async buildAccountSnapshot(): Promise<AccountSnapshot> {
    try {
      const account = await this.broker.getAccount();
      const positions = await this.broker.getPositions();

      return {
        equity: account.equity,
        equityPeak: account.equity, // TODO: track equity peak over time
        dailyPnl: 0, // TODO: track daily P&L from closed trades today
        dailyPnlStart: Date.now(),
        openPositions: positions.length,
        unrealizedPnl: positions.reduce((sum, p) => sum + p.unrealizedPnl, 0),
        lastTradeTime: null,
      };
    } catch {
      // If broker is unavailable, return a safe default that will deny trades
      return {
        equity: 0,
        equityPeak: 0,
        dailyPnl: 0,
        dailyPnlStart: Date.now(),
        openPositions: 0,
        unrealizedPnl: 0,
        lastTradeTime: null,
      };
    }
  }

  /**
   * Build an OrderRequest from confluence signal + risk assessment.
   *
   * For LONG signals: buy at market, with bracket (stop loss + take profit)
   * For SHORT signals: sell at market, with bracket
   *
   * Note: Alpaca supports bracket orders but for simplicity we start with
   * a simple market order. The SL/TP are stored in the confluence for manual tracking.
   */
  private buildOrderRequest(confluence: ConfluenceResult, risk: RiskAssessment): OrderRequest {
    const isLong = confluence.overallDirection === 'LONG';

    return {
      symbol: confluence.symbol,
      side: isLong ? 'buy' : 'sell',
      qty: risk.positionSize,
      type: 'market',
      timeInForce: 'day',
      clientId: `tradeiq-${confluence.symbol}-${Date.now()}`,
    };
  }
}
