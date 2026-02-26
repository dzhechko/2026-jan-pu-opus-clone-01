import * as fs from 'node:fs';
import { PlatformProvider } from './base';
import type {
  PlatformPublishParams,
  PlatformPublishResult,
  PlatformStats,
  TestConnectionResult,
} from './base';
import { createLogger } from '../logger';

const logger = createLogger('provider-dzen');

const DZEN_API_BASE = 'https://dzen.ru/api/v1';
const MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024; // 4 GB
const UPLOAD_TIMEOUT = 600_000; // 10 min
const POLL_INTERVAL = 3_000; // 3 seconds
const MAX_POLL_ATTEMPTS = 60; // 3 minutes max polling

type DzenDraftResponse = {
  id: string;
  upload_url: string;
};

type DzenPublishResponse = {
  id: string;
  url: string;
  status: string;
};

type DzenVideoInfoResponse = {
  id: string;
  title: string;
  url: string;
  status: string;
  statistics?: {
    views: number;
    likes: number;
    shares: number;
  };
};

type DzenPublisherResponse = {
  id: string;
  name: string;
  url: string;
};

function dzenHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `OAuth ${accessToken}`,
  };
}

export class DzenProvider extends PlatformProvider {
  readonly platform = 'dzen';

  async publish(params: PlatformPublishParams): Promise<PlatformPublishResult> {
    const { filePath, title, description, accessToken } = params;

    logger.info({ event: 'dzen_publish_start', title });

    // Validate file exists and check size
    const stat = await fs.promises.stat(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      throw new Error(
        `File size ${stat.size} bytes exceeds Dzen limit of ${MAX_FILE_SIZE} bytes (4 GB)`,
      );
    }

    // Step 1: Create video draft
    logger.info({ event: 'dzen_create_draft', title });

    const draftBody: Record<string, unknown> = {
      title,
      description: description ?? '',
      type: 'short_video',
    };

    const draftResponse = await fetch(`${DZEN_API_BASE}/publisher/videos/drafts`, {
      method: 'POST',
      headers: {
        ...dzenHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(draftBody),
    });

    if (!draftResponse.ok) {
      const errorText = await draftResponse.text();
      throw new Error(
        `Dzen create draft failed: ${draftResponse.status} ${draftResponse.statusText} — ${errorText}`,
      );
    }

    const draftResult = (await draftResponse.json()) as DzenDraftResponse;

    logger.info({
      event: 'dzen_draft_created',
      draftId: draftResult.id,
    });

    // Step 2: Upload file to the upload URL
    logger.info({ event: 'dzen_upload_start', fileSize: stat.size });

    const fileBuffer = await fs.promises.readFile(filePath);
    const fileBlob = new Blob([fileBuffer]);

    const uploadForm = new FormData();
    uploadForm.append('file', fileBlob, 'video.mp4');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT);

    try {
      const uploadResponse = await fetch(draftResult.upload_url, {
        method: 'PUT',
        headers: dzenHeaders(accessToken),
        body: uploadForm,
        signal: controller.signal,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(
          `Dzen upload failed: ${uploadResponse.status} ${uploadResponse.statusText} — ${errorText}`,
        );
      }

      logger.info({ event: 'dzen_upload_success', draftId: draftResult.id });
    } finally {
      clearTimeout(timeout);
    }

    // Step 3: Publish the draft
    logger.info({ event: 'dzen_publish_draft', draftId: draftResult.id });

    const publishResponse = await fetch(
      `${DZEN_API_BASE}/publisher/videos/drafts/${draftResult.id}/publish`,
      {
        method: 'POST',
        headers: {
          ...dzenHeaders(accessToken),
          'Content-Type': 'application/json',
        },
      },
    );

    if (!publishResponse.ok) {
      const errorText = await publishResponse.text();
      throw new Error(
        `Dzen publish failed: ${publishResponse.status} ${publishResponse.statusText} — ${errorText}`,
      );
    }

    const publishResult = (await publishResponse.json()) as DzenPublishResponse;

    logger.info({
      event: 'dzen_publish_success',
      videoId: publishResult.id,
      url: publishResult.url,
    });

    // Step 4: Poll for video to become available
    let videoUrl = publishResult.url || `https://dzen.ru/video/watch/${publishResult.id}`;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

      try {
        const infoResponse = await fetch(
          `${DZEN_API_BASE}/publisher/videos/${publishResult.id}`,
          { headers: dzenHeaders(accessToken) },
        );

        if (infoResponse.ok) {
          const info = (await infoResponse.json()) as DzenVideoInfoResponse;
          if (info.status === 'published' || info.status === 'ready') {
            videoUrl = info.url || videoUrl;
            logger.info({
              event: 'dzen_video_ready',
              videoId: publishResult.id,
              videoUrl,
            });
            break;
          }
        }
      } catch {
        logger.warn({
          event: 'dzen_poll_error',
          attempt,
          videoId: publishResult.id,
        });
      }
    }

    const platformPostId = publishResult.id;

    logger.info({ event: 'dzen_publish_complete', platformPostId, platformUrl: videoUrl });

    return { platformPostId, platformUrl: videoUrl };
  }

  async getStats(params: {
    platformPostId: string;
    accessToken: string;
  }): Promise<PlatformStats | null> {
    const { platformPostId, accessToken } = params;

    logger.info({ event: 'dzen_stats_fetch', postId: platformPostId });

    const response = await fetch(
      `${DZEN_API_BASE}/publisher/videos/${platformPostId}`,
      { headers: dzenHeaders(accessToken) },
    );

    if (!response.ok) {
      if (response.status === 404) {
        logger.warn({ event: 'dzen_stats_not_found', postId: platformPostId });
        return null;
      }
      throw new Error(
        `Dzen stats fetch failed: ${response.status} ${response.statusText}`,
      );
    }

    const info = (await response.json()) as DzenVideoInfoResponse;

    if (!info.statistics) {
      logger.warn({ event: 'dzen_stats_no_statistics', postId: platformPostId });
      return { views: 0, likes: null, shares: null };
    }

    const stats: PlatformStats = {
      views: info.statistics.views ?? 0,
      likes: info.statistics.likes ?? null,
      shares: info.statistics.shares ?? null,
    };

    logger.info({ event: 'dzen_stats_success', postId: platformPostId, stats });

    return stats;
  }

  async testConnection(accessToken: string): Promise<TestConnectionResult> {
    logger.info({ event: 'dzen_test_connection' });

    try {
      const response = await fetch(
        `${DZEN_API_BASE}/publisher`,
        { headers: dzenHeaders(accessToken) },
      );

      if (!response.ok) {
        logger.error({
          event: 'dzen_test_connection_failed',
          status: response.status,
        });
        return { valid: false, accountName: '' };
      }

      const data = (await response.json()) as DzenPublisherResponse;

      logger.info({
        event: 'dzen_test_connection_success',
        name: data.name,
      });

      return { valid: true, accountName: data.name };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ event: 'dzen_test_connection_failed', error: message });
      return { valid: false, accountName: '' };
    }
  }
}
