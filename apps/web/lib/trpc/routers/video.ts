import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const videoRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(10),
        cursor: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const videos = await ctx.prisma.video.findMany({
        where: { userId: ctx.session.user.id },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { clips: true } } },
      });

      let nextCursor: string | undefined;
      if (videos.length > input.limit) {
        const next = videos.pop();
        nextCursor = next?.id;
      }

      return { items: videos, nextCursor };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const video = await ctx.prisma.video.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        include: {
          transcript: true,
          clips: { orderBy: { createdAt: 'desc' }, include: { publications: true } },
        },
      });

      if (!video) throw new TRPCError({ code: 'NOT_FOUND', message: 'Видео не найдено' });
      return video;
    }),

  createFromUpload: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        fileName: z.string(),
        fileSize: z.number().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
      });

      if (!user) throw new TRPCError({ code: 'NOT_FOUND' });

      if (user.minutesUsed >= user.minutesLimit) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Минуты исчерпаны. Обновите тариф',
        });
      }

      const video = await ctx.prisma.video.create({
        data: {
          userId: ctx.session.user.id,
          title: input.title,
          sourceType: 'upload',
          filePath: '', // Will be set after S3 upload
          status: 'uploading',
          llmProviderUsed: user.llmProviderPreference,
        },
      });

      // TODO: Generate presigned S3 URL
      return { video, uploadUrl: '' };
    }),

  createFromUrl: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
        title: z.string().min(1).max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
      });

      if (!user) throw new TRPCError({ code: 'NOT_FOUND' });

      const video = await ctx.prisma.video.create({
        data: {
          userId: ctx.session.user.id,
          title: input.title || 'Video from URL',
          sourceType: 'url',
          sourceUrl: input.url,
          filePath: '',
          status: 'downloading',
          llmProviderUsed: user.llmProviderPreference,
        },
      });

      // TODO: Add download job to queue
      return video;
    }),
});
