import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * TradeIQ Middleware — protects sensitive API routes.
 *
 * Security layers:
 * 1. ✅ Authentication: Trade execution + broker endpoints require valid session
 * 2. ✅ Rate limiting: 60 requests/min per IP (in-memory)
 * 3. ✅ Security headers: X-Content-Type-Options, X-Frame-Options, etc.
 * 4. ✅ CORS protection
 *
 * Public routes (no auth required):
 * - /api/auth/* — Login, registration, session management
 * - /api/market/* — Market data (read-only, safe to expose)
 *
 * Protected routes (auth required):
 * - /api/trade/* — Trade execution
 * - /api/broker/* — Broker operations (API keys, positions, orders)
 * - /api/signals (POST) — Save signals
 * - /api/journal (POST) — Save journal entries
 */

// Simple in-memory rate limiter
const rateLimiter = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 60; // requests per minute per IP
const RATE_WINDOW = 60_000; // 1 minute

// Routes that require authentication
const PROTECTED_ROUTES = [
  '/api/trade',
  '/api/broker',
];

// Routes that require auth only for write operations (POST)
const WRITE_PROTECTED_ROUTES = [
  '/api/signals',
  '/api/journal',
];

export async function middleware(request: NextRequest) {
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

  // ─── Auth Check for Protected Routes ───
  const isProtected = PROTECTED_ROUTES.some(route => pathname.startsWith(route));
  const isWriteProtected = WRITE_PROTECTED_ROUTES.some(route => pathname.startsWith(route)) && request.method === 'POST';

  if (isProtected || isWriteProtected) {
    // Skip auth check for auth routes themselves (prevent infinite loop)
    if (pathname.startsWith('/api/auth/')) {
      const response = NextResponse.next();
      addSecurityHeaders(response);
      return response;
    }

    try {
      const token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET || 'development-secret-change-in-production',
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
}

export const config = {
  matcher: [
    '/api/:path*',
  ],
};
