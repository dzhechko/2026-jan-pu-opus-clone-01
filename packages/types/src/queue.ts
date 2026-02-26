export type QueueName = 'stt' | 'llm' | 'video-render' | 'publish' | 'stats-collect' | 'billing-cron' | 'video-download';

export type STTJobData = {
  videoId: string;
  filePath: string;
  strategy: 'ru' | 'global';
  language: string;
};

export type LLMJobData = {
  videoId: string;
  task: 'moment_selection' | 'virality_scoring' | 'title_generation' | 'cta_suggestion';
  strategy: 'ru' | 'global';
  input: Record<string, unknown>;
  tier?: number;
};

export type VideoRenderJobData = {
  clipId: string;
  videoId: string;
  sourceFilePath: string;
  startTime: number;
  endTime: number;
  format: 'portrait' | 'square' | 'landscape';
  subtitleSegments: Array<{ start: number; end: number; text: string }>;
  cta?: { text: string; position: 'end' | 'overlay'; duration: number };
  watermark: boolean;
};

export type PublishJobData = {
  clipId: string;
  publicationId: string;
  platform: 'vk' | 'rutube' | 'dzen' | 'telegram';
  connectionId: string;
  filePath: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

export type StatsCollectJobData = {
  publicationId: string;
  platform: 'vk' | 'rutube' | 'dzen' | 'telegram';
  platformPostId: string;
  connectionId: string;
};

export type VideoDownloadJobData = {
  videoId: string;
  url: string;
  userId: string;
  strategy: 'ru' | 'global';
};
