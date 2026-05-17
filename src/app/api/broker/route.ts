import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { initBroker, resetBroker, isRealBroker, getBroker } from '@/lib/broker/broker-factory';
import { encrypt, decrypt, isEncrypted } from '@/lib/crypto';

export async function GET() {
  try {
    const config = await db.brokerConfig.findFirst();

    // If config exists and is active, include live account info
    let accountInfo: Record<string, unknown> | null = null;
    let positions: import('@/lib/broker/broker-interface').BrokerPosition[] = [];
    let brokerConnected = false;

    if (config?.isActive && config.apiKey && config.apiSecret) {
      try {
        // Decrypt API keys for broker connection
        const decryptedKey = isEncrypted(config.apiKey) ? decrypt(config.apiKey) : config.apiKey;
        const decryptedSecret = isEncrypted(config.apiSecret) ? decrypt(config.apiSecret) : config.apiSecret;

        // Re-initialize broker with decrypted credentials if needed
        if (!isRealBroker()) {
          await initBroker(decryptedKey, decryptedSecret, config.isPaper);
        }

        const broker = getBroker();
        const connectionTest = await broker.testConnection();
        if (connectionTest.connected) {
          brokerConnected = true;
          const account = await broker.getAccount();
          accountInfo = {
            equity: account.equity,
            cash: account.cash,
            buyingPower: account.buyingPower,
            longMarketValue: account.longMarketValue,
            shortMarketValue: account.shortMarketValue,
            status: account.status,
            isPaper: account.isPaper,
            patternDayTrader: account.patternDayTrader,
          };
          positions = await broker.getPositions();
        }
      } catch (error) {
        console.warn('[TradeIQ] Failed to get broker account info:', error instanceof Error ? error.message : 'unknown');
      }
    }

    // Return config with masked keys (never expose full keys to frontend)
    const safeConfig = config ? {
      ...config,
      apiKey: config.apiKey ? `***${config.apiKey.slice(-4)}` : '',
      apiSecret: config.apiSecret ? '***hidden***' : '',
    } : null;

    return NextResponse.json({
      config: safeConfig,
      brokerConnected,
      isRealBroker: isRealBroker(),
      account: accountInfo,
      positions,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch broker config' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { brokerName, apiKey, apiSecret, isPaper } = body;

    // If clearing credentials (disconnect), reset broker to mock
    if (!apiKey && !apiSecret) {
      await db.brokerConfig.deleteMany({});
      resetBroker();
      return NextResponse.json({
        config: null,
        brokerConnected: false,
        isRealBroker: false,
      });
    }

    // Delete existing config and create new one
    await db.brokerConfig.deleteMany({});

    // Try to connect to Alpaca with the provided credentials FIRST
    // (before encrypting, so we know they work)
    const { connectionTest } = await initBroker(apiKey, apiSecret, isPaper !== false);
    const isActive = connectionTest.connected;

    // Encrypt API keys before storing in database
    const encryptedKey = encrypt(apiKey);
    const encryptedSecret = encrypt(apiSecret);

    const config = await db.brokerConfig.create({
      data: {
        brokerName: brokerName || 'alpaca',
        apiKey: encryptedKey,
        apiSecret: encryptedSecret,
        isPaper: isPaper !== false,
        isActive,
      },
    });

    // Return config with masked keys (never expose full keys to frontend)
    const safeConfig = {
      ...config,
      apiKey: `***${apiKey.slice(-4)}`,
      apiSecret: '***hidden***',
    };

    return NextResponse.json({
      config: safeConfig,
      brokerConnected: connectionTest.connected,
      isRealBroker: connectionTest.connected,
      connectionError: connectionTest.error,
      accountNumber: connectionTest.accountNumber,
      equity: connectionTest.equity,
    });
  } catch (error) {
    console.error('[TradeIQ] Broker config error:', error);
    return NextResponse.json({
      error: 'Failed to save broker config',
      detail: error instanceof Error ? error.message : 'unknown',
    }, { status: 500 });
  }
}
