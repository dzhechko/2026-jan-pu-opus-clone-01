import { Worker, Job } from 'bullmq';
import { mkdtemp, rm, writeFile, readFile, unlink, rename } from 'fs/promises';
import path from 'path';
import os from 'os';
import { z } from 'zod';
import type { VideoRenderJobData } from '@clipmaker/types';
import { QUEUE_NAMES } from '@clipmaker/queue';
import { getRedisConnection } from '@clipmaker/queue/src/queues';
import { prisma } from '@clipmaker/db';
import { putObject } from '@clipmaker/s3';
import { clipPath, thumbnailPath } from '@clipmaker/s3';
import { createLogger } from '../lib/logger';
import { downloadFromS3 } from '../lib/s3-download';
import {
  renderClip,
  execFFmpeg,
  generateSubtitleFile,
  buildFilterChain,
  generateCtaEndCard,
  concatClipAndCta,
  generateThumbnail,
  FORMAT_DIMENSIONS,
  type ClipFormat,
} from '../lib/ffmpeg';

const logger = createLogger('worker-video-render');

const FFMPEG_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Zod validation schemas
// ---------------------------------------------------------------------------

const SubtitleSegmentSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string().min(1).max(500),
}).refine(
  (s) => s.end > s.start,
  { message: 'Subtitle end must be after start' },
);

const CTASchema = z.object({
  text: z.string().min(1).max(50),
  position: z.enum(['end', 'overlay']),
  duration: z.number().int().min(3).max(5),
});

const VideoRenderJobSchema = z.object({
  clipId: z.string().uuid(),
  videoId: z.string().uuid(),
  sourceFilePath: z.string().min(1).max(1024),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  format: z.enum(['portrait', 'square', 'landscape']),
  subtitleSegments: z.array(SubtitleSegmentSchema).max(500),
  cta: CTASchema.optional(),
  watermark: z.boolean(),
}).refine(
  (d) => d.endTime > d.startTime,
  { message: 'endTime must be greater than startTime' },
).refine(
  (d) => d.endTime - d.startTime <= 180,
  { message: 'Clip duration must not exceed 180 seconds' },
);

// ---------------------------------------------------------------------------
// Helpers: video completion / failure checks
// ---------------------------------------------------------------------------

async function checkVideoCompletion(videoId: string): Promise<void> {
  const clips = await prisma.clip.findMany({
    where: { videoId },
    select: { status: true },
  });

  if (clips.length === 0) return;

  const allReady = clips.every((c) => c.status === 'ready');
  if (allReady) {
    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'completed' },
    });
    logger.info({ event: 'video_completed', videoId, clipCount: clips.length });
  }
}

async function checkVideoFailure(videoId: string): Promise<void> {
  const clips = await prisma.clip.findMany({
    where: { videoId },
    select: { status: true },
  });

  if (clips.length === 0) return;

  const allFailed = clips.every((c) => c.status === 'failed');
  if (allFailed) {
    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'failed' },
    });
    logger.error({ event: 'video_all_clips_failed', videoId, clipCount: clips.length });
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

