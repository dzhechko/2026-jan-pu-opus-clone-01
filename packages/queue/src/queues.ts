import { Queue, type Job } from 'bullmq';
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

/**
 * Cancel all BullMQ jobs for a given videoId across specified queues.
 * - Waiting/delayed jobs: removed from queue
 * - Active jobs: moved to failed state so worker stops retrying
 * Returns total number of cancelled jobs.
 */
export async function cancelJobsByVideoId(
  videoId: string,
  queueNames: QueueName[],
): Promise<number> {
  let cancelled = 0;

  for (const name of queueNames) {
    const queue = getQueue(name);
    const jobs: Job[] = await queue.getJobs(['waiting', 'delayed', 'active']);

    for (const job of jobs) {
      if (job.data?.videoId !== videoId) continue;

      const state = await job.getState();
      if (state === 'waiting' || state === 'delayed') {
        await job.remove();
        cancelled++;
      } else if (state === 'active') {
        await job.moveToFailed(new Error('Остановлено пользователем'), '0', false);
        cancelled++;
      }
    }
  }

  return cancelled;
}
