import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import {
  videoSourcePath,
  generateUploadUrl,
  initiateMultipartUpload,
  completeMultipartUpload,
  abortMultipartUpload,
  headObject,
  getObjectBytes,
  deleteObject,
  validateMagicBytes,
} from '@clipmaker/s3';
import { createQueue, QUEUE_NAMES } from '@clipmaker/queue';

const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB
const MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024; // 4GB

const ALLOWED_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi'];

function extractExtension(fileName: string): string {
  let baseName = fileName.split('/').pop() ?? fileName;
  baseName = baseName.split('\\').pop() ?? baseName;
  const parts = baseName.split('.');
  if (parts.length < 2) return 'mp4';
  const ext = (parts.pop() ?? '').toLowerCase().trim();
  return ALLOWED_EXTENSIONS.includes(ext) ? ext : 'mp4';
}

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
        fileName: z.string().min(1).max(500),
        fileSize: z.number().int().positive().max(MAX_FILE_SIZE),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      await checkRateLimit('upload', userId, 10, 3600);

      const user = await ctx.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) throw new TRPCError({ code: 'NOT_FOUND' });

      if (user.minutesUsed >= user.minutesLimit) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Минуты исчерпаны. Обновите тариф',
        });
      }

      const ext = extractExtension(input.fileName);
      const video = await ctx.prisma.video.create({
        data: {
          userId,
          title: input.title,
          sourceType: 'upload',
          filePath: '', // Set below after we know the key
          fileSize: BigInt(input.fileSize),
          status: 'uploading',
          llmProviderUsed: user.llmProviderPreference,
        },
      });

      const key = videoSourcePath(userId, video.id, ext);
      await ctx.prisma.video.update({
        where: { id: video.id },
        data: { filePath: key },
      });

      const contentType = `video/${ext}`;

      if (input.fileSize <= MULTIPART_THRESHOLD) {
        const upload = await generateUploadUrl(key, input.fileSize, contentType);
        return {
          video: { id: video.id, title: video.title, status: video.status },
          upload,
        };
      }

      const upload = await initiateMultipartUpload(key, input.fileSize, contentType);
      return {
        video: { id: video.id, title: video.title, status: video.status },
        upload: { ...upload, videoId: video.id },
      };
    }),

  completeMultipart: protectedProcedure
    .input(
      z.object({
        videoId: z.string().uuid(),
        uploadId: z.string().min(1),
        parts: z
          .array(
            z.object({
              partNumber: z.number().int().positive(),
              etag: z.string().min(1),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const video = await ctx.prisma.video.findFirst({
        where: { id: input.videoId, userId },
      });

      if (!video) throw new TRPCError({ code: 'NOT_FOUND', message: 'Видео не найдено' });

      try {
        await completeMultipartUpload(video.filePath, input.uploadId, input.parts);
        return { success: true };
      } catch (error) {
        await abortMultipartUpload(video.filePath, input.uploadId);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Ошибка завершения загрузки',
          cause: error,
        });
      }
    }),

  abortMultipart: protectedProcedure
    .input(
      z.object({
        videoId: z.string().uuid(),
        uploadId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const video = await ctx.prisma.video.findFirst({
        where: { id: input.videoId, userId },
      });

      if (!video) throw new TRPCError({ code: 'NOT_FOUND', message: 'Видео не найдено' });

      await abortMultipartUpload(video.filePath, input.uploadId);
      return { success: true };
    }),

  confirmUpload: protectedProcedure
    .input(z.object({ videoId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const video = await ctx.prisma.video.findFirst({
        where: { id: input.videoId, userId },
      });

      if (!video) throw new TRPCError({ code: 'NOT_FOUND', message: 'Видео не найдено' });
      if (video.status !== 'uploading') {
        throw new TRPCError({ code: 'CONFLICT', message: 'Видео уже обрабатывается' });
      }

      // Verify file exists in S3
      let fileSize: number;
      try {
        const head = await headObject(video.filePath);
        fileSize = head.contentLength;
      } catch (error) {
        const err = error as { name?: string };
        if (err.name === 'NotFound' || err.name === 'NoSuchKey') {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Файл не найден в хранилище' });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Ошибка хранилища',
          cause: error,
        });
      }

      // Validate magic bytes (first 16 bytes)
      try {
        const rangeResult = await getObjectBytes(video.filePath, 'bytes=0-15');
        const body = rangeResult.body;
        let bytes: Uint8Array;
        if (body instanceof Uint8Array) {
          bytes = body;
        } else {
          // ReadableStream → Uint8Array
          const reader = (body as ReadableStream<Uint8Array>).getReader();
          const chunks: Uint8Array[] = [];
          let done = false;
          while (!done) {
            const result = await reader.read();
            done = result.done;
            if (result.value) chunks.push(result.value);
          }
          bytes = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
          }
        }

        const validation = validateMagicBytes(bytes);
        if (!validation.valid) {
          await deleteObject(video.filePath);
          await ctx.prisma.video.delete({ where: { id: video.id } });
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Неподдерживаемый формат файла',
          });
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Ошибка чтения файла',
          cause: error,
        });
      }

      // Update video record with verified fileSize
      const strategy = video.llmProviderUsed ?? 'ru';
      await ctx.prisma.video.update({
        where: { id: video.id },
        data: {
          status: 'transcribing',
          fileSize: BigInt(fileSize),
          durationSeconds: null,
        },
      });

      // Enqueue STT job
      const sttQueue = createQueue(QUEUE_NAMES.STT);
      await sttQueue.add('stt', {
        videoId: video.id,
        userId,
        filePath: video.filePath,
        strategy,
      });

      return { status: 'transcribing' as const };
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
