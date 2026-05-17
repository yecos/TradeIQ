/**
 * NextAuth API Route Handler.
 *
 * Handles all authentication requests:
 * - POST /api/auth/signin — Login
 * - POST /api/auth/signout — Logout
 * - GET /api/auth/session — Get current session
 * - GET /api/auth/csrf — CSRF token for forms
 */
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
