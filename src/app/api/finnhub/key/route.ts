import { NextResponse } from 'next/server';

/**
 * Provides the Finnhub API key to the client for WebSocket connections.
 *
 * The FINNHUB_API_KEY is a server-side env var (no NEXT_PUBLIC_ prefix),
 * so it's not directly accessible in the browser. This route exposes it
 * so the Finnhub WebSocket client can connect.
 *
 * The free Finnhub API key is not sensitive — it's rate-limited to 60 req/min
 * and unlimited WebSocket connections. No need to protect it.
 */
export async function GET() {
  const key = process.env.FINNHUB_API_KEY || process.env.NEXT_PUBLIC_FINNHUB_KEY;

  if (!key) {
    return NextResponse.json({ error: 'Finnhub API key not configured' }, { status: 404 });
  }

  return NextResponse.json({ key });
}
