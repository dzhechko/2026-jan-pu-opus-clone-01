import * as fs from 'node:fs';
import { PlatformProvider } from './base';
import type {
  PlatformPublishParams,
  PlatformPublishResult,
  PlatformStats,
  TestConnectionResult,
} from './base';
import { createLogger } from '../logger';

const logger = createLogger('provider-vk');

const VK_API_BASE = 'https://api.vk.com/method';
const VK_API_VERSION = '5.199';
const MAX_FILE_SIZE = 256 * 1024 * 1024; // 256 MB
const UPLOAD_TIMEOUT = 600_000; // 10 min

type VKApiResponse<T> = {
  response?: T;
  error?: {
    error_code: number;
    error_msg: string;
  };
};

type VKVideoSaveResponse = {
  upload_url: string;
  video_id: number;
  owner_id: number;
  access_key: string;
};

type VKVideoItem = {
  id: number;
  owner_id: number;
  views: number;
  likes?: { count: number };
  reposts?: { count: number };
};

type VKVideoGetResponse = {
  count: number;
  items: VKVideoItem[];
};

type VKUserItem = {
  id: number;
  first_name: string;
  last_name: string;
};

async function vkApiCall<T>(
  method: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  const body = new URLSearchParams({
    ...params,
    v: VK_API_VERSION,
  });

  const response = await fetch(`${VK_API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal,
  });

  if (!response.ok) {
    throw new Error(`VK API HTTP error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as VKApiResponse<T>;

  if (data.error) {
    throw new Error(
      `VK API error ${data.error.error_code}: ${data.error.error_msg}`,
    );
  }

  if (data.response === undefined) {
    throw new Error('VK API returned empty response');
  }

  return data.response;
}

export class VKProvider extends PlatformProvider {
  readonly platform = 'vk';

  async publish(params: PlatformPublishParams): Promise<PlatformPublishResult> {
    const { filePath, title, description, accessToken } = params;

    logger.info({ event: 'vk_publish_start', title });

    // Validate file exists and check size
    const stat = await fs.promises.stat(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      throw new Error(
        `File size ${stat.size} bytes exceeds VK limit of ${MAX_FILE_SIZE} bytes (256 MB)`,
      );
    }

    // Step 1: Call video.save to get upload URL
    logger.info({ event: 'vk_video_save', title });

    const saveParams: Record<string, string> = {
      access_token: accessToken,
      name: title,
      is_short: '1',
    };

    if (description) {
      saveParams.description = description;
    }

    const saveResult = await vkApiCall<VKVideoSaveResponse>('video.save', saveParams);

    logger.info({
      event: 'vk_video_save_success',
      videoId: saveResult.video_id,
      ownerId: saveResult.owner_id,
    });

    // Step 2: Upload file to the returned upload_url
    logger.info({ event: 'vk_upload_start', fileSize: stat.size });

    const fileBuffer = await fs.promises.readFile(filePath);
    const fileBlob = new Blob([fileBuffer]);

    const uploadForm = new FormData();
    uploadForm.append('video_file', fileBlob, 'video.mp4');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT);

    try {
      const uploadResponse = await fetch(saveResult.upload_url, {
        method: 'POST',
        body: uploadForm,
        signal: controller.signal,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(
          `VK upload failed: ${uploadResponse.status} ${uploadResponse.statusText} — ${errorText}`,
        );
      }

      logger.info({ event: 'vk_upload_success', videoId: saveResult.video_id });
    } finally {
      clearTimeout(timeout);
    }

    const platformPostId = `${saveResult.owner_id}_${saveResult.video_id}`;
    const platformUrl = `https://vk.com/clip${platformPostId}`;

    logger.info({ event: 'vk_publish_complete', platformPostId, platformUrl });

    return { platformPostId, platformUrl };
  }

  async getStats(params: {
    platformPostId: string;
    accessToken: string;
  }): Promise<PlatformStats | null> {
    const { platformPostId, accessToken } = params;

    logger.info({ event: 'vk_stats_fetch', postId: platformPostId });

    const result = await vkApiCall<VKVideoGetResponse>('video.get', {
      access_token: accessToken,
      videos: platformPostId,
    });

    if (!result.items || result.items.length === 0) {
      logger.warn({ event: 'vk_stats_not_found', postId: platformPostId });
      return null;
    }

    const video = result.items[0];
    if (!video) {
      logger.warn({ event: 'vk_stats_empty_item', postId: platformPostId });
      return null;
    }

    const stats: PlatformStats = {
      views: video.views ?? 0,
      likes: video.likes?.count ?? null,
      shares: video.reposts?.count ?? null,
    };

    logger.info({ event: 'vk_stats_success', postId: platformPostId, stats });

    return stats;
  }

  async testConnection(accessToken: string): Promise<TestConnectionResult> {
    logger.info({ event: 'vk_test_connection' });

    try {
      const users = await vkApiCall<VKUserItem[]>('users.get', {
        access_token: accessToken,
      });

      if (!users || users.length === 0) {
        return { valid: false, accountName: '' };
      }

      const user = users[0];
      if (!user) {
        return { valid: false, accountName: '' };
      }
      const accountName = `${user.first_name} ${user.last_name}`;

      logger.info({ event: 'vk_test_connection_success', accountName });

      return { valid: true, accountName };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ event: 'vk_test_connection_failed', error: message });
      return { valid: false, accountName: '' };
    }
  }
}
