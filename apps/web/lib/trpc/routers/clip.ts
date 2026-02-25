import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { generateDownloadUrl } from '@clipmaker/s3';
import { QUEUE_NAMES, DEFAULT_JOB_OPTIONS } from '@clipmaker/queue';
import { createQueue } from '@clipmaker/queue/src/queues';

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
    },
  },
} as const;

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

      const clip = await ctx.prisma.clip.findFirst({
        where: { id: input.id, userId },
      });

      if (!clip) throw new TRPCError({ code: 'NOT_FOUND' });
      if (clip.status !== 'ready') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Клип ещё не готов' });
      }

      const publications = await ctx.prisma.$transaction(
        input.platforms.map((platform) =>
          ctx.prisma.publication.create({
            data: {
              clipId: clip.id,
              platform,
              status: input.scheduleAt ? 'scheduled' : 'publishing',
              scheduledAt: input.scheduleAt ? new Date(input.scheduleAt) : null,
            },
          }),
        ),
      );

      // TODO: Add publish jobs to queue
      return publications;
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
