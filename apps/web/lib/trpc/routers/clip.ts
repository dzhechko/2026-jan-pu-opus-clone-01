import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { generateDownloadUrl } from '@clipmaker/s3';

export const clipRouter = router({
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const clip = await ctx.prisma.clip.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
        include: { publications: true },
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
        subtitleEdits: z
          .array(z.object({ index: z.number().int().nonnegative(), text: z.string() }))
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const clip = await ctx.prisma.clip.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
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

      const updated = await ctx.prisma.clip.update({
        where: { id: input.id },
        data: { ...updateData, status: 'rendering' },
      });

      // TODO: Add re-render job to queue
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
      const clip = await ctx.prisma.clip.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
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
      const clip = await ctx.prisma.clip.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
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
