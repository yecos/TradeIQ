import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol') || 'NVDA';
  const interval = searchParams.get('interval') || '1m';
  const days = parseInt(searchParams.get('days') || '1');

  const alpacaApiKey = process.env.ALPACA_API_KEY || process.env.NEXT_PUBLIC_ALPACA_API_KEY;
  const alpacaApiSecret = process.env.ALPACA_API_SECRET || process.env.NEXT_PUBLIC_ALPACA_API_SECRET;

  const debug: Record<string, unknown> = {
    symbol,
    interval,
    days,
    hasApiKey: !!alpacaApiKey,
    hasApiSecret: !!alpacaApiSecret,
    apiKeyPrefix: alpacaApiKey?.substring(0, 6),
  };

  if (!alpacaApiKey || !alpacaApiSecret) {
    debug.error = 'No Alpaca API keys configured';
    return NextResponse.json(debug);
  }

  try {
    const ALPACA_TIMEFRAMES: Record<string, string> = {
      '1m': '1Min', '5m': '5Min', '15m': '15Min',
      '1H': '1Hour', '4H': '4Hour', '1D': '1Day', '1W': '1Week',
    };

    const alpacaTimeframe = ALPACA_TIMEFRAMES[interval] || '1Day';
    const now = new Date();
    const start = new Date(now.getTime() - days * 86400_000);
    const limit = Math.min(days * (interval === '1m' ? 390 : interval === '5m' ? 78 : interval === '15m' ? 26 : interval === '1H' ? 7 : 1), 10000);

    const url = `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol.toUpperCase())}/bars` +
      `?timeframe=${alpacaTimeframe}` +
      `&start=${start.toISOString()}` +
      `&end=${now.toISOString()}` +
      `&limit=${limit}` +
      `&adjustment=split`;

    debug.url = url;
    debug.alpacaTimeframe = alpacaTimeframe;

    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'APCA-API-KEY-ID': alpacaApiKey,
        'APCA-API-SECRET-KEY': alpacaApiSecret,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });

    debug.httpStatus = response.status;
    debug.fetchTimeMs = Date.now() - startTime;

    const data = await response.json();

    if (!response.ok) {
      debug.error = `HTTP ${response.status}`;
      debug.responseBody = data;
      return NextResponse.json(debug);
    }

    const bars = data.bars || [];
    debug.barCount = bars.length;
    debug.firstBar = bars[0] || null;
    debug.lastBar = bars[bars.length - 1] || null;

    if (bars.length > 0) {
      const lastBar = bars[bars.length - 1];
      const barAgeSeconds = Math.floor(Date.now() / 1000) - Math.floor(new Date(lastBar.t).getTime() / 1000);
      debug.lastBarAgeHours = (barAgeSeconds / 3600).toFixed(1);
      debug.isDataFresh = barAgeSeconds < 24 * 3600;
    }

    return NextResponse.json(debug);
  } catch (error) {
    debug.error = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(debug);
  }
}
