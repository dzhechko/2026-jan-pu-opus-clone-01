import { TRPCError } from '@trpc/server';
import Redis from 'ioredis';

let redis: Redis | null = null;

try {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
} catch {
  // Redis unavailable at startup — rate limiting disabled (fail open)
}

/**
 * Check rate limit using Redis INCR + EXPIRE (atomic via pipeline).
 * Fails open if Redis is unavailable — better to allow traffic than crash the app.
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
  if (!redis) return; // Fail open

  const redisKey = `rate_limit:${scope}:${key}`;

  try {
    // Use pipeline to make INCR + EXPIRE atomic (sent in single roundtrip)
    const pipeline = redis.pipeline();
    pipeline.incr(redisKey);
    pipeline.expire(redisKey, windowSeconds);
    const results = await pipeline.exec();

    const current = (results?.[0]?.[1] as number) ?? 0;

    if (current > limit) {
      const ttl = await redis.ttl(redisKey);
      const retryAfter = ttl > 0 ? ttl : windowSeconds;

      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `Слишком много запросов. Повторите через ${retryAfter} сек.`,
        cause: { retryAfter },
      });
    }
  } catch (error) {
    // Re-throw rate limit errors
    if (error instanceof TRPCError) throw error;
    // Swallow Redis errors — fail open
  }
}
