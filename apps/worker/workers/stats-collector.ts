import { Worker } from 'bullmq';
import type { StatsCollectJobData } from '@clipmaker/types';
import { QUEUE_NAMES } from '@clipmaker/queue';
import { getRedisConnection } from '@clipmaker/queue/src/queues';
import { prisma } from '@clipmaker/db';
import { decryptToken } from '@clipmaker/crypto';
import { getPlatformProvider } from '../lib/providers';
import { createLogger } from '../lib/logger';

const logger = createLogger('worker-stats');

const worker = new Worker<StatsCollectJobData>(
  QUEUE_NAMES.STATS_COLLECT,
  async (job) => {
    const { publicationId, platform, platformPostId, connectionId } = job.data;

    logger.info({ event: 'stats_collect_start', publicationId, platform });

    // Fetch publication to verify it still exists and is published
    const publication = await prisma.publication.findUnique({
      where: { id: publicationId },
    });

    if (!publication) {
      logger.warn({ event: 'stats_publication_not_found', publicationId });
      return;
    }

    if (publication.status !== 'published') {
      logger.info({ event: 'stats_skip_not_published', publicationId, status: publication.status });
      return;
    }

    // Fetch PlatformConnection by connectionId
    const connection = await prisma.platformConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      logger.warn({ event: 'stats_no_connection', publicationId, platform, connectionId });
      return;
    }

    // Decrypt the access token
    const tokenSecret = process.env.PLATFORM_TOKEN_SECRET!;
    let accessToken: string;
    try {
      accessToken = decryptToken(connection.accessTokenEncrypted, tokenSecret);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ event: 'stats_decrypt_failed', publicationId, connectionId, error: message });
      return;
    }

    const provider = getPlatformProvider(platform);

    // getStats may return null (e.g., Telegram doesn't support stats)
    const stats = await provider.getStats({
      platformPostId,
      accessToken,
    });

    if (!stats) {
      logger.info({ event: 'stats_not_supported', publicationId, platform });
      return;
    }

    // Handle nullable likes/shares — only update if non-null
    await prisma.publication.update({
      where: { id: publicationId },
      data: {
        views: stats.views,
        ...(stats.likes !== null && stats.likes !== undefined ? { likes: stats.likes } : {}),
        ...(stats.shares !== null && stats.shares !== undefined ? { shares: stats.shares } : {}),
        lastStatsSync: new Date(),
      },
    });

    logger.info({ event: 'stats_collect_complete', publicationId, platform, ...stats });
  },
  {
    connection: getRedisConnection(),
    concurrency: 5,
  },
);

worker.on('failed', (job, err) => {
  logger.error({ event: 'stats_job_failed', jobId: job?.id, error: err.message });
});

export default worker;
