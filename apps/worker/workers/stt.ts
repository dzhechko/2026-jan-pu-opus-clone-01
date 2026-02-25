import { Worker } from 'bullmq';
import { createReadStream } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import pMap from 'p-map';
import type { STTJobData } from '@clipmaker/types';
import { QUEUE_NAMES } from '@clipmaker/queue';
import { getRedisConnection } from '@clipmaker/queue/src/queues';
import { prisma } from '@clipmaker/db';
import { createLogger } from '../lib/logger';
import { ffprobeGetDuration, extractAudio } from '../lib/ffmpeg';
import { downloadFromS3 } from '../lib/s3-download';
import { splitAudio } from '../lib/audio-chunker';
import { createSTTClient, getSTTConfig } from '../lib/stt-client';
import { retryWithBackoff } from '../lib/retry';

const logger = createLogger('worker-stt');

type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
  confidence: number;
};

type WhisperSegment = {
  start: number;
  end: number;
  text: string;
  avg_logprob?: number;
  no_speech_prob?: number;
};

const worker = new Worker<STTJobData>(
  QUEUE_NAMES.STT,
  async (job) => {
    const { videoId, filePath, strategy, language } = job.data;
    let tmpDir: string | undefined;

    logger.info({ event: 'stt_start', videoId, strategy, language });

    try {
      // 1. Validate job
      const video = await prisma.video.findUnique({ where: { id: videoId } });
      if (!video || video.status !== 'transcribing') {
        throw new Error(`Invalid video state: ${video?.status ?? 'not found'}`);
      }
      const user = await prisma.user.findUnique({ where: { id: video.userId } });
      if (!user) throw new Error('User not found');

      // 2. Download video from S3
      tmpDir = await mkdtemp(path.join(os.tmpdir(), 'stt-'));
      const ext = path.extname(filePath) || '.mp4';
      const videoPath = path.join(tmpDir, `source${ext}`);
      await downloadFromS3(filePath, videoPath);

      // 3. Probe duration
      const durationSeconds = await ffprobeGetDuration(videoPath);
      logger.info({ event: 'stt_duration', videoId, durationSeconds });

      // 4. Check quota
      const remainingMinutes = user.minutesLimit - user.minutesUsed;
      const videoDurationMinutes = Math.ceil(durationSeconds / 60);
      const transcribeMinutes = Math.min(videoDurationMinutes, remainingMinutes);

      if (transcribeMinutes <= 0) {
        await prisma.video.update({
          where: { id: video.id },
          data: { status: 'failed' },
        });
        throw new Error('No minutes remaining');
      }

      const transcribeDuration = transcribeMinutes * 60;

      // 5. Extract audio (WAV 16kHz mono)
      const audioPath = path.join(tmpDir, 'audio.wav');
      await extractAudio(videoPath, audioPath, transcribeDuration);

      // 6. Chunk audio if needed
      const chunks = await splitAudio(audioPath, tmpDir, transcribeDuration);
      logger.info({ event: 'stt_chunks', videoId, count: chunks.length });

      // 7. Transcribe chunks in parallel (concurrency 3)
      const sttConfig = getSTTConfig(strategy);
      const client = createSTTClient(strategy);
      const allSegments: TranscriptSegment[] = [];

      await pMap(
        chunks,
        async (chunk) => {
          const file = createReadStream(chunk.path);

          const response = await retryWithBackoff(
            async () =>
              client.audio.transcriptions.create({
                model: sttConfig.model,
                file,
                language,
                response_format: 'verbose_json',
              }),
            { maxRetries: 2, baseDelayMs: 2000 },
          );

          // Filter silence before mapping (need raw Whisper fields)
          const rawSegments = (
            (response as unknown as { segments?: WhisperSegment[] }).segments ?? []
          ).filter(
            (raw) => raw.text.trim().length > 0 && (raw.no_speech_prob ?? 0) < 0.8,
          );

          // Map to TranscriptSegment with chunk offset
          const mapped: TranscriptSegment[] = rawSegments.map((raw) => ({
            start: raw.start + chunk.offsetSeconds,
            end: raw.end + chunk.offsetSeconds,
            text: raw.text.trim(),
            confidence: raw.avg_logprob
              ? Math.min(1, Math.max(0, 1 + raw.avg_logprob))
              : 0.9,
          }));

          allSegments.push(...mapped);
        },
        { concurrency: 3 },
      );

      // Sort by start time (chunks may arrive out of order)
      allSegments.sort((a, b) => a.start - b.start);

      // 8. Build full text
      const fullText = allSegments.map((s) => s.text).join(' ');
      const wordCount = fullText.split(/\s+/).filter(Boolean).length;
      const tokenCount = Math.ceil(wordCount * 2.5);

      // 9. Save transcript + update video + track usage (single transaction)
      const sttCostKopecks =
        strategy === 'ru'
          ? Math.ceil(transcribeDuration * 0.005 * 100) // 0.005₽/sec → kopecks
          : Math.ceil((transcribeDuration / 60) * 0.55 * 100); // ~0.55₽/min → kopecks

      await prisma.$transaction([
        prisma.transcript.create({
          data: {
            videoId: video.id,
            language,
            segments: allSegments as unknown as Parameters<typeof prisma.transcript.create>[0]['data']['segments'],
            fullText,
            tokenCount,
            sttModel: sttConfig.model,
            sttProvider: strategy === 'ru' ? 'cloudru' : 'openai',
          },
        }),
        prisma.video.update({
          where: { id: video.id },
          data: {
            status: 'analyzing',
            durationSeconds: Math.round(durationSeconds),
          },
        }),
        prisma.user.update({
          where: { id: user.id },
          data: { minutesUsed: { increment: transcribeMinutes } },
        }),
        prisma.usageRecord.create({
          data: {
            userId: user.id,
            videoId: video.id,
            minutesConsumed: transcribeMinutes,
            sttCostKopecks,
            llmCostKopecks: 0,
            gpuCostKopecks: 0,
            providerStrategy: strategy === 'ru' ? 'ru' : 'global',
          },
        }),
      ]);

      logger.info({
        event: 'stt_complete',
        videoId,
        model: sttConfig.model,
        segments: allSegments.length,
        minutes: transcribeMinutes,
        costKopecks: sttCostKopecks,
      });
    } catch (error) {
      logger.error({ event: 'stt_error', videoId, error });

      // Mark video as failed (best effort)
      try {
        await prisma.video.update({
          where: { id: videoId },
          data: { status: 'failed' },
        });
      } catch (updateErr) {
        logger.warn({ event: 'stt_status_update_failed', videoId, error: updateErr });
      }

      throw error;
    } finally {
      // 10. Cleanup temp files
      if (tmpDir) {
        try {
          await rm(tmpDir, { recursive: true, force: true });
        } catch (cleanupErr) {
          logger.warn({ event: 'stt_cleanup_failed', tmpDir, error: cleanupErr });
        }
      }
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
  },
);

worker.on('failed', (job, err) => {
  logger.error({ event: 'stt_job_failed', jobId: job?.id, error: err.message });
});

export default worker;
