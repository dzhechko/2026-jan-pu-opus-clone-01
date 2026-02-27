import type { QueueName } from '@clipmaker/types';

export const QUEUE_NAMES = {
  STT: 'stt' as QueueName,
  LLM: 'llm' as QueueName,
  VIDEO_RENDER: 'video-render' as QueueName,
  PUBLISH: 'publish' as QueueName,
  STATS_COLLECT: 'stats-collect' as QueueName,
  BILLING_CRON: 'billing-cron' as QueueName,
  VIDEO_DOWNLOAD: 'video-download' as QueueName,
};

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};
