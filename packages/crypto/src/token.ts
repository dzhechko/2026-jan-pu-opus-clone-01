import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts a plaintext token using AES-256-GCM.
 *
 * @param plaintext - The token string to encrypt
 * @param secretHex - 64 hex-char string representing 32-byte key (PLATFORM_TOKEN_SECRET)
 * @returns Encrypted string in format `iv:ciphertext:authTag` (all hex-encoded)
 */
export function encryptToken(plaintext: string, secretHex: string): string {
  const key = Buffer.from(secretHex, 'hex');

  if (key.length !== 32) {
    throw new Error('Secret must be 32 bytes (64 hex characters)');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
}

/**
 * Decrypts an AES-256-GCM encrypted token.
 *
 * @param encrypted - String in format `iv:ciphertext:authTag` (all hex-encoded)
 * @param secretHex - 64 hex-char string representing 32-byte key (PLATFORM_TOKEN_SECRET)
 * @returns The original plaintext token
 */
export function decryptToken(encrypted: string, secretHex: string): string {
  const key = Buffer.from(secretHex, 'hex');

  if (key.length !== 32) {
    throw new Error('Secret must be 32 bytes (64 hex characters)');
  }

  const parts = encrypted.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format — expected iv:ciphertext:authTag');
  }

  const ivHex = parts[0]!;
  const ciphertextHex = parts[1]!;
  const authTagHex = parts[2]!;

  const iv = Buffer.from(ivHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`);
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}`);
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
