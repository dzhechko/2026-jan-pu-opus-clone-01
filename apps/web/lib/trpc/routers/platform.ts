import { z } from 'zod';
import { randomUUID } from 'crypto';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { PLANS } from '@clipmaker/types';
import type { PlanId } from '@clipmaker/types';
import { encryptToken, decryptToken } from '@clipmaker/crypto';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { createQueue, QUEUE_NAMES } from '@clipmaker/queue';
import { getOAuthRedis } from '@/lib/redis';

const PLATFORM_ENUM = z.enum(['vk', 'rutube', 'dzen', 'telegram']);
type Platform = z.infer<typeof PLATFORM_ENUM>;

const OAUTH_PLATFORMS: Platform[] = ['vk', 'dzen'];
const TOKEN_PLATFORMS: Platform[] = ['rutube', 'telegram'];

const OAUTH_STATE_TTL = 300; // 5 minutes
const FETCH_TIMEOUT = 15_000; // 15 seconds

function getTokenSecret(): string {
  const secret = process.env.PLATFORM_TOKEN_SECRET;
  if (!secret) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Конфигурация сервера: отсутствует PLATFORM_TOKEN_SECRET',
    });
  }
  return secret;
}

/**
 * Validate a Rutube token by calling the Rutube API.
 */
async function validateRutubeToken(token: string): Promise<string> {
  const res = await fetch('https://rutube.ru/api/video/?mine=true&limit=1', {
    headers: { Authorization: `Token ${token}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  if (!res.ok) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Недействительный токен Rutube',
    });
  }

  return 'Rutube Account';
}

/**
 * Validate a Telegram bot token and optional channel ID.
 */
async function validateTelegramToken(
  token: string,
  channelId?: string,
): Promise<string> {
  const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!meRes.ok) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Недействительный токен Telegram бота',
    });
  }

  const meData = (await meRes.json()) as {
    ok: boolean;
    result?: { username?: string; first_name?: string };
  };
  if (!meData.ok || !meData.result) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Недействительный токен Telegram бота',
    });
  }

  if (channelId) {
    const chatRes = await fetch(
      `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(channelId)}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT) },
    );
    if (!chatRes.ok) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Бот не имеет доступа к указанному каналу',
      });
    }
    const chatData = (await chatRes.json()) as {
      ok: boolean;
      result?: { title?: string };
    };
    if (!chatData.ok) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Бот не имеет доступа к указанному каналу',
      });
    }
  }

  const botName =
    meData.result.username ?? meData.result.first_name ?? 'Telegram Bot';
  return botName;
}

