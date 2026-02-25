import type { QueueName } from '@clipmaker/types';

export const QUEUE_NAMES: Record<string, QueueName> = {
  STT: 'stt',
  LLM: 'llm',
  VIDEO_RENDER: 'video-render',
  PUBLISH: 'publish',
  STATS_COLLECT: 'stats-collect',
} as const;

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};
