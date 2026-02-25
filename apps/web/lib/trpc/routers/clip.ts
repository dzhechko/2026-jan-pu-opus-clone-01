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
          const renderQueue = createQueue(QUEUE_NAMES.VIDEO_RENDER);
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