async function handleRenderJob(job: Job<VideoRenderJobData>): Promise<void> {
  const jobData = job.data;
  logger.info({
    event: 'render_start',
    clipId: jobData.clipId,
    format: jobData.format,
    duration: jobData.endTime - jobData.startTime,
  });

  // 1. Validate job data with Zod
  const parsed = VideoRenderJobSchema.safeParse(jobData);
  if (!parsed.success) {
    logger.error({
      event: 'render_validation_failed',
      clipId: jobData.clipId,
      errors: parsed.error.issues,
    });
    // Mark clip as failed — no retries for bad data
    await prisma.clip.update({
      where: { id: jobData.clipId },
      data: { status: 'failed' },
    });
    throw new Error(`Invalid job data: ${parsed.error.message}`);
  }

  const data = parsed.data;

  // 2. Fetch clip + video + user from DB
  const clip = await prisma.clip.findUnique({
    where: { id: data.clipId },
    include: {
      video: {
        include: { user: true },
      },
    },
  });

  if (!clip) {
    throw new Error(`Clip ${data.clipId} not found`);
  }

  // 3. Idempotency guard: skip if clip is already rendering or ready
  if (clip.status !== 'pending' && clip.status !== 'failed') {
    logger.warn({ event: 'render_skip', clipId: data.clipId, status: clip.status });
    return;
  }

  const video = clip.video;
  const user = video.user;
  const userId = user.id;

  // 4. Set status to 'rendering'
  await prisma.clip.update({
    where: { id: data.clipId },
    data: { status: 'rendering' },
  });

  // 5. Create temp directory
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'clipmaker-render-'));

  try {
    // 5a. Build local paths
    const clipDuration = data.endTime - data.startTime;
    const sourceLocal = path.join(tmpDir, 'source.mp4');
    const assFile = path.join(tmpDir, 'subtitles.ass');
    const renderedClip = path.join(tmpDir, `clip-${clip.id}.mp4`);
    const thumbnailLocal = path.join(tmpDir, `thumb-${clip.id}.jpg`);

    // 5b. Build S3 keys
    const s3ClipKey = clipPath(userId, video.id, clip.id);
    const s3ThumbnailKey = thumbnailPath(userId, video.id, clip.id);

    // 6. Download source video from S3
    await job.updateProgress(10);
    logger.info({ event: 's3_download_start', s3Key: data.sourceFilePath });
    await downloadFromS3(data.sourceFilePath, sourceLocal);
    logger.info({ event: 's3_download_complete', localPath: sourceLocal });

    // 7. Generate ASS subtitle file (if segments exist)
    let assFilePath: string | null = null;
    if (data.subtitleSegments.length > 0) {
      const assContent = generateSubtitleFile(
        data.subtitleSegments,
        clipDuration,
        data.format,
      );
      await writeFile(assFile, assContent, 'utf-8');
      assFilePath = assFile;
      logger.info({ event: 'ass_generated', segments: data.subtitleSegments.length });
    }

    // 8. Build FFmpeg filter chain
    const filterChain = buildFilterChain(
      data.format,
      assFilePath,
      data.cta ?? null,
      data.watermark,
      clipDuration,
    );

    // 9. Render clip via FFmpeg
    await job.updateProgress(30);
    await renderClip({
      inputPath: sourceLocal,
      outputPath: renderedClip,
      startTime: data.startTime,
      endTime: data.endTime,
      format: data.format,
      filterChain,
    });
    logger.info({ event: 'ffmpeg_complete', clipId: clip.id });

    // 9b. CTA end card (if cta.position === 'end': generate card and concat)
    if (data.cta && data.cta.position === 'end') {
      const { width, height } = FORMAT_DIMENSIONS[data.format];
      const ctaCardPath = path.join(tmpDir, `cta-${clip.id}.mp4`);
      const finalPath = path.join(tmpDir, `final-${clip.id}.mp4`);

      await generateCtaEndCard(data.cta, width, height, ctaCardPath);
      await concatClipAndCta(renderedClip, ctaCardPath, finalPath);

      // Replace rendered clip with the final concatenated version
      await unlink(renderedClip).catch(() => {});
      await rename(finalPath, renderedClip);
      await unlink(ctaCardPath).catch(() => {});

      logger.info({
        event: 'cta_end_card_appended',
        clipId: clip.id,
        ctaDuration: data.cta.duration,
      });
    }

    // 10. Generate thumbnail (non-fatal — proceed without if it fails)
    await job.updateProgress(70);
    const thumbnailTimeOffset = clipDuration * 0.25;
    let thumbnailGenerated = false;
    try {
      await generateThumbnail(renderedClip, thumbnailLocal, thumbnailTimeOffset);
      thumbnailGenerated = true;
      logger.info({ event: 'thumbnail_generated', clipId: clip.id });
    } catch (thumbnailError) {
      logger.warn({
        event: 'thumbnail_failed',
        clipId: clip.id,
        error: thumbnailError instanceof Error ? thumbnailError.message : thumbnailError,
      });
    }

    // 11. Upload rendered clip + thumbnail to S3
    await job.updateProgress(80);
    const clipBuffer = await readFile(renderedClip);
    await putObject(s3ClipKey, clipBuffer, 'video/mp4');
    logger.info({ event: 's3_upload_clip', key: s3ClipKey });

    if (thumbnailGenerated) {
      const thumbBuffer = await readFile(thumbnailLocal);
      await putObject(s3ThumbnailKey, thumbBuffer, 'image/jpeg');
      logger.info({ event: 's3_upload_thumbnail', key: s3ThumbnailKey });
    }

    // 12. Update clip in DB: filePath, thumbnailPath, status='ready'
    await job.updateProgress(95);
    await prisma.clip.update({
      where: { id: clip.id },
      data: {
        filePath: s3ClipKey,
        thumbnailPath: thumbnailGenerated ? s3ThumbnailKey : null,
        status: 'ready',
      },
    });

    // 13. Check if all clips for this video are ready
    await checkVideoCompletion(video.id);

    await job.updateProgress(100);
    logger.info({ event: 'render_complete', clipId: clip.id, s3Path: s3ClipKey });
  } catch (error) {
    logger.error({
      event: 'render_error',
      clipId: data.clipId,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Mark clip as failed, then re-throw for BullMQ retry
    await prisma.clip.update({
      where: { id: data.clipId },
      data: { status: 'failed' },
    }).catch((updateErr) => {
      logger.warn({ event: 'render_status_update_failed', clipId: data.clipId, error: updateErr });
    });

    throw error;
  } finally {
    // 14. Cleanup temp files (non-fatal)
    try {
      await rm(tmpDir, { recursive: true, force: true });
      logger.debug({ event: 'tmpdir_cleaned', path: tmpDir });
    } catch (cleanupError) {
      logger.warn({
        event: 'tmpdir_cleanup_failed',
        path: tmpDir,
        error: cleanupError instanceof Error ? cleanupError.message : cleanupError,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Worker registration
// ---------------------------------------------------------------------------

const worker = new Worker<VideoRenderJobData>(
  QUEUE_NAMES.VIDEO_RENDER,
  handleRenderJob,
  {
    connection: getRedisConnection(),
    concurrency: 3,
    limiter: {
      max: 5,
      duration: 60_000,
    },
  },
);

worker.on('failed', async (job, err) => {
  const clipId = job?.data?.clipId;
  const videoId = job?.data?.videoId;
  logger.error({
    event: 'render_job_failed',
    jobId: job?.id,
    clipId,
    videoId,
    error: err.message,
    attemptsMade: job?.attemptsMade,
  });

  // Only mark clip as failed and check video failure after ALL retries exhausted
  if (job && clipId && job.attemptsMade === job.opts?.attempts) {
    logger.error({
      event: 'render_job_exhausted',
      jobId: job.id,
      clipId,
      videoId,
      attemptsMade: job.attemptsMade,
    });

    // Ensure clip is marked failed (best effort)
    await prisma.clip.update({
      where: { id: clipId },
      data: { status: 'failed' },
    }).catch(() => {});

    // Check if all clips for this video have failed
    if (videoId) {
      await checkVideoFailure(videoId);
    }
  }
});

worker.on('error', (err) => {
  logger.error({ event: 'worker_error', error: err.message });
});

export default worker;
