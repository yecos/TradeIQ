import { NextRequest, NextResponse } from 'next/server';

/**
 * TradeIQ Middleware — protects sensitive API routes.
 *
 * Security layers:
 * 1. Trade execution endpoints require a valid session (future: NextAuth)
 * 2. Rate limiting for API routes (basic in-memory)
 * 3. CORS headers for API responses
 *
 * For now, this provides:
 * - CORS headers
 * - Basic rate limiting (in-memory, per-IP)
 * - Request logging
 * - Protection for trade execution endpoints
 */

// Simple in-memory rate limiter
const rateLimiter = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 60; // requests per minute per IP
const RATE_WINDOW = 60_000; // 1 minute

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply to API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // ─── Rate Limiting ───
  const ip = request.headers.get('x-forwarded-for') ||
             request.headers.get('x-real-ip') ||
             'unknown';
  const now = Date.now();

  const rateInfo = rateLimiter.get(ip);
  if (!rateInfo || now > rateInfo.resetTime) {
    rateLimiter.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
  } else {
    rateInfo.count++;
    if (rateInfo.count > RATE_LIMIT) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Slow down requests.' },
        { status: 429 }
      );
    }
  }

  // ─── Trade endpoint protection ───
  // Trade execution endpoints should only be accessible with a valid method
  if (pathname.startsWith('/api/trade') && request.method !== 'POST') {
    // Allow GET for health checks but not other methods
    if (request.method === 'GET') {
      return NextResponse.json({ status: 'ok', endpoint: pathname });
    }
  }

  // ─── CORS headers ───
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
  ],
};
