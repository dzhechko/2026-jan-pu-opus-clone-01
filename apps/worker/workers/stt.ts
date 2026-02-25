import { Worker } from 'bullmq';
import type { STTJobData } from '@clipmaker/types';
import { QUEUE_NAMES } from '@clipmaker/queue';
import { getRedisConnection } from '@clipmaker/queue/src/queues';
import { prisma } from '@clipmaker/db';
import { LLMRouter } from '../lib/llm-router';
import { createLogger } from '../lib/logger';

const logger = createLogger('worker-stt');

const router = new LLMRouter(
  process.env.CLOUDRU_API_KEY,
  {
    openai: process.env.OPENAI_API_KEY,
  },
);

const worker = new Worker<STTJobData>(
  QUEUE_NAMES.STT,
  async (job) => {
    const { videoId, filePath, strategy, language } = job.data;

    logger.info({ event: 'stt_start', videoId, strategy, language });

    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'transcribing' },
    });

    try {
      // TODO: Read file from S3 and pass to transcription
      // For now, placeholder for the actual implementation
      const result = await router.transcribe(strategy, Buffer.from([]) as unknown as File, language);

      await prisma.transcript.create({
        data: {
          videoId,
          language,
          segments: JSON.parse(JSON.stringify(result.segments)),
          fullText: result.text,
          tokenCount: Math.ceil(result.text.length / 4),
          sttModel: result.model,
          sttProvider: strategy === 'ru' ? 'cloudru' : 'openai',
        },
      });

      await prisma.video.update({
        where: { id: videoId },
        data: { status: 'analyzing' },
      });

      logger.info({ event: 'stt_complete', videoId, model: result.model });
    } catch (error) {
      logger.error({ event: 'stt_error', videoId, error });
      await prisma.video.update({
        where: { id: videoId },
        data: { status: 'failed' },
      });
      throw error;
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
