import * as fs from 'node:fs';
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { generateDownloadUrl } from '@clipmaker/s3';
import { QUEUE_NAMES, DEFAULT_JOB_OPTIONS } from '@clipmaker/queue';
import { createQueue } from '@clipmaker/queue/src/queues';
import { PLANS } from '@clipmaker/types';
import type { PlanId, PublishJobData } from '@clipmaker/types';

// M5: Select only safe fields to avoid exposing internal paths
const CLIP_PUBLIC_SELECT = {
  id: true,
  videoId: true,
  userId: true,
  title: true,
  description: true,
  startTime: true,
  endTime: true,
  duration: true,
  viralityScore: true,
  format: true,
  subtitleSegments: true,
  cta: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  publications: {
    select: {
      id: true,
      platform: true,
      status: true,
      scheduledAt: true,
      publishedAt: true,
      platformUrl: true,
      views: true,
      likes: true,
      shares: true,
      errorMessage: true,
    },
  },
} as const;

/** Max file size per platform (bytes) */
const PLATFORM_FILE_SIZE_LIMITS: Record<string, number> = {
  vk: 256 * 1024 * 1024,       // 256 MB
  rutube: 10 * 1024 * 1024 * 1024, // 10 GB
  dzen: 4 * 1024 * 1024 * 1024,    // 4 GB
  telegram: 50 * 1024 * 1024,      // 50 MB
};

const PLATFORM_SIZE_LABELS: Record<string, string> = {
  vk: '256 МБ',
  rutube: '10 ГБ',
  dzen: '4 ГБ',
  telegram: '50 МБ',
};

