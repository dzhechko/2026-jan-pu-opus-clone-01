export type QueueName = 'stt' | 'llm' | 'video-render' | 'publish' | 'stats-collect';

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
  format: '9:16' | '1:1' | '16:9';
  subtitleSegments: Array<{ start: number; end: number; text: string }>;
  cta?: { text: string; position: 'end' | 'overlay'; duration: number };
  watermark: boolean;
};

export type PublishJobData = {
  clipId: string;
  publicationId: string;
  platform: 'vk' | 'rutube' | 'dzen' | 'telegram';
  accessTokenEncrypted: string;
  filePath: string;
  title: string;
  description?: string;
};

export type StatsCollectJobData = {
  publicationId: string;
  platform: 'vk' | 'rutube' | 'dzen' | 'telegram';
  platformPostId: string;
};
