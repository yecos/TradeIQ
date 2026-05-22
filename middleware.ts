import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * TradeIQ Middleware — protects sensitive API routes.
 *
 * Security layers:
 * 1. Authentication: Trade execution + broker + analysis endpoints require valid session
 * 2. Rate limiting: 60 requests/min per IP (in-memory)
 * 3. Security headers: HSTS, CSP, X-Content-Type-Options, X-Frame-Options, etc.
 * 4. CORS protection
 *
 * Public routes (no auth required):
 * - /api/auth/* — Login, registration, session management
 * - /api/market/* — Market data (read-only, safe to expose)
 * - /api/health — Health check
 *
 * Protected routes (auth required):
 * - /api/trade/* — Trade execution
 * - /api/broker/* — Broker operations (API keys, positions, orders)
 * - /api/analyze — Multi-vector analysis (costs API credits)
 * - /api/ai-analysis — AI analysis endpoint
 * - /api/ai-trades/* — AI trade tracker
 * - /api/backtest — Backtesting engine
 *
 * Write-protected routes (auth required for POST):
 * - /api/signals (POST) — Save signals
 * - /api/journal (POST) — Save journal entries
 * - /api/alerts (POST) — Create alerts
 * - /api/watchlist (POST) — Modify watchlist
 */

// Simple in-memory rate limiter
const rateLimiter = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 60; // requests per minute per IP
const RATE_WINDOW = 60_000; // 1 minute

// Routes that require authentication for ALL methods
const PROTECTED_ROUTES = [
  '/api/trade',
  '/api/broker',
  '/api/analyze',
  '/api/ai-analysis',
  '/api/ai-trades',
  '/api/backtest',
];

// Routes that require auth only for write operations (POST, PUT, DELETE, PATCH)
const WRITE_PROTECTED_ROUTES = [
  '/api/signals',
  '/api/journal',
  '/api/alerts',
  '/api/watchlist',
];

// Content Security Policy — strict but allows necessary resources
const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-inline/eval needed for Next.js
  "style-src 'self' 'unsafe-inline'", // unsafe-inline needed for Tailwind
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.binance.com https://stream.binance.com:9443 wss://stream.binance.com:9443 https://api.alpaca.markets https://data.alpaca.markets wss://stream.data.alpaca.markets https://finnhub.io https://api.polygon.io https://api.coingecko.com https://pro-api.coingecko.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply to API routes
  if (!pathname.startsWith('/api/')) {
    const response = NextResponse.next();
    addSecurityHeaders(response);
    return response;
  }

  // ─── Rate Limiting ───
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
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

  // Periodic cleanup of stale rate limiter entries (prevent memory leak)
  if (rateLimiter.size > 10000) {
    const cutoff = now - RATE_WINDOW;
    for (const [key, val] of rateLimiter.entries()) {
      if (val.resetTime < cutoff) rateLimiter.delete(key);
    }
  }

  // ─── Auth Check for Protected Routes ───
  const isProtected = PROTECTED_ROUTES.some(route => pathname.startsWith(route));
  const isWriteMethod = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method);
  const isWriteProtected = WRITE_PROTECTED_ROUTES.some(route => pathname.startsWith(route)) && isWriteMethod;

  if (isProtected || isWriteProtected) {
    // Skip auth check for auth routes themselves (prevent infinite loop)
    if (pathname.startsWith('/api/auth/')) {
      const response = NextResponse.next();
      addSecurityHeaders(response);
      return response;
    }

    try {
      const nextAuthSecret = process.env.NEXTAUTH_SECRET;
      if (!nextAuthSecret) {
        console.error('[TradeIQ] CRITICAL: NEXTAUTH_SECRET not set — cannot verify auth tokens');
        return NextResponse.json(
          { error: 'Error de configuración del servidor. Contacta al administrador.' },
          { status: 500 }
        );
      }

      const token = await getToken({
        req: request,
        secret: nextAuthSecret,
      });

      if (!token) {
        return NextResponse.json(
          { error: 'Autenticación requerida. Inicia sesión para continuar.' },
          { status: 401 }
        );
      }

      // Add user ID to request headers for downstream API routes
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-user-id', token.sub || '');

      const response = NextResponse.next({
        request: { headers: requestHeaders },
      });

      addSecurityHeaders(response);
      return response;
    } catch {
      return NextResponse.json(
        { error: 'Error de autenticación. Intenta de nuevo.' },
        { status: 401 }
      );
    }
  }

  // ─── Trade endpoint method protection ───
  if (pathname.startsWith('/api/trade') && request.method !== 'POST') {
    if (request.method === 'GET') {
      const response = NextResponse.json({ status: 'ok', endpoint: pathname });
      addSecurityHeaders(response);
      return response;
    }
  }

  // ─── Security Headers ───
  const response = NextResponse.next();
  addSecurityHeaders(response);
  return response;
}

function addSecurityHeaders(response: NextResponse): void {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // HSTS — force HTTPS (1 year, include subdomains)
  // Only set in production to avoid issues with localhost dev
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Content Security Policy
  response.headers.set('Content-Security-Policy', CSP_POLICY);

  // Permissions Policy — restrict browser features
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // Cross-Origin headers
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
}

export const config = {
  matcher: [
    '/api/:path*',
  ],
};
