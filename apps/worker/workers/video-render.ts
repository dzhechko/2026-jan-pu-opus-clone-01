import { Worker } from 'bullmq';
import type { VideoRenderJobData } from '@clipmaker/types';
import { QUEUE_NAMES } from '@clipmaker/queue';
import { getRedisConnection } from '@clipmaker/queue/src/queues';
import { prisma } from '@clipmaker/db';
import { renderClip } from '../lib/ffmpeg';
import { createLogger } from '../lib/logger';
import path from 'path';
import os from 'os';

const logger = createLogger('worker-video');

const worker = new Worker<VideoRenderJobData>(
  QUEUE_NAMES.VIDEO_RENDER,
  async (job) => {
    const { clipId, videoId, sourceFilePath, startTime, endTime, format, watermark } = job.data;

    logger.info({ event: 'render_start', clipId, format, duration: endTime - startTime });

    await prisma.clip.update({
      where: { id: clipId },
      data: { status: 'rendering' },
    });

    try {
      const outputPath = path.join(os.tmpdir(), `clip-${clipId}.mp4`);

      await renderClip({
        inputPath: sourceFilePath,
        outputPath,
        startTime,
        endTime,
        format,
        watermark,
        watermarkText: watermark ? 'KlipMaker.ru' : undefined,
      });

      // TODO: Upload to S3 and get final URL
      const s3Path = `clips/${videoId}/${clipId}.mp4`;

      await prisma.clip.update({
        where: { id: clipId },
        data: { filePath: s3Path, status: 'ready' },
      });

      logger.info({ event: 'render_complete', clipId, s3Path });
    } catch (error) {
      logger.error({ event: 'render_error', clipId, error });
      await prisma.clip.update({
        where: { id: clipId },
        data: { status: 'failed' },
      });
      throw error;
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 3,
  },
);

worker.on('failed', (job, err) => {
  logger.error({ event: 'render_job_failed', jobId: job?.id, clipId: job?.data?.clipId, error: err.message });
});

export default worker;
