import { PlatformProvider } from './base';
import type { PlatformPublishResult, PlatformStats } from './base';
import { createLogger } from '../logger';

const logger = createLogger('provider-dzen');

export class DzenProvider extends PlatformProvider {
  readonly platform = 'dzen';

  async publish(params: {
    filePath: string;
    title: string;
    description?: string;
    accessToken: string;
  }): Promise<PlatformPublishResult> {
    logger.info({ event: 'dzen_publish_start', title: params.title });

    // TODO: Implement Dzen API upload
    return {
      platformPostId: 'dzen_placeholder_id',
      platformUrl: 'https://dzen.ru/video/placeholder',
    };
  }

  async getStats(params: {
    platformPostId: string;
    accessToken: string;
  }): Promise<PlatformStats> {
    logger.info({ event: 'dzen_stats_fetch', postId: params.platformPostId });
    return { views: 0, likes: 0, shares: 0 };
  }
}
