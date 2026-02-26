export type PlatformPublishParams = {
  filePath: string;
  title: string;
  description?: string;
  accessToken: string;
  metadata?: Record<string, unknown>;
};

export type PlatformPublishResult = {
  platformPostId: string;
  platformUrl: string;
};

export type PlatformStats = {
  views: number;
  likes: number | null;
  shares: number | null;
};

export type TestConnectionResult = {
  valid: boolean;
  accountName: string;
};

export abstract class PlatformProvider {
  abstract readonly platform: string;

  abstract publish(params: PlatformPublishParams): Promise<PlatformPublishResult>;

  abstract getStats(params: {
    platformPostId: string;
    accessToken: string;
  }): Promise<PlatformStats | null>;

  abstract testConnection(accessToken: string): Promise<TestConnectionResult>;
}
