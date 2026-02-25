import { Worker } from 'bullmq';
import type { LLMJobData } from '@clipmaker/types';
import { QUEUE_NAMES } from '@clipmaker/queue';
import { getRedisConnection } from '@clipmaker/queue/src/queues';
import { prisma } from '@clipmaker/db';
import { LLMRouter } from '../lib/llm-router';
import { createLogger } from '../lib/logger';

const logger = createLogger('worker-llm');

const router = new LLMRouter(
  process.env.CLOUDRU_API_KEY,
  {
    gemini: process.env.GEMINI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  },
);

const worker = new Worker<LLMJobData>(
  QUEUE_NAMES.LLM,
  async (job) => {
    const { videoId, task, strategy, input, tier } = job.data;

    logger.info({ event: 'llm_start', videoId, task, strategy });

    const result = await router.complete(
      {
        task,
        strategy,
        tokenCount: input.tokenCount as number | undefined,
        planId: input.planId as string | undefined,
        previousScore: input.previousScore as number | undefined,
      },
      [
        { role: 'system', content: getSystemPrompt(task) },
        { role: 'user', content: JSON.stringify(input) },
      ],
      { jsonMode: true, temperature: task === 'title_generation' ? 0.7 : 0.3 },
    );

    logger.info({
      event: 'llm_complete',
      videoId,
      task,
      model: result.model,
      tier: result.tier,
      costKopecks: result.costKopecks,
      durationMs: result.durationMs,
    });

    return {
      content: result.content,
      model: result.model,
      tier: result.tier,
      costKopecks: result.costKopecks,
    };
  },
  {
    connection: getRedisConnection(),
    concurrency: 5,
  },
);

function getSystemPrompt(task: string): string {
  switch (task) {
    case 'moment_selection':
      return `You are an AI video analyst specializing in Russian-language content.
Analyze the transcript and select 3-10 viral-worthy moments.
Return JSON: { "moments": [{ "start": number, "end": number, "title": string, "reason": string }] }
Each moment should be 15-60 seconds. Focus on: hooks, emotional peaks, key insights, humor, controversies.`;

    case 'virality_scoring':
      return `Score the viral potential of this video clip on 4 dimensions.
Return JSON: { "hook": 0-25, "engagement": 0-25, "flow": 0-25, "trend": 0-25, "total": 0-100, "tips": string[] }
hook = attention grab in first 3 sec, engagement = audience interaction potential,
flow = narrative coherence, trend = alignment with current trends.`;

    case 'title_generation':
      return `Generate a catchy Russian-language title for a short video clip.
Return JSON: { "title": string, "alternatives": string[] }
Make it attention-grabbing, under 60 characters, use emotional hooks.`;

    case 'cta_suggestion':
      return `Suggest a call-to-action for this video clip based on the course context.
Return JSON: { "text": string, "position": "end" | "overlay", "duration": number }
Keep it natural in Russian, not pushy, 3-8 words.`;

    default:
      return 'You are a helpful AI assistant. Return JSON output.';
  }
}

worker.on('failed', (job, err) => {
  logger.error({ event: 'llm_job_failed', jobId: job?.id, task: job?.data?.task, error: err.message });
});

export default worker;
