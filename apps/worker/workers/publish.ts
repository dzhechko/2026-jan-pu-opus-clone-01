import { Worker } from 'bullmq';
import type { PublishJobData } from '@clipmaker/types';
import { QUEUE_NAMES } from '@clipmaker/queue';
import { getRedisConnection } from '@clipmaker/queue/src/queues';
import { prisma } from '@clipmaker/db';
import { getPlatformProvider } from '../lib/providers';
import { createLogger } from '../lib/logger';

const logger = createLogger('worker-publish');

const worker = new Worker<PublishJobData>(
  QUEUE_NAMES.PUBLISH,
  async (job) => {
    const { clipId, publicationId, platform, accessTokenEncrypted, filePath, title, description } = job.data;

    logger.info({ event: 'publish_start', publicationId, platform, clipId });

    await prisma.publication.update({
      where: { id: publicationId },
      data: { status: 'publishing' },
    });

    try {
      const provider = getPlatformProvider(platform);

      // TODO: Decrypt access token before passing to provider
      const result = await provider.publish({
        filePath,
        title,
        description,
        accessToken: accessTokenEncrypted,
      });

      await prisma.publication.update({
        where: { id: publicationId },
        data: {
          status: 'published',
          publishedAt: new Date(),
          platformPostId: result.platformPostId,
          platformUrl: result.platformUrl,
        },
      });

      logger.info({
        event: 'publish_complete',
        publicationId,
        platform,
        platformPostId: result.platformPostId,
      });
    } catch (error) {
      logger.error({ event: 'publish_error', publicationId, platform, error });
      await prisma.publication.update({
        where: { id: publicationId },
        data: { status: 'failed' },
      });
      throw error;
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
    limiter: {
      max: 2,
      duration: 1000, // 2 req/sec to avoid platform rate limits
    },
  },
);

worker.on('failed', (job, err) => {
  logger.error({ event: 'publish_job_failed', jobId: job?.id, platform: job?.data?.platform, error: err.message });
});

export default worker;
