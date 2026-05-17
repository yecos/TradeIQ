import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, isEncrypted, generateSecureToken } from '@/lib/crypto';

describe('Crypto', () => {
  // ─── Encrypt / Decrypt ───

  describe('encrypt + decrypt', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const original = 'PKABC123XYZ456';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(original);
    });

    it('should produce different ciphertext each time (random IV)', () => {
      const original = 'same-input';
      const encrypted1 = encrypt(original);
      const encrypted2 = encrypt(original);

      // Different encrypted outputs for same input (due to random salt + IV)
      expect(encrypted1).not.toBe(encrypted2);

      // But both decrypt correctly
      expect(decrypt(encrypted1)).toBe(original);
      expect(decrypt(encrypted2)).toBe(original);
    });

    it('should handle empty string', () => {
      expect(encrypt('')).toBe('');
      expect(decrypt('')).toBe('');
    });

    it('should handle long strings (API keys can be long)', () => {
      const longKey = 'A'.repeat(200);
      const encrypted = encrypt(longKey);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(longKey);
    });

    it('should handle special characters', () => {
      const special = 'key-with_special.chars!@#$%^&*()123';
      const encrypted = encrypt(special);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(special);
    });

    it('should throw on tampered ciphertext', () => {
      const encrypted = encrypt('secret');
      // Tamper with the base64 string
      const tampered = encrypted.slice(0, -5) + 'XXXXX';

      expect(() => decrypt(tampered)).toThrow('Decryption failed');
    });

    it('should throw on invalid base64', () => {
      expect(() => decrypt('not-valid-base64!!!')).toThrow();
    });
  });

  // ─── isEncrypted ───

  describe('isEncrypted', () => {
    it('should return true for encrypted values', () => {
      const encrypted = encrypt('test');
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for plain text', () => {
      expect(isEncrypted('PKABC123')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isEncrypted('')).toBe(false);
    });

    it('should return false for short base64', () => {
      // Short base64 that doesn't meet minimum length
      expect(isEncrypted('aGVsbG8=')).toBe(false);
    });
  });

  // ─── generateSecureToken ───

  describe('generateSecureToken', () => {
    it('should generate a hex string', () => {
      const token = generateSecureToken();
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate 64 hex chars for 32 bytes', () => {
      const token = generateSecureToken(32);
      expect(token.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('should generate unique tokens', () => {
      const token1 = generateSecureToken();
      const token2 = generateSecureToken();
      expect(token1).not.toBe(token2);
    });

    it('should respect custom byte length', () => {
      const token = generateSecureToken(16);
      expect(token.length).toBe(32); // 16 bytes = 32 hex chars
    });
  });
});
