import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * AES-256-GCM Encryption for API keys and secrets.
 *
 * Uses:
 * - AES-256-GCM (authenticated encryption — tamper-proof)
 * - Scrypt key derivation (resists brute force)
 * - Random IV per encryption (same plaintext → different ciphertext)
 * - Authentication tag (detects tampering)
 *
 * The encryption key is derived from ENCRYPTION_KEY env variable via scrypt.
 * If ENCRYPTION_KEY is not set, falls back to a dev-only key (NOT for production).
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits for GCM
const TAG_LENGTH = 16; // 128 bits authentication tag
const KEY_LENGTH = 32; // 256 bits for AES-256
const SALT_LENGTH = 32;

/**
 * Get or create the encryption key.
 * In production, ENCRYPTION_KEY must be set in environment.
 * In development, a fixed key is used (NOT secure for production).
 */
function getEncryptionKey(salt: Buffer): Buffer {
  const passphrase = process.env.ENCRYPTION_KEY || 'tradeiq-dev-key-change-in-production';
  return scryptSync(passphrase, salt, KEY_LENGTH);
}

/**
 * Encrypt a plaintext string (e.g., API key or secret).
 *
 * Returns a base64 string containing: salt + iv + tag + ciphertext
 * This is safe to store in a database.
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return '';

  const salt = randomBytes(SALT_LENGTH);
  const key = getEncryptionKey(salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  // Concatenate: salt + iv + tag + ciphertext
  const result = Buffer.concat([salt, iv, tag, encrypted]);

  return result.toString('base64');
}

/**
 * Decrypt a previously encrypted string.
 *
 * @throws Error if decryption fails (wrong key, tampered data, etc.)
 */
export function decrypt(encryptedBase64: string): string {
  if (!encryptedBase64) return '';

  try {
    const buffer = Buffer.from(encryptedBase64, 'base64');

    // Extract components
    const salt = buffer.subarray(0, SALT_LENGTH);
    const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = buffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const ciphertext = buffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    const key = getEncryptionKey(salt);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : 'unknown error'}. ` +
      'Ensure ENCRYPTION_KEY matches the key used for encryption.'
    );
  }
}

/**
 * Check if a value looks like an encrypted string (base64 encoded with our format).
 * This is a heuristic check — not cryptographically guaranteed.
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  try {
    const buffer = Buffer.from(value, 'base64');
    // Our format: salt(32) + iv(16) + tag(16) + ciphertext(>=1) = minimum 65 bytes
    return buffer.length >= SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 1;
  } catch {
    return false;
  }
}

/**
 * Generate a secure random string (useful for generating API tokens, session IDs, etc.)
 */
export function generateSecureToken(bytes: number = 32): string {
  return randomBytes(bytes).toString('hex');
}
