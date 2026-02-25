import { Queue } from 'bullmq';
import type { QueueName } from '@clipmaker/types';

const queues = new Map<string, Queue>();

export function getRedisConnection() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
  };
}

export function createQueue(name: QueueName): Queue {
  const existing = queues.get(name);
  if (existing) return existing;

  const queue = new Queue(name, {
    connection: getRedisConnection(),
  });

  queues.set(name, queue);
  return queue;
}

export function getQueue(name: QueueName): Queue {
  const queue = queues.get(name);
  if (!queue) {
    return createQueue(name);
  }
  return queue;
}