export const platformRouter = router({
  /**
   * Connect a platform — OAuth redirect for VK/Dzen, direct token for Rutube/Telegram.
   */
  connect: protectedProcedure
    .input(
      z.object({
        platform: PLATFORM_ENUM,
        token: z.string().min(1).max(2048).optional(),
        channelId: z.string().min(1).max(256).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      await checkRateLimit('platform:connect', userId, 5, 3600);

      // Check plan allows this platform
      const user = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { planId: true },
      });

      const plan = PLANS[user.planId as PlanId];
      if (!plan || !plan.autoPostPlatforms.includes(input.platform)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Платформа ${input.platform} недоступна на вашем тарифе. Обновите тариф для подключения`,
        });
      }

      // OAuth platforms: VK, Dzen
      if (OAUTH_PLATFORMS.includes(input.platform)) {
        const state = randomUUID();
        const redis = getOAuthRedis();
        await redis.set(
          `oauth:${input.platform}:${state}`,
          userId,
          'EX',
          OAUTH_STATE_TTL,
        );

        let redirectUrl: string;

        if (input.platform === 'vk') {
          const clientId = process.env.VK_PUBLISH_CLIENT_ID;
          const redirectUri = process.env.VK_PUBLISH_REDIRECT_URI;
          if (!clientId || !redirectUri) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Конфигурация VK OAuth не настроена',
            });
          }
          redirectUrl =
            `https://oauth.vk.com/authorize?client_id=${clientId}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&scope=video,wall,offline&response_type=code&state=${state}&v=5.199`;
        } else {
          // dzen (Yandex OAuth)
          const clientId = process.env.YANDEX_CLIENT_ID;
          const redirectUri = process.env.YANDEX_REDIRECT_URI;
          if (!clientId || !redirectUri) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Конфигурация Yandex/Дзен OAuth не настроена',
            });
          }
          redirectUrl =
            `https://oauth.yandex.ru/authorize?client_id=${clientId}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&response_type=code&state=${state}&scope=zen:write+zen:read`;
        }

        return { redirectUrl };
      }

      // Token platforms: Rutube, Telegram
      if (TOKEN_PLATFORMS.includes(input.platform)) {
        if (!input.token) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Токен обязателен для подключения этой платформы',
          });
        }

        const secret = getTokenSecret();
        let accountName: string;

        if (input.platform === 'rutube') {
          accountName = await validateRutubeToken(input.token);
        } else {
          accountName = await validateTelegramToken(
            input.token,
            input.channelId,
          );
        }

        const encryptedToken = encryptToken(input.token, secret);

        await ctx.prisma.platformConnection.upsert({
          where: {
            userId_platform: {
              userId,
              platform: input.platform,
            },
          },
          create: {
            userId,
            platform: input.platform,
            accessTokenEncrypted: encryptedToken,
            metadata: {
              name: accountName,
              ...(input.channelId ? { channelId: input.channelId } : {}),
            },
          },
          update: {
            accessTokenEncrypted: encryptedToken,
            expiresAt: null,
            metadata: {
              name: accountName,
              ...(input.channelId ? { channelId: input.channelId } : {}),
            },
          },
        });

        return { connected: true, accountName };
      }

      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Неизвестная платформа',
      });
    }),

  /**
   * List all platform connections for the current user (no tokens exposed).
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const connections = await ctx.prisma.platformConnection.findMany({
      where: { userId: ctx.session.user.id },
      select: {
        id: true,
        platform: true,
        metadata: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return connections;
  }),

  /**
   * Disconnect a platform — cancel pending publications & remove connection.
   */
  disconnect: protectedProcedure
    .input(z.object({ platform: PLATFORM_ENUM }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const connection = await ctx.prisma.platformConnection.findUnique({
        where: {
          userId_platform: {
            userId,
            platform: input.platform,
          },
        },
      });

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Подключение к ${input.platform} не найдено`,
        });
      }

      // Find all scheduled/publishing publications for this user + platform
      const pendingPublications = await ctx.prisma.publication.findMany({
        where: {
          platform: input.platform,
          status: { in: ['scheduled', 'publishing'] },
          clip: { userId },
        },
        select: { id: true },
      });

      if (pendingPublications.length > 0) {
        const pubIds = pendingPublications.map((p) => p.id);

        // Cancel publications in DB
        await ctx.prisma.publication.updateMany({
          where: { id: { in: pubIds } },
          data: {
            status: 'cancelled',
            errorMessage: 'Платформа отключена',
          },
        });

        // Remove BullMQ jobs for cancelled publications
        try {
          const publishQueue = createQueue(QUEUE_NAMES.PUBLISH!);
          for (const pubId of pubIds) {
            const job = await publishQueue.getJob(`pub-${pubId}`);
            if (job) {
              await job.remove();
            }
          }
        } catch {
          // Non-critical: jobs may already be completed or removed
        }
      }

      // Delete the platform connection
      await ctx.prisma.platformConnection.delete({
        where: { id: connection.id },
      });

      return { disconnected: true };
    }),

  /**
   * Test an existing platform connection by calling the platform API.
   */
  testConnection: protectedProcedure
    .input(z.object({ platform: PLATFORM_ENUM }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const connection = await ctx.prisma.platformConnection.findUnique({
        where: {
          userId_platform: {
            userId,
            platform: input.platform,
          },
        },
      });

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Подключение к ${input.platform} не найдено`,
        });
      }

      const secret = getTokenSecret();
      const token = decryptToken(connection.accessTokenEncrypted, secret);

      try {
        if (input.platform === 'vk') {
          const res = await fetch(
            'https://api.vk.com/method/users.get',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                access_token: token,
                v: '5.199',
              }),
              signal: AbortSignal.timeout(FETCH_TIMEOUT),
            },
          );
          const data = (await res.json()) as {
            response?: Array<{ first_name?: string; last_name?: string }>;
            error?: { error_msg?: string };
          };

          if (data.error || !data.response?.[0]) {
            await ctx.prisma.platformConnection.update({
              where: { id: connection.id },
              data: { expiresAt: new Date() },
            });
            return {
              valid: false,
              message: data.error?.error_msg ?? 'Токен VK недействителен',
            };
          }

          const user = data.response[0];
          return {
            valid: true,
            accountName: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim(),
          };
        }

        if (input.platform === 'rutube') {
          const res = await fetch(
            'https://rutube.ru/api/video/?mine=true&limit=1',
            {
              headers: { Authorization: `Token ${token}` },
              signal: AbortSignal.timeout(FETCH_TIMEOUT),
            },
          );

          if (!res.ok) {
            await ctx.prisma.platformConnection.update({
              where: { id: connection.id },
              data: { expiresAt: new Date() },
            });
            return { valid: false, message: 'Токен Rutube недействителен' };
          }

          return { valid: true, accountName: 'Rutube Account' };
        }

        if (input.platform === 'dzen') {
          const res = await fetch(
            'https://zen.yandex.ru/media-api/v3/publisher',
            {
              headers: { Authorization: `OAuth ${token}` },
              signal: AbortSignal.timeout(FETCH_TIMEOUT),
            },
          );

          if (!res.ok) {
            await ctx.prisma.platformConnection.update({
              where: { id: connection.id },
              data: { expiresAt: new Date() },
            });
            return { valid: false, message: 'Токен Дзен недействителен' };
          }

          const data = (await res.json()) as {
            publisher?: { title?: string };
          };
          return {
            valid: true,
            accountName: data.publisher?.title ?? 'Дзен канал',
          };
        }

        if (input.platform === 'telegram') {
          const res = await fetch(
            `https://api.telegram.org/bot${token}/getMe`,
            { signal: AbortSignal.timeout(FETCH_TIMEOUT) },
          );
          const data = (await res.json()) as {
            ok: boolean;
            result?: { username?: string; first_name?: string };
          };

          if (!data.ok || !data.result) {
            await ctx.prisma.platformConnection.update({
              where: { id: connection.id },
              data: { expiresAt: new Date() },
            });
            return {
              valid: false,
              message: 'Токен Telegram бота недействителен',
            };
          }

          return {
            valid: true,
            accountName:
              data.result.username ??
              data.result.first_name ??
              'Telegram Bot',
          };
        }

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Неизвестная платформа',
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        await ctx.prisma.platformConnection.update({
          where: { id: connection.id },
          data: { expiresAt: new Date() },
        });
        return {
          valid: false,
          message: 'Не удалось проверить подключение. Попробуйте позже',
        };
      }
    }),
});
