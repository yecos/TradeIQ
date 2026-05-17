import type { BrokerProvider } from './broker-interface';
import { AlpacaBroker, createAlpacaBroker } from './alpaca-broker';
import { MockBroker } from './mock-broker';

/**
 * Broker Factory — creates the appropriate broker provider based on config.
 *
 * Following the Provider Pattern (ADR-002):
 * - If Alpaca API keys are provided → AlpacaBroker (real or paper)
 * - If no keys or empty keys → MockBroker (simulated)
 */

let _instance: BrokerProvider | null = null;

/**
 * Get or create the singleton broker provider.
 *
 * Call initBroker() first with credentials, or it defaults to MockBroker.
 */
export function getBroker(): BrokerProvider {
  if (!_instance) {
    _instance = new MockBroker();
  }
  return _instance;
}

/**
 * Initialize the broker with Alpaca credentials.
 * Creates an AlpacaBroker if keys are valid, otherwise falls back to MockBroker.
 *
 * Returns the ConnectionTestResult so the caller knows if it worked.
 */
export async function initBroker(
  apiKey: string,
  apiSecret: string,
  isPaper: boolean = true
): Promise<{ provider: BrokerProvider; connectionTest: import('./broker-interface').ConnectionTestResult }> {
  const broker = createAlpacaBroker(apiKey, apiSecret, isPaper);

  if (!broker) {
    // No valid credentials — use mock
    _instance = new MockBroker();
    return {
      provider: _instance,
      connectionTest: {
        connected: false,
        isPaper: true,
        error: 'No API credentials provided. Using simulated broker.',
      },
    };
  }

  // Test the connection before accepting it
  const testResult = await broker.testConnection();

  if (testResult.connected) {
    _instance = broker;
  } else {
    // Connection failed — fall back to mock
    console.warn(`[TradeIQ] Alpaca connection failed: ${testResult.error}. Using mock broker.`);
    _instance = new MockBroker();
  }

  return { provider: _instance, connectionTest: testResult };
}

/**
 * Reset the broker to mock mode (used when disconnecting).
 */
export function resetBroker(): void {
  _instance = new MockBroker();
}

/**
 * Check if the current broker is a real broker (Alpaca) or mock.
 */
export function isRealBroker(): boolean {
  return _instance instanceof AlpacaBroker;
}
