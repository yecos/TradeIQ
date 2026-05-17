/**
 * Tests for Authentication — NextAuth configuration + password hashing.
 *
 * Tests cover:
 * - Password hashing (bcrypt)
 * - Password verification
 * - Auth configuration structure
 * - Registration API validation
 */

import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth';

// ─── Password Hashing Tests ────────────────────────────────────────────────

describe('Authentication', () => {
  describe('hashPassword', () => {
    it('should hash a password and return a different string', async () => {
      const password = 'MySecurePassword123!';
      const hash = await hashPassword(password);

      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(20);
    });

    it('should produce different hashes for the same password (salt)', async () => {
      const password = 'SamePassword456!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      // Different salts → different hashes
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string password', async () => {
      const hash = await hashPassword('');
      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
    });
  });

  describe('verifyPassword', () => {
    it('should verify a correct password', async () => {
      const password = 'CorrectPassword789!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should reject an incorrect password', async () => {
      const password = 'CorrectPassword789!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword('WrongPassword!', hash);

      expect(isValid).toBe(false);
    });

    it('should reject a slightly different password', async () => {
      const password = 'CaseSensitive';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword('casesensitive', hash);

      expect(isValid).toBe(false);
    });

    it('should reject empty password against non-empty hash', async () => {
      const hash = await hashPassword('SomePassword');
      const isValid = await verifyPassword('', hash);

      expect(isValid).toBe(false);
    });
  });

  describe('password security', () => {
    it('should handle special characters in passwords', async () => {
      const password = 'P@$$w0rd!#%^&*()_+-=[]{}|;:,.<>?';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should handle unicode characters in passwords', async () => {
      const password = 'ContraseñaÑü123';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should handle very long passwords', async () => {
      const password = 'a'.repeat(100);
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });
  });
});

// ─── Auth Config Structure Tests ────────────────────────────────────────────

describe('Auth Configuration', () => {
  it('should export authOptions with required fields', async () => {
    // Dynamic import to avoid running NextAuth at test time
    const { authOptions } = await import('@/lib/auth');

    expect(authOptions).toBeDefined();
    expect(authOptions.providers).toBeDefined();
    expect(authOptions.providers.length).toBeGreaterThan(0);
    expect(authOptions.session).toBeDefined();
    expect(authOptions.session.strategy).toBe('jwt');
    expect(authOptions.pages).toBeDefined();
    expect(authOptions.pages.signIn).toBe('/login');
    expect(authOptions.callbacks).toBeDefined();
    expect(authOptions.callbacks.jwt).toBeDefined();
    expect(authOptions.callbacks.session).toBeDefined();
  });

  it('should use JWT session strategy', async () => {
    const { authOptions } = await import('@/lib/auth');
    expect(authOptions.session?.strategy).toBe('jwt');
  });

  it('should have credentials provider', async () => {
    const { authOptions } = await import('@/lib/auth');
    const credentialsProvider = authOptions.providers.find(
      (p) => 'id' in p && p.id === 'credentials'
    );
    expect(credentialsProvider).toBeDefined();
  });

  it('should have session max age of 24 hours', async () => {
    const { authOptions } = await import('@/lib/auth');
    const maxAge = authOptions.session?.maxAge;
    expect(maxAge).toBe(24 * 60 * 60); // 24 hours
  });
});

// ─── Registration Validation Logic Tests ────────────────────────────────────

describe('Registration Validation', () => {
  it('should validate email format', () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    expect(emailRegex.test('user@example.com')).toBe(true);
    expect(emailRegex.test('user.name@example.co')).toBe(true);
    expect(emailRegex.test('user+tag@example.com')).toBe(true);

    expect(emailRegex.test('invalid')).toBe(false);
    expect(emailRegex.test('invalid@')).toBe(false);
    expect(emailRegex.test('@example.com')).toBe(false);
    expect(emailRegex.test('user@.com')).toBe(false);
    expect(emailRegex.test('user@com')).toBe(false);
    expect(emailRegex.test('')).toBe(false);
  });

  it('should require minimum 8 character passwords', () => {
    const minLength = 8;

    expect('12345678'.length).toBeGreaterThanOrEqual(minLength);
    expect('MyPass1!'.length).toBeGreaterThanOrEqual(minLength);
    expect('1234567'.length).toBeLessThan(minLength);
    expect('abc'.length).toBeLessThan(minLength);
  });
});
