import { Worker } from 'bullmq';
import type { StatsCollectJobData } from '@clipmaker/types';
import { QUEUE_NAMES } from '@clipmaker/queue';
import { getRedisConnection } from '@clipmaker/queue/src/queues';
import { prisma } from '@clipmaker/db';
import { getPlatformProvider } from '../lib/providers';
import { createLogger } from '../lib/logger';

const logger = createLogger('worker-stats');

const worker = new Worker<StatsCollectJobData>(
  QUEUE_NAMES.STATS_COLLECT,
  async (job) => {
    const { publicationId, platform, platformPostId } = job.data;

    logger.info({ event: 'stats_collect_start', publicationId, platform });

    const publication = await prisma.publication.findUnique({
      where: { id: publicationId },
      include: {
        clip: {
          include: {
            user: {
              include: {
                platformConnections: {
                  where: { platform: platform as 'vk' | 'rutube' | 'dzen' | 'telegram' },
                },
              },
            },
          },
        },
      },
    });

    if (!publication?.clip?.user?.platformConnections?.[0]) {
      logger.warn({ event: 'stats_no_connection', publicationId, platform });
      return;
    }

    const accessToken = publication.clip.user.platformConnections[0].accessTokenEncrypted;
    const provider = getPlatformProvider(platform);

    // TODO: Decrypt token
    const stats = await provider.getStats({
      platformPostId,
      accessToken,
    });

    if (!stats) {
      logger.info({ event: 'stats_not_supported', publicationId, platform });
      return;
    }

    await prisma.publication.update({
      where: { id: publicationId },
      data: {
        views: stats.views,
        ...(stats.likes !== null && { likes: stats.likes }),
        ...(stats.shares !== null && { shares: stats.shares }),
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
