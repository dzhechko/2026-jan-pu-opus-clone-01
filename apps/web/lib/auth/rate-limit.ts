import { TRPCError } from '@trpc/server';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL environment variable is not set');
}

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

/**
 * Check rate limit using Redis INCR + conditional EXPIRE pattern.
 * Throws TRPCError with code TOO_MANY_REQUESTS if limit exceeded.
 *
 * @param scope - Rate limit scope (e.g., "auth:login", "upload")
 * @param key - Unique identifier (e.g., user ID, IP address)
 * @param limit - Maximum number of requests in the window
 * @param windowSeconds - Time window in seconds
 */
export async function checkRateLimit(
  scope: string,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const redisKey = `rate_limit:${scope}:${key}`;

  const current = await redis.incr(redisKey);

  if (current === 1) {
    await redis.expire(redisKey, windowSeconds);
  }

  if (current > limit) {
    const ttl = await redis.ttl(redisKey);
    const retryAfter = ttl > 0 ? ttl : windowSeconds;

    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `Слишком много запросов. Повторите через ${retryAfter} сек.`,
      cause: { retryAfter },
    });
  }
}
