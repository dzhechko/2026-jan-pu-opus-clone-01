export type PlatformPublishResult = {
  platformPostId: string;
  platformUrl: string;
};

export type PlatformStats = {
  views: number;
  likes: number;
  shares: number;
};

export abstract class PlatformProvider {
  abstract readonly platform: string;

  abstract publish(params: {
    filePath: string;
    title: string;
    description?: string;
    accessToken: string;
  }): Promise<PlatformPublishResult>;

  abstract getStats(params: {
    platformPostId: string;
    accessToken: string;
  }): Promise<PlatformStats>;
}
