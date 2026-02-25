import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
  confidence: number;
};

export const transcriptRouter = router({
  getSegments: protectedProcedure
    .input(z.object({ videoId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const video = await ctx.prisma.video.findFirst({
        where: { id: input.videoId, userId },
      });
      if (!video) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Видео не найдено' });
      }

      const transcript = await ctx.prisma.transcript.findUnique({
        where: { videoId: input.videoId },
      });
      if (!transcript) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Транскрипт ещё не готов' });
      }

      return {
        segments: transcript.segments as TranscriptSegment[],
        language: transcript.language,
        sttModel: transcript.sttModel,
        sttProvider: transcript.sttProvider,
      };
    }),

  updateSegments: protectedProcedure
    .input(
      z.object({
        videoId: z.string().uuid(),
        edits: z
          .array(
            z.object({
              index: z.number().int().min(0),
              text: z.string().min(1, 'Текст субтитра не может быть пустым').max(1000, 'Текст субтитра превышает 1000 символов'),
            }),
          )
          .min(1)
          .max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const video = await ctx.prisma.video.findFirst({
        where: { id: input.videoId, userId },
      });
      if (!video) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Видео не найдено' });
      }

      const transcript = await ctx.prisma.transcript.findUnique({
        where: { videoId: input.videoId },
      });
      if (!transcript) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Транскрипт ещё не готов' });
      }

      const segments = transcript.segments as TranscriptSegment[];

      for (const edit of input.edits) {
        if (edit.index >= segments.length) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Индекс сегмента вне диапазона: ${edit.index}`,
          });
        }
        segments[edit.index]!.text = edit.text.trim();
      }

      const fullText = segments.map((s) => s.text).join(' ');
      const wordCount = fullText.split(/\s+/).filter(Boolean).length;
      const tokenCount = Math.ceil(wordCount * 2.5);

      await ctx.prisma.transcript.update({
        where: { videoId: input.videoId },
        data: { segments, fullText, tokenCount },
      });

      return { success: true as const };
    }),

  getFullText: protectedProcedure
    .input(z.object({ videoId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const video = await ctx.prisma.video.findFirst({
        where: { id: input.videoId, userId },
      });
      if (!video) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Видео не найдено' });
      }

      const transcript = await ctx.prisma.transcript.findUnique({
        where: { videoId: input.videoId },
      });
      if (!transcript) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Транскрипт ещё не готов' });
      }

      return {
        fullText: transcript.fullText,
        tokenCount: transcript.tokenCount,
        language: transcript.language,
      };
    }),
});