export const clipRouter = router({
  getByVideo: protectedProcedure
    .input(z.object({ videoId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const video = await ctx.prisma.video.findFirst({
        where: { id: input.videoId, userId: ctx.session.user.id },
      });

      if (!video) throw new TRPCError({ code: 'NOT_FOUND', message: 'Видео не найдено' });

      const clips = await ctx.prisma.clip.findMany({
        where: { videoId: input.videoId },
        select: CLIP_PUBLIC_SELECT,
        take: 50,
      });

      // Sort by viralityScore.total descending (Prisma doesn't support JSON path ordering)
      const sorted = clips.sort((a, b) => {
        const scoreA = (a.viralityScore as { total?: number })?.total ?? 0;
        const scoreB = (b.viralityScore as { total?: number })?.total ?? 0;
        return scoreB - scoreA;
      });

      return { clips: sorted, videoStatus: video.status };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const clip = await ctx.prisma.clip.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        select: CLIP_PUBLIC_SELECT,
      });

      if (!clip) throw new TRPCError({ code: 'NOT_FOUND', message: 'Клип не найден' });
      return clip;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(255).optional(),
        startTime: z.number().nonnegative().optional(),
        endTime: z.number().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await checkRateLimit('clip:update', userId, 30, 60);

      const clip = await ctx.prisma.clip.findFirst({
        where: { id: input.id, userId },
      });

      if (!clip) throw new TRPCError({ code: 'NOT_FOUND' });
      if (clip.status === 'rendering') {
        throw new TRPCError({ code: 'CONFLICT', message: 'Клип рендерится, подождите' });
      }

      const updateData: Record<string, unknown> = {};
      if (input.title) updateData.title = input.title;
      if (input.startTime !== undefined) updateData.startTime = input.startTime;
      if (input.endTime !== undefined) {
        updateData.endTime = input.endTime;
        updateData.duration = input.endTime - (input.startTime ?? clip.startTime);
      }

      // C6: Only set rendering if we need to re-render (time changed)
      const needsRerender = input.startTime !== undefined || input.endTime !== undefined;

      const updated = await ctx.prisma.clip.update({
        where: { id: input.id },
        data: {
          ...updateData,
          ...(needsRerender ? { status: 'rendering' as const } : {}),
        },
        select: CLIP_PUBLIC_SELECT,
      });

      // C6: Enqueue render job when time changes require re-render
      if (needsRerender) {
        const fullClip = await ctx.prisma.clip.findUnique({
          where: { id: input.id },
          include: { video: true },
        });
        if (fullClip?.video) {
          const renderQueue = createQueue(QUEUE_NAMES.VIDEO_RENDER!);
          await renderQueue.add('render', {
            clipId: fullClip.id,
            videoId: fullClip.videoId,
            sourceFilePath: fullClip.video.filePath,
            startTime: fullClip.startTime,
            endTime: fullClip.endTime,
            format: fullClip.format,
            subtitleSegments: fullClip.subtitleSegments,
            cta: fullClip.cta,
            watermark: false,
          }, DEFAULT_JOB_OPTIONS);
        }
      }

      return updated;
    }),

  updateFull: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(1000).nullable().optional(),
        startTime: z.number().nonnegative().optional(),
        endTime: z.number().positive().optional(),
        format: z.enum(['portrait', 'square', 'landscape']).optional(),
        subtitleSegments: z
          .array(
            z.object({
              start: z.number().nonnegative(),
              end: z.number().positive(),
              text: z.string().max(500),
              style: z
                .object({
                  fontFamily: z.string().max(100).regex(/^[a-zA-Z0-9\s\-,'"]+$/).optional(),
                  fontSize: z.number().positive().max(200).optional(),
                  fontColor: z.string().max(30).regex(/^#[0-9a-fA-F]{3,8}$|^rgba?\(.+\)$/).optional(),
                  backgroundColor: z.string().max(30).regex(/^#[0-9a-fA-F]{3,8}$|^rgba?\(.+\)$/).optional(),
                  bold: z.boolean().optional(),
                  shadow: z.boolean().optional(),
                })
                .optional(),
            }),
          )
          .max(500)
          .optional(),
        cta: z
          .object({
            text: z.string().min(1).max(100),
            position: z.enum(['end', 'overlay']),
            duration: z.number().min(3).max(10),
          })
          .nullable()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await checkRateLimit('clip:update', userId, 30, 60);

      const existingClip = await ctx.prisma.clip.findFirst({
        where: { id: input.id, userId },
      });

      if (!existingClip) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Клип не найден' });
      }

      if (existingClip.status === 'rendering') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Клип в процессе рендеринга. Дождитесь завершения.',
        });
      }

      // Validate time boundaries
      const newStartTime = input.startTime ?? existingClip.startTime;
      const newEndTime = input.endTime ?? existingClip.endTime;
      const newDuration = newEndTime - newStartTime;

      if (newDuration < 5) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Минимальная длительность клипа: 5 сек',
        });
      }

      if (newDuration > 180) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Максимальная длительность клипа: 180 сек',
        });
      }

      if (newStartTime >= newEndTime) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Начало клипа должно быть раньше конца',
        });
      }

      // Validate subtitle segment ordering
      if (input.subtitleSegments) {
        for (const seg of input.subtitleSegments) {
          if (seg.start >= seg.end) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Начало субтитра должно быть раньше конца',
            });
          }
        }
      }

      // Determine if re-render is needed
      const needsReRender =
        (input.startTime !== undefined &&
          input.startTime !== existingClip.startTime) ||
        (input.endTime !== undefined &&
          input.endTime !== existingClip.endTime) ||
        (input.format !== undefined &&
          input.format !== existingClip.format) ||
        (input.subtitleSegments !== undefined &&
          JSON.stringify(input.subtitleSegments) !==
            JSON.stringify(existingClip.subtitleSegments)) ||
        (input.cta !== undefined &&
          JSON.stringify(input.cta) !== JSON.stringify(existingClip.cta));

      // Build update payload
      const updateData: Record<string, unknown> = {};

      if (input.title !== undefined) updateData.title = input.title;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.startTime !== undefined) updateData.startTime = input.startTime;
      if (input.endTime !== undefined) updateData.endTime = input.endTime;
      if (input.startTime !== undefined || input.endTime !== undefined) {
        updateData.duration = newDuration;
      }
      if (input.format !== undefined) updateData.format = input.format;
      if (input.subtitleSegments !== undefined) {
        updateData.subtitleSegments = input.subtitleSegments;
      }
      if (input.cta !== undefined) updateData.cta = input.cta;

      if (needsReRender) {
        updateData.status = 'rendering';
      }

      const updatedClip = await ctx.prisma.clip.update({
        where: { id: input.id },
        data: updateData,
        select: {
          id: true,
          videoId: true,
          title: true,
          description: true,
          startTime: true,
          endTime: true,
          duration: true,
          format: true,
          subtitleSegments: true,
          cta: true,
          viralityScore: true,
          status: true,
        },
      });

      // Queue render job if needed
      if (needsReRender) {
        const fullClip = await ctx.prisma.clip.findUnique({
          where: { id: input.id },
          include: { video: true },
        });
        if (fullClip?.video) {
          const renderQueue = createQueue(QUEUE_NAMES.VIDEO_RENDER!);
          await renderQueue.add(
            'render',
            {
              clipId: fullClip.id,
              videoId: fullClip.videoId,
              sourceFilePath: fullClip.video.filePath,
              startTime: fullClip.startTime,
              endTime: fullClip.endTime,
              format: fullClip.format,
              subtitleSegments: fullClip.subtitleSegments,
              cta: fullClip.cta,
              watermark: false,
            },
            DEFAULT_JOB_OPTIONS,
          );
        }
      }

      return updatedClip;
    }),

  publish: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        platforms: z.array(z.enum(['vk', 'rutube', 'dzen', 'telegram'])).min(1),
        scheduleAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await checkRateLimit('clip:publish', userId, 20, 60);

      // 1. Fetch clip
      const clip = await ctx.prisma.clip.findFirst({
        where: { id: input.id, userId },
      });

      if (!clip) throw new TRPCError({ code: 'NOT_FOUND', message: 'Клип не найден' });

      // 2. Check clip status
      if (clip.status !== 'ready') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Клип ещё не готов' });
      }

      if (!clip.filePath) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Файл клипа не найден' });
      }

      // 3. Fetch user plan and check platform access
      const planId = (ctx.session.user.planId ?? 'free') as PlanId;
      const plan = PLANS[planId];

      // 4. Validate scheduling: must be >= 5 minutes in the future
      if (input.scheduleAt) {
        const scheduleDate = new Date(input.scheduleAt);
        const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
        if (scheduleDate < fiveMinutesFromNow) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Время публикации должно быть минимум через 5 минут',
          });
        }
      }

      // 5. Validate file size per platform
      let fileSize: number;
      try {
        const stat = fs.statSync(clip.filePath);
        fileSize = stat.size;
      } catch {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Файл клипа недоступен',
        });
      }

      // 6. Validate each platform
      const connections: Array<{ platform: string; connectionId: string }> = [];

      for (const platform of input.platforms) {
        // Check plan allows this platform
        if (!plan.autoPostPlatforms.includes(platform)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: `Платформа ${platform} недоступна на тарифе "${plan.name}". Обновите тариф.`,
          });
        }

        // Check file size limit
        const maxSize = PLATFORM_FILE_SIZE_LIMITS[platform];
        if (maxSize && fileSize > maxSize) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Размер файла превышает лимит ${PLATFORM_SIZE_LABELS[platform]} для ${platform}`,
          });
        }

        // Fetch PlatformConnection (must exist and not expired)
        const connection = await ctx.prisma.platformConnection.findUnique({
          where: { userId_platform: { userId, platform } },
        });

        if (!connection) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Нет подключения к ${platform}. Добавьте его в настройках.`,
          });
        }

        if (connection.expiresAt && connection.expiresAt < new Date()) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Токен ${platform} истёк. Переподключите платформу.`,
          });
        }

        // Check no duplicate publication (scheduled/publishing for same clip+platform)
        const existingPublication = await ctx.prisma.publication.findFirst({
          where: {
            clipId: clip.id,
            platform,
            status: { in: ['scheduled', 'publishing'] },
          },
        });

        if (existingPublication) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Клип уже публикуется или запланирован для ${platform}`,
          });
        }

        connections.push({ platform, connectionId: connection.id });
      }

      // 7. Create publications in a transaction
      const publications = await ctx.prisma.$transaction(
        connections.map(({ platform, connectionId }) =>
          ctx.prisma.publication.create({
            data: {
              clipId: clip.id,
              platform: platform as 'vk' | 'rutube' | 'dzen' | 'telegram',
              status: input.scheduleAt ? 'scheduled' : 'publishing',
              scheduledAt: input.scheduleAt ? new Date(input.scheduleAt) : null,
            },
            select: {
              id: true,
              platform: true,
              status: true,
              scheduledAt: true,
            },
          }),
        ),
      );

      // 8. Enqueue BullMQ jobs for each publication
      const publishQueue = createQueue(QUEUE_NAMES.PUBLISH!);

      for (let i = 0; i < publications.length; i++) {
        const pub = publications[i]!;
        const conn = connections[i]!;

        const jobData: PublishJobData = {
          publicationId: pub.id,
          clipId: clip.id,
          platform: conn.platform as 'vk' | 'rutube' | 'dzen' | 'telegram',
          connectionId: conn.connectionId,
          filePath: clip.filePath!,
          title: clip.title,
          description: clip.description ?? undefined,
        };

        const delay = input.scheduleAt
          ? Math.max(0, new Date(input.scheduleAt).getTime() - Date.now())
          : 0;

        await publishQueue.add('publish', jobData, {
          ...DEFAULT_JOB_OPTIONS,
          jobId: `pub-${pub.id}`,
          delay,
        });
      }

      // 9. Return publications
      return publications;
    }),

  cancelPublication: protectedProcedure
    .input(z.object({ publicationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await checkRateLimit('clip:publish', userId, 20, 60);

      // Find publication and verify ownership via clip
      const publication = await ctx.prisma.publication.findUnique({
        where: { id: input.publicationId },
        include: { clip: { select: { userId: true } } },
      });

      if (!publication) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Публикация не найдена' });
      }

      if (publication.clip.userId !== userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Нет доступа' });
      }

      // Only allow cancellation of scheduled publications
      if (publication.status !== 'scheduled') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Можно отменить только запланированные публикации',
        });
      }

      // Update status to cancelled
      await ctx.prisma.publication.update({
        where: { id: input.publicationId },
        data: { status: 'cancelled' },
      });

      // Remove the BullMQ job
      try {
        const publishQueue = createQueue(QUEUE_NAMES.PUBLISH!);
        const job = await publishQueue.getJob(`pub-${input.publicationId}`);
        if (job) {
          await job.remove();
        }
      } catch {
        // Job may already have been processed or removed — that's ok
      }

      return { cancelled: true };
    }),

  retryPublication: protectedProcedure
    .input(z.object({ publicationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await checkRateLimit('clip:publish', userId, 20, 60);

      // Find publication and verify ownership via clip
      const publication = await ctx.prisma.publication.findUnique({
        where: { id: input.publicationId },
        include: {
          clip: { select: { userId: true, filePath: true, title: true, description: true, id: true } },
        },
      });

      if (!publication) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Публикация не найдена' });
      }

      if (publication.clip.userId !== userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Нет доступа' });
      }

      // Only allow retry for failed publications
      if (publication.status !== 'failed') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Повторить можно только неудачные публикации',
        });
      }

      // Check connection still exists
      const connection = await ctx.prisma.platformConnection.findUnique({
        where: { userId_platform: { userId, platform: publication.platform } },
      });

      if (!connection) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Нет подключения к ${publication.platform}. Добавьте его в настройках.`,
        });
      }

      // Update status to publishing, clear error
      await ctx.prisma.publication.update({
        where: { id: input.publicationId },
        data: {
          status: 'publishing',
          errorMessage: null,
        },
      });

      // Re-enqueue BullMQ job
      const publishQueue = createQueue(QUEUE_NAMES.PUBLISH!);

      const jobData: PublishJobData = {
        publicationId: publication.id,
        clipId: publication.clip.id,
        platform: publication.platform,
        connectionId: connection.id,
        filePath: publication.clip.filePath!,
        title: publication.clip.title,
        description: publication.clip.description ?? undefined,
      };

      await publishQueue.add('publish', jobData, {
        ...DEFAULT_JOB_OPTIONS,
        jobId: `pub-${input.publicationId}-retry-${Date.now()}`,
      });

      return { retried: true };
    }),

  download: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await checkRateLimit('clip:download', userId, 30, 60);

      const clip = await ctx.prisma.clip.findFirst({
        where: { id: input.id, userId },
      });

      if (!clip) throw new TRPCError({ code: 'NOT_FOUND', message: 'Клип не найден' });
      if (clip.status !== 'ready') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Клип ещё не готов' });
      }
      if (!clip.filePath) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Файл клипа не найден' });
      }

      const downloadUrl = await generateDownloadUrl(clip.filePath);
      return { downloadUrl };
    }),
});
