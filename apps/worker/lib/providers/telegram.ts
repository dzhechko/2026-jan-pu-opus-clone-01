import * as fs from 'node:fs';
import { openAsBlob } from 'node:fs';
import { PlatformProvider } from './base';
import type {
  PlatformPublishParams,
  PlatformPublishResult,
  PlatformStats,
  TestConnectionResult,
} from './base';
import { createLogger } from '../logger';

const logger = createLogger('provider-telegram');

const TG_API_BASE = 'https://api.telegram.org';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const UPLOAD_TIMEOUT = 300_000; // 5 min
const MAX_CAPTION_LENGTH = 1024;

type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

type TelegramMessage = {
  message_id: number;
  chat: {
    id: number;
    title?: string;
    username?: string;
    type: string;
  };
};

type TelegramBotInfo = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
};

function buildTgUrl(accessToken: string, method: string): string {
  return `${TG_API_BASE}/bot${accessToken}/${method}`;
}

function buildCaption(title: string, description?: string): string {
  let caption = title;
  if (description) {
    caption = `${title}\n\n${description}`;
  }
  if (caption.length > MAX_CAPTION_LENGTH) {
    caption = caption.slice(0, MAX_CAPTION_LENGTH - 3) + '...';
  }
  return caption;
}

function resolveChannelId(channelId: string): string {
  // If it's already a numeric ID (private channel), use as-is
  if (/^-?\d+$/.test(channelId)) {
    return channelId;
  }
  // If it's a @username, use as-is (Telegram API accepts it)
  if (channelId.startsWith('@')) {
    return channelId;
  }
  // Otherwise, prepend @ for public channels
  return `@${channelId}`;
}

function buildPublicUrl(channelId: string, messageId: number): string {
  // For public channels with @username
  if (channelId.startsWith('@')) {
    return `https://t.me/${channelId.slice(1)}/${messageId}`;
  }
  // For channels passed as plain username (without @)
  if (!/^-?\d+$/.test(channelId)) {
    return `https://t.me/${channelId}/${messageId}`;
  }
  // For private channels (numeric IDs like -100xxx), use c/ format
  // Remove the -100 prefix for the URL
  const numericId = channelId.replace(/^-100/, '');
  return `https://t.me/c/${numericId}/${messageId}`;
}

export class TelegramProvider extends PlatformProvider {
  readonly platform = 'telegram';

  async publish(params: PlatformPublishParams): Promise<PlatformPublishResult> {
    const { filePath, title, description, accessToken, metadata } = params;

    logger.info({ event: 'telegram_publish_start', title });

    // Validate channelId is provided
    const channelId = metadata?.channelId;
    if (!channelId || typeof channelId !== 'string') {
      throw new Error(
        'Telegram provider requires metadata.channelId (e.g., "@mychannel" or "-100123456789")',
      );
    }

    // Validate file exists and check size
    const stat = await fs.promises.stat(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      throw new Error(
        `File size ${stat.size} bytes exceeds Telegram limit of ${MAX_FILE_SIZE} bytes (50 MB)`,
      );
    }

    // Build caption
    const caption = buildCaption(title, description);
    const resolvedChatId = resolveChannelId(channelId);

    logger.info({
      event: 'telegram_upload_start',
      chatId: resolvedChatId,
      fileSize: stat.size,
    });

    // Upload video via sendVideo
    // Stream file from disk (avoids loading entire file into memory)
    const fileBlob = await openAsBlob(filePath);

    const form = new FormData();
    form.append('chat_id', resolvedChatId);
    form.append('video', fileBlob, 'video.mp4');
    form.append('caption', caption);
    form.append('supports_streaming', 'true');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT);

    try {
      const response = await fetch(buildTgUrl(accessToken, 'sendVideo'), {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Telegram sendVideo HTTP error: ${response.status} ${response.statusText} — ${errorText}`,
        );
      }

      const data = (await response.json()) as TelegramResponse<TelegramMessage>;

      if (!data.ok || !data.result) {
        throw new Error(
          `Telegram API error: ${data.error_code ?? 'unknown'} — ${data.description ?? 'no description'}`,
        );
      }

      const message = data.result;
      const platformPostId = `${message.chat.id}_${message.message_id}`;
      const platformUrl = buildPublicUrl(channelId, message.message_id);

      logger.info({
        event: 'telegram_publish_complete',
        platformPostId,
        platformUrl,
        chatId: message.chat.id,
        messageId: message.message_id,
      });

      return { platformPostId, platformUrl };
    } finally {
      clearTimeout(timeout);
    }
  }

  async getStats(_params: {
    platformPostId: string;
    accessToken: string;
  }): Promise<PlatformStats | null> {
    // Telegram Bot API does not provide video statistics
    logger.info({
      event: 'telegram_stats_not_supported',
      postId: _params.platformPostId,
    });
    return null;
  }

  async testConnection(accessToken: string): Promise<TestConnectionResult> {
    logger.info({ event: 'telegram_test_connection' });

    try {
      const response = await fetch(buildTgUrl(accessToken, 'getMe'), {
        method: 'GET',
      });

      if (!response.ok) {
        logger.error({
          event: 'telegram_test_connection_failed',
          status: response.status,
        });
        return { valid: false, accountName: '' };
      }

      const data = (await response.json()) as TelegramResponse<TelegramBotInfo>;

      if (!data.ok || !data.result) {
        logger.error({
          event: 'telegram_test_connection_failed',
          error: data.description,
        });
        return { valid: false, accountName: '' };
      }

      const bot = data.result;
      const accountName = `@${bot.username} (${bot.first_name})`;

      logger.info({ event: 'telegram_test_connection_success', accountName });

      return { valid: true, accountName };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ event: 'telegram_test_connection_failed', error: message });
      return { valid: false, accountName: '' };
    }
  }
}
