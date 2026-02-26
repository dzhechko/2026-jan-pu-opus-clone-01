import * as fs from 'node:fs';
import { PlatformProvider } from './base';
import type {
  PlatformPublishParams,
  PlatformPublishResult,
  PlatformStats,
  TestConnectionResult,
} from './base';
import { createLogger } from '../logger';

const logger = createLogger('provider-rutube');

const RUTUBE_API_BASE = 'https://rutube.ru/api';
const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10 GB
const UPLOAD_TIMEOUT = 900_000; // 15 min
const POLL_INTERVAL = 3_000; // 3 seconds
const MAX_POLL_ATTEMPTS = 60; // 3 minutes max polling

type RutubeVideoCreateResponse = {
  id: string;
  video_id: string;
  upload_url: string;
  video_url: string;
};

type RutubeVideoInfoResponse = {
  id: string;
  video_id: string;
  title: string;
  hits: number;
  video_url: string;
  publication_ts?: string;
};

type RutubeVideoListResponse = {
  count: number;
  results: RutubeVideoInfoResponse[];
};

function rutubeHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Token ${accessToken}`,
  };
}

export class RutubeProvider extends PlatformProvider {
  readonly platform = 'rutube';

  async publish(params: PlatformPublishParams): Promise<PlatformPublishResult> {
    const { filePath, title, description, accessToken } = params;

    logger.info({ event: 'rutube_publish_start', title });

    // Validate file exists and check size
    const stat = await fs.promises.stat(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      throw new Error(
        `File size ${stat.size} bytes exceeds Rutube limit of ${MAX_FILE_SIZE} bytes (10 GB)`,
      );
    }

    // Step 1: Create video entry
    logger.info({ event: 'rutube_create_entry', title });

    const createBody: Record<string, unknown> = {
      title,
      description: description ?? '',
      is_short: true,
      category: 13, // Default category: Entertainment
    };

    const createResponse = await fetch(`${RUTUBE_API_BASE}/video/`, {
      method: 'POST',
      headers: {
        ...rutubeHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createBody),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(
        `Rutube create video failed: ${createResponse.status} ${createResponse.statusText} — ${errorText}`,
      );
    }

    const createResult = (await createResponse.json()) as RutubeVideoCreateResponse;

    logger.info({
      event: 'rutube_create_success',
      videoId: createResult.video_id,
      uploadUrl: createResult.upload_url,
    });

    // Step 2: Upload file to the upload URL via PUT
    logger.info({ event: 'rutube_upload_start', fileSize: stat.size });

    const fileBuffer = await fs.promises.readFile(filePath);
    const fileBlob = new Blob([fileBuffer]);

    const uploadForm = new FormData();
    uploadForm.append('file', fileBlob, 'video.mp4');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT);

    try {
      const uploadResponse = await fetch(createResult.upload_url, {
        method: 'PUT',
        headers: rutubeHeaders(accessToken),
        body: uploadForm,
        signal: controller.signal,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(
          `Rutube upload failed: ${uploadResponse.status} ${uploadResponse.statusText} — ${errorText}`,
        );
      }

      logger.info({ event: 'rutube_upload_success', videoId: createResult.video_id });
    } finally {
      clearTimeout(timeout);
    }

    // Step 3: Poll for publication (Rutube processes video asynchronously)
    logger.info({ event: 'rutube_poll_publication', videoId: createResult.video_id });

    let videoUrl = createResult.video_url || `https://rutube.ru/video/${createResult.video_id}/`;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

      try {
        const infoResponse = await fetch(
          `${RUTUBE_API_BASE}/video/${createResult.video_id}/`,
          { headers: rutubeHeaders(accessToken) },
        );

        if (infoResponse.ok) {
          const info = (await infoResponse.json()) as RutubeVideoInfoResponse;
          if (info.publication_ts) {
            videoUrl = info.video_url || videoUrl;
            logger.info({
              event: 'rutube_published',
              videoId: createResult.video_id,
              videoUrl,
            });
            break;
          }
        }
      } catch {
        logger.warn({
          event: 'rutube_poll_error',
          attempt,
          videoId: createResult.video_id,
        });
      }
    }

    const platformPostId = createResult.video_id || createResult.id;

    logger.info({ event: 'rutube_publish_complete', platformPostId, platformUrl: videoUrl });

    return { platformPostId, platformUrl: videoUrl };
  }

  async getStats(params: {
    platformPostId: string;
    accessToken: string;
  }): Promise<PlatformStats | null> {
    const { platformPostId, accessToken } = params;

    logger.info({ event: 'rutube_stats_fetch', postId: platformPostId });

    const response = await fetch(
      `${RUTUBE_API_BASE}/video/${platformPostId}/`,
      { headers: rutubeHeaders(accessToken) },
    );

    if (!response.ok) {
      if (response.status === 404) {
        logger.warn({ event: 'rutube_stats_not_found', postId: platformPostId });
        return null;
      }
      throw new Error(
        `Rutube stats fetch failed: ${response.status} ${response.statusText}`,
      );
    }

    const info = (await response.json()) as RutubeVideoInfoResponse;

    const stats: PlatformStats = {
      views: info.hits ?? 0,
      likes: null,
      shares: null,
    };

    logger.info({ event: 'rutube_stats_success', postId: platformPostId, stats });

    return stats;
  }

  async testConnection(accessToken: string): Promise<TestConnectionResult> {
    logger.info({ event: 'rutube_test_connection' });

    try {
      const response = await fetch(
        `${RUTUBE_API_BASE}/video/?mine=true&limit=1`,
        { headers: rutubeHeaders(accessToken) },
      );

      if (!response.ok) {
        logger.error({
          event: 'rutube_test_connection_failed',
          status: response.status,
        });
        return { valid: false, accountName: '' };
      }

      const data = (await response.json()) as RutubeVideoListResponse;

      logger.info({
        event: 'rutube_test_connection_success',
        videoCount: data.count,
      });

      // Rutube API doesn't return user name in video list; use a generic label
      return { valid: true, accountName: `Rutube (${data.count} videos)` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ event: 'rutube_test_connection_failed', error: message });
      return { valid: false, accountName: '' };
    }
  }
}
