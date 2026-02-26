import Redis from 'ioredis';
import { getRedisConnection } from '@clipmaker/queue/src/queues';

let oauthRedis: Redis | null = null;

/**
 * Shared Redis client for OAuth state management (VK/Dzen callbacks + platform router).
 * Uses a singleton pattern to avoid connection leaks.
 */
export function getOAuthRedis(): Redis {
  if (!oauthRedis) {
    const conn = getRedisConnection();
    oauthRedis = new Redis({
      host: conn.host,
      port: conn.port,
      password: conn.password,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return oauthRedis;
}
