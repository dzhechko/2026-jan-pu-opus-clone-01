import { Worker } from 'bullmq';
import * as fs from 'node:fs';
import type { PublishJobData } from '@clipmaker/types';
import { QUEUE_NAMES } from '@clipmaker/queue';
import { getRedisConnection } from '@clipmaker/queue/src/queues';
import { prisma } from '@clipmaker/db';
import { decryptToken, encryptToken } from '@clipmaker/crypto';
import { getPlatformProvider } from '../lib/providers';
import { createLogger } from '../lib/logger';

const logger = createLogger('worker-publish');

/**
 * Attempts to refresh the Dzen (Yandex OAuth) access token using the stored refresh token.
 * Only Dzen uses refresh tokens — VK has offline scope (permanent), Rutube/Telegram tokens don't expire.
 *
 * @returns true if refresh succeeded and tokens were updated in DB
 */
async function tryRefreshToken(connectionId: string, platform: string): Promise<boolean> {
  if (platform !== 'dzen') {
    return false;
  }

  const clientId = process.env.YANDEX_CLIENT_ID;
  const clientSecret = process.env.YANDEX_CLIENT_SECRET;
  const tokenSecret = process.env.PLATFORM_TOKEN_SECRET!;

  if (!clientId || !clientSecret) {
    logger.warn({ event: 'refresh_token_missing_credentials', connectionId, platform });
    return false;
  }

  const connection = await prisma.platformConnection.findUnique({
    where: { id: connectionId },
  });

  if (!connection?.refreshTokenEncrypted) {
    logger.warn({ event: 'refresh_token_no_refresh_token', connectionId, platform });
    return false;
  }

  try {
    const refreshToken = decryptToken(connection.refreshTokenEncrypted, tokenSecret);

    const response = await fetch('https://oauth.yandex.ru/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({
        event: 'refresh_token_failed',
        connectionId,
        status: response.status,
        error: errorText,
      });
      return false;
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const newAccessTokenEncrypted = encryptToken(data.access_token, tokenSecret);
    const newRefreshTokenEncrypted = data.refresh_token
      ? encryptToken(data.refresh_token, tokenSecret)
      : connection.refreshTokenEncrypted;

    const expiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null;

    await prisma.platformConnection.update({
      where: { id: connectionId },
      data: {
        accessTokenEncrypted: newAccessTokenEncrypted,
        refreshTokenEncrypted: newRefreshTokenEncrypted,
        ...(expiresAt ? { expiresAt } : {}),
      },
    });

    logger.info({ event: 'refresh_token_success', connectionId, platform });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ event: 'refresh_token_error', connectionId, platform, error: message });
    return false;
  }
}

const worker = new Worker<PublishJobData>(
  QUEUE_NAMES.PUBLISH!,
  async (job) => {
    const { clipId, publicationId, platform, connectionId, filePath, title, description, metadata } = job.data;

    logger.info({ event: 'publish_start', publicationId, platform, clipId });

    // Step 1: Fetch publication; handle orphaned/already-processed
    const publication = await prisma.publication.findUnique({
      where: { id: publicationId },
    });

    if (!publication) {
      logger.warn({ event: 'publish_orphaned', publicationId });
      return;
    }

    if (publication.status === 'published' || publication.status === 'cancelled') {
      logger.info({ event: 'publish_idempotent_skip', publicationId, status: publication.status });
      return;
    }

    // Step 2: Update status to publishing
    await prisma.publication.update({
      where: { id: publicationId },
      data: { status: 'publishing' },
    });

    // Step 3: Fetch PlatformConnection
    const connection = await prisma.platformConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      logger.error({ event: 'publish_connection_deleted', publicationId, connectionId });
      await prisma.publication.update({
        where: { id: publicationId },
        data: { status: 'failed', errorMessage: 'Подключение удалено' },
      });
      return;
    }

    // Step 4: Decrypt token
    const tokenSecret = process.env.PLATFORM_TOKEN_SECRET!;
    let accessToken: string;
    try {
      accessToken = decryptToken(connection.accessTokenEncrypted, tokenSecret);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ event: 'publish_decrypt_failed', publicationId, error: message });
      await prisma.publication.update({
        where: { id: publicationId },
        data: { status: 'failed', errorMessage: 'Ошибка расшифровки токена' },
      });
      return;
    }

    // Step 5: Validate file exists
    if (!fs.existsSync(filePath)) {
      logger.error({ event: 'publish_file_missing', publicationId, filePath });
      await prisma.publication.update({
        where: { id: publicationId },
        data: { status: 'failed', errorMessage: 'Файл клипа не найден' },
      });
      // Don't throw — no point retrying if file doesn't exist
      return;
    }

    // Step 6: Publish via provider
    try {
      const provider = getPlatformProvider(platform);

      const result = await provider.publish({
        filePath,
        title,
        description,
        accessToken,
        metadata,
      });

      // Step 7: Success — update publication
      await prisma.publication.update({
        where: { id: publicationId },
        data: {
          status: 'published',
          platformPostId: result.platformPostId,
          platformUrl: result.platformUrl,
          publishedAt: new Date(),
        },
      });

      logger.info({
        event: 'publish_complete',
        publicationId,
        platform,
        platformPostId: result.platformPostId,
      });
    } catch (error) {
      // Step 8: Error handling
      const message = error instanceof Error ? error.message : String(error);

      logger.error({ event: 'publish_error', publicationId, platform, error: message });

      // Check for 401 on Dzen — attempt token refresh
      const is401 = message.includes('401') || message.toLowerCase().includes('unauthorized');
      if (is401 && platform === 'dzen') {
        logger.info({ event: 'publish_dzen_401_refresh_attempt', publicationId });
        const refreshed = await tryRefreshToken(connectionId, platform);

        if (refreshed) {
          // Token refreshed — throw to let BullMQ retry with new token
          logger.info({ event: 'publish_dzen_token_refreshed_retrying', publicationId });
          throw error;
        }
      }

      // Check if BullMQ will retry
      const maxAttempts = job.opts?.attempts ?? 3;
      if (job.attemptsMade < maxAttempts - 1) {
        // Not final attempt — throw so BullMQ retries
        throw error;
      }

      // Final failure — mark as failed with truncated error message
      const truncatedMessage = message.length > 500 ? message.slice(0, 500) : message;
      await prisma.publication.update({
        where: { id: publicationId },
        data: {
          status: 'failed',
          errorMessage: truncatedMessage,
        },
      });
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
  logger.error({
    event: 'publish_job_failed',
    jobId: job?.id,
    platform: job?.data?.platform,
    error: err.message,
  });
});

export default worker;
