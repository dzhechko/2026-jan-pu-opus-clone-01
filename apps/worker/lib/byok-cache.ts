/**
 * BYOK Key Cache -- Server-side ephemeral storage in Redis
 *
 * Stores BYOK keys encrypted with PLATFORM_TOKEN_SECRET (AES-256-GCM).
 * TTL: 5 minutes -- auto-cleanup even if pipeline crashes.
 * Worker reads key, uses for API call, keys expire via TTL.
 *
 * SECURITY: Keys are encrypted at rest in Redis. Never logged.
 */

import { Redis } from 'ioredis';
import { encryptToken, decryptToken } from '@clipmaker/crypto';
import type { ByokProvider } from '@clipmaker/types';
import { createLogger } from './logger';

const logger = createLogger('byok-cache');

const BYOK_KEY_PREFIX = 'byok:';
const BYOK_TTL_SECONDS = 300; // 5 minutes

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new Redis(url, { maxRetriesPerRequest: 3 });
  }
  return redis;
}

function getServerSecret(): string {
  const secret = process.env.PLATFORM_TOKEN_SECRET;
  if (!secret || secret.length !== 64) {
    throw new Error('PLATFORM_TOKEN_SECRET must be 64 hex chars (32 bytes)');
  }
  return secret;
}

function redisKey(userId: string, provider: ByokProvider): string {
  return `${BYOK_KEY_PREFIX}${userId}:${provider}`;
}

/**
 * Cache a BYOK key in Redis, encrypted with server key.
 * Called by tRPC endpoint when user triggers video processing.
 */
export async function cacheByokKey(
  userId: string,
  provider: ByokProvider,
  plaintextKey: string,
): Promise<void> {
  const client = getRedis();
  const secret = getServerSecret();
  const encrypted = encryptToken(plaintextKey, secret);
  const key = redisKey(userId, provider);

  await client.set(key, encrypted, 'EX', BYOK_TTL_SECONDS);

  logger.info({ event: 'byok_key_cached', userId, provider, ttl: BYOK_TTL_SECONDS });
}

/**
 * Cache multiple BYOK keys at once (pipeline for efficiency).
 */
export async function cacheByokKeys(
  userId: string,
  keys: Partial<Record<ByokProvider, string>>,
): Promise<ByokProvider[]> {
  const client = getRedis();
  const secret = getServerSecret();
  const cached: ByokProvider[] = [];

  const pipeline = client.pipeline();
  for (const [provider, plaintextKey] of Object.entries(keys)) {
    if (!plaintextKey) continue;
    const encrypted = encryptToken(plaintextKey, secret);
    const key = redisKey(userId, provider as ByokProvider);
    pipeline.set(key, encrypted, 'EX', BYOK_TTL_SECONDS);
    cached.push(provider as ByokProvider);
  }

  await pipeline.exec();

  logger.info({ event: 'byok_keys_cached', userId, providers: cached, ttl: BYOK_TTL_SECONDS });
  return cached;
}

/**
 * Retrieve a BYOK key from Redis WITHOUT deleting it.
 * Used by workers that may need the key for multiple API calls in one pipeline.
 */
export async function peekByokKey(
  userId: string,
  provider: ByokProvider,
): Promise<string | null> {
  try {
    const client = getRedis();
    const key = redisKey(userId, provider);
    const encrypted = await client.get(key);

    if (!encrypted) {
      return null;
    }

    const secret = getServerSecret();
    const plaintext = decryptToken(encrypted, secret);

    logger.info({ event: 'byok_key_retrieved', userId, provider });
    return plaintext;
  } catch (error) {
    logger.warn({
      event: 'byok_key_retrieval_failed',
      userId,
      provider,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Clear all BYOK keys for a user from Redis.
 * Called after video processing pipeline completes.
 */
export async function clearByokKeys(userId: string): Promise<void> {
  const client = getRedis();
  const providers: ByokProvider[] = ['gemini', 'openai', 'anthropic'];

  const pipeline = client.pipeline();
  for (const provider of providers) {
    pipeline.del(redisKey(userId, provider));
  }
  await pipeline.exec();

  logger.info({ event: 'byok_keys_cleared', userId });
}

/**
 * Check if user has any BYOK keys cached in Redis.
 */
export async function hasByokKeys(userId: string): Promise<boolean> {
  const client = getRedis();
  const providers: ByokProvider[] = ['gemini', 'openai', 'anthropic'];

  for (const provider of providers) {
    const exists = await client.exists(redisKey(userId, provider));
    if (exists) return true;
  }
  return false;
}
