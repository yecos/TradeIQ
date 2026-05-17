/**
 * NextAuth Configuration — Authentication for TradeIQ.
 *
 * Strategy: Credentials provider (email + password) with bcrypt hashing.
 *
 * Why credentials instead of OAuth?
 * - Trading platforms need strong email/password authentication
 * - Google/GitHub OAuth can be added later as additional providers
 * - Self-contained — no dependency on external OAuth servers
 * - Works with any deployment (Vercel, Docker, self-hosted)
 *
 * Security measures:
 * - bcrypt password hashing (12 salt rounds)
 * - NEXTAUTH_SECRET for JWT signing (must be set in production)
 * - Session expires after 24h
 * - Trade execution endpoints require valid session
 * - Rate limiting on login attempts (via middleware)
 *
 * For production:
 * - Set NEXTAUTH_SECRET env variable (use: openssl rand -base64 32)
 * - Set NEXTAUTH_URL to your domain
 * - Consider adding 2FA (TOTP) for real-money trading
 * - Consider adding Google/GitHub OAuth for convenience
 */

import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma';

// Constants
const SALT_ROUNDS = 12;
const SESSION_MAX_AGE = 24 * 60 * 60; // 24 hours

/**
 * Hash a password using bcrypt.
 * Used when creating or updating a user's password.
 */
export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash.
 * Used during login to check credentials.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return compare(password, hash);
}

/**
 * NextAuth configuration options.
 *
 * IMPORTANT: This uses the Credentials provider, which means:
 * - JWT sessions (not database sessions) — faster, no DB lookup on each request
 * - The user's ID and email are stored in the JWT
 * - The JWT is signed with NEXTAUTH_SECRET
 */
export const authOptions: NextAuthOptions = {
  // PrismaAdapter handles user/account creation in the database
  // Note: Credentials provider doesn't use the adapter for session management,
  // but we use it for user creation/lookup
  // Wrapped in try-catch for environments where DB is not available (e.g., Vercel without DB)
  adapter: (() => {
    try {
      return PrismaAdapter(prisma);
    } catch {
      console.warn('[TradeIQ] PrismaAdapter init failed — running without DB adapter');
      return undefined;
    }
  })(),

  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'tu@email.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email y contraseña son requeridos');
        }

        try {
          // Look up user in database
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
          });

          if (!user || !user.hashedPassword) {
            // Don't reveal whether the email exists (security best practice)
            throw new Error('Credenciales inválidas');
          }

          // Verify password
          const isValid = await verifyPassword(credentials.password, user.hashedPassword);
          if (!isValid) {
            throw new Error('Credenciales inválidas');
          }

          // Return user object (stored in JWT)
          return {
            id: user.id,
            email: user.email,
            name: user.name,
          };
        } catch (error) {
          // If DB is not available, re-throw auth errors but don't crash
          if (error instanceof Error && error.message === 'Credenciales inválidas') {
            throw error;
          }
          // DB connection error — allow demo access in development
          console.warn('[TradeIQ] Auth DB lookup failed:', error instanceof Error ? error.message : error);
          throw new Error('Servicio de autenticación no disponible. Intenta más tarde.');
        }
      },
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE,
  },

  jwt: {
    maxAge: SESSION_MAX_AGE,
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  callbacks: {
    async jwt({ token, user }) {
      // On first sign in, add the user ID to the token
      if (user) {
        token.id = user.id;
        token.sub = user.id;
      }
      return token;
    },

    async session({ session, token }) {
      // Add user ID to the session object
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      // After login, redirect to the dashboard
      if (url.startsWith(baseUrl)) return url;
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      return baseUrl;
    },
  },

  // Enable debug in development
  debug: process.env.NODE_ENV === 'development',
};

/**
 * Type augmentation for NextAuth.
 * Adds `id` to the User and Session types.
 */
declare module 'next-auth' {
  interface User {
    id: string;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    sub: string;
  }
}
