import { Worker } from 'bullmq';
import { z } from 'zod';
import pMap from 'p-map';
import type { LLMJobData, TranscriptSegment, ViralityScore } from '@clipmaker/types';
import { QUEUE_NAMES, DEFAULT_JOB_OPTIONS } from '@clipmaker/queue';
import { createQueue, getRedisConnection } from '@clipmaker/queue/src/queues';
import { prisma, type Prisma } from '@clipmaker/db';
import { LLMRouter } from '../lib/llm-router';
import { createLogger } from '../lib/logger';
import {
  SYSTEM_PROMPT as MOMENT_SELECTION_PROMPT,
  buildUserMessage as buildMomentSelectionInput,
} from '../lib/prompts/moment-selection';
import {
  SYSTEM_PROMPT as VIRALITY_SCORING_PROMPT,
  buildUserMessage as buildScoringInput,
} from '../lib/prompts/virality-scoring';
import {
  SYSTEM_PROMPT as TITLE_GENERATION_PROMPT,
  buildUserMessage as buildTitleInput,
} from '../lib/prompts/title-generation';
import {
  SYSTEM_PROMPT as CTA_SUGGESTION_PROMPT,
  buildUserMessage as buildCtaInput,
} from '../lib/prompts/cta-suggestion';

const logger = createLogger('worker-llm');

const LLM_COST_CAP_KOPECKS = 1000; // 10₽ safety valve

// --- Zod Schemas ---

const MomentResponseSchema = z.object({
  moments: z.array(z.object({
    start: z.number().min(0),
    end: z.number().min(0),
    title: z.string().min(1).max(100),
    reason: z.string().min(1).max(500),
    hook_strength: z.number().min(0).max(25),
  })).min(1).max(15),
});

const ViralityResponseSchema = z.object({
  hook: z.number().min(0).max(25),
  engagement: z.number().min(0).max(25),
  flow: z.number().min(0).max(25),
  trend: z.number().min(0).max(25),
  total: z.number().min(0).max(100),
  tips: z.array(z.string()).min(1).max(3),
});

const TitleResponseSchema = z.object({
  title: z.string().min(1).max(60),
  alternatives: z.array(z.string().max(60)).max(3),
});

const CtaResponseSchema = z.object({
  text: z.string().min(1).max(50).refine(
    (v) => {
      const words = v.trim().split(/\s+/).length;
      return words >= 3 && words <= 8;
    },
    { message: 'CTA text must be 3-8 space-separated words' },
  ),
  position: z.enum(['end', 'overlay']),
  duration: z.number().int().min(3).max(5),
});

// --- Types ---

type MomentCandidate = {
  start: number;
  end: number;
  title: string;
  reason: string;
  hookStrength: number;
};

type EnrichedMoment = {
  moment: MomentCandidate;
  viralityScore: ViralityScore;
  title: string;
  cta: { text: string; position: 'end' | 'overlay'; duration: number } | null;
  subtitleSegments: Array<{ start: number; end: number; text: string }>;
};

type MomentSelectionInput = {
  fullText: string;
  tokenCount: number;
  planId: string;
  videoDurationSeconds: number;
};

// --- Router ---

const router = new LLMRouter(
  process.env.CLOUDRU_API_KEY,
  {
    gemini: process.env.GEMINI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  },
);

// --- Main Handler ---

async function handleMomentSelection(jobData: LLMJobData): Promise<void> {
  const { videoId, strategy } = jobData;
  const input = jobData.input as MomentSelectionInput;
  const { fullText, tokenCount, planId, videoDurationSeconds } = input;

  let totalLlmCostKopecks = 0;

  // 1. Validate
  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video || video.status !== 'analyzing') {
    throw new Error(`Invalid video state: ${video?.status ?? 'not found'}`);
  }
  const user = await prisma.user.findUnique({ where: { id: video.userId } });
  if (!user) throw new Error('User not found');
  const transcript = await prisma.transcript.findUnique({ where: { videoId } });
  if (!transcript) throw new Error('Transcript not found');

  const segments = transcript.segments as unknown as TranscriptSegment[];

  // 1b. Early exit: empty/short transcript
  const wordCount = fullText.trim().split(/\s+/).filter(Boolean).length;
  let moments: MomentCandidate[];

  if (!fullText.trim() || wordCount < 100) {
    logger.info({ event: 'llm_short_transcript', videoId, wordCount });
    const midPoint = Math.floor(videoDurationSeconds / 2);
    const clipStart = Math.max(0, midPoint - 30);
    const clipEnd = Math.min(videoDurationSeconds, clipStart + 60);
    moments = [{
      start: clipStart,
      end: clipEnd,
      title: 'Основной момент',
      reason: 'Auto-generated (short transcript)',
      hookStrength: 10,
    }];
  } else {
    // 2. Select moments via LLM
    const context = { task: 'moment_selection' as const, strategy, tokenCount, planId };

    const response = await router.complete(
      context,
      [
        { role: 'system', content: MOMENT_SELECTION_PROMPT },
        { role: 'user', content: buildMomentSelectionInput(fullText, videoDurationSeconds) },
      ],
      { jsonMode: true, temperature: 0.7 },
    );
    totalLlmCostKopecks += response.costKopecks;

    let parsed = MomentResponseSchema.safeParse(safeJsonParse(response.content));

    // Retry once on parse failure
    if (!parsed.success) {
      logger.warn({ event: 'llm_moment_parse_failed', videoId, error: parsed.error.message });
      const retryResponse = await router.complete(
        context,
        [
          { role: 'system', content: MOMENT_SELECTION_PROMPT },
          { role: 'user', content: buildMomentSelectionInput(fullText, videoDurationSeconds) },
        ],
        { jsonMode: true, temperature: 0.5 },
      );
      totalLlmCostKopecks += retryResponse.costKopecks;
      parsed = MomentResponseSchema.safeParse(safeJsonParse(retryResponse.content));

      if (!parsed.success) {
        throw new Error('Failed to parse moment selection response after retry');
      }
    }

    moments = parsed.data.moments.map((m) => ({
      start: m.start,
      end: m.end,
      title: m.title,
      reason: m.reason,
      hookStrength: m.hook_strength,
    }));

    logger.info({
      event: 'llm_moment_selection',
      videoId,
      momentsFound: moments.length,
      costKopecks: totalLlmCostKopecks,
    });

    // 3. Handle empty results — retry with tier+1
    if (moments.length === 0) {
      const retryContext = { ...context, previousScore: 0 };
      const retryResponse = await router.complete(
        retryContext,
        [
          { role: 'system', content: MOMENT_SELECTION_PROMPT },
          { role: 'user', content: buildMomentSelectionInput(fullText, videoDurationSeconds) },
        ],
        { jsonMode: true, temperature: 0.7 },
      );
      totalLlmCostKopecks += retryResponse.costKopecks;

      const retryParsed = MomentResponseSchema.safeParse(safeJsonParse(retryResponse.content));

      if (retryParsed.success && retryParsed.data.moments.length > 0) {
        moments = retryParsed.data.moments.map((m) => ({
          start: m.start,
          end: m.end,
          title: m.title,
          reason: m.reason,
          hookStrength: m.hook_strength,
        }));
      } else {
        logger.warn({ event: 'llm_fallback_moments', videoId, reason: 'No moments after retry' });
        moments = generateFallbackMoments(videoDurationSeconds, 3);
      }
    }
  }

  // 4. Validate and deduplicate moments
  moments = validateMoments(moments, videoDurationSeconds);
  moments = deduplicateMoments(moments);

  // 4b. Cost cap check
  if (totalLlmCostKopecks > LLM_COST_CAP_KOPECKS) {
    logger.error({ event: 'llm_cost_cap_exceeded', videoId, costKopecks: totalLlmCostKopecks });
    await prisma.video.update({ where: { id: video.id }, data: { status: 'failed' } });
    throw new Error('LLM cost cap exceeded');
  }

  // 5. Score, title, CTA in parallel (3 moments concurrently)
  const enrichedMoments = await pMap(
    moments,
    async (moment): Promise<EnrichedMoment> => {
      // Extract subtitle segments for this moment
      const clipSegments = segments
        .filter((s) => s.start >= moment.start && s.end <= moment.end)
        .map((s) => ({ start: s.start - moment.start, end: s.end - moment.start, text: s.text }));

      const momentText = clipSegments.map((s) => s.text).join(' ') || moment.title;

      // Run scoring + title + CTA in parallel
      const [scoreResult, titleResult, ctaResult] = await Promise.all([
        scoreVirality(strategy, momentText, moment, planId),
        generateTitle(strategy, momentText, moment),
        generateCta(strategy, momentText),
      ]);

      totalLlmCostKopecks += scoreResult.costKopecks + titleResult.costKopecks + ctaResult.costKopecks;

      // Cost cap check per iteration
      if (totalLlmCostKopecks > LLM_COST_CAP_KOPECKS) {
        logger.error({ event: 'llm_cost_cap_exceeded', videoId, costKopecks: totalLlmCostKopecks });
        throw new Error('LLM cost cap exceeded');
      }

      return {
        moment,
        viralityScore: scoreResult.score,
        title: titleResult.title,
        cta: ctaResult.cta,
        subtitleSegments: clipSegments,
      };
    },
    { concurrency: 3 },
  );

  // 6. Deduplicate titles and apply plan limits
  const deduped = deduplicateTitles(enrichedMoments);
  deduped.sort((a, b) => b.viralityScore.total - a.viralityScore.total);

  const maxClips = getMaxClipsForPlan(planId);
  const clipsToCreate = deduped.slice(0, maxClips);

  // 7. Create clips + update video (transaction)
  const transactionResult = await prisma.$transaction([
    ...clipsToCreate.map((item) =>
      prisma.clip.create({
        data: {
          videoId: video.id,
          userId: user.id,
          title: item.title,
          startTime: item.moment.start,
          endTime: item.moment.end,
          duration: item.moment.end - item.moment.start,
          viralityScore: item.viralityScore as unknown as Prisma.JsonObject,
          subtitleSegments: item.subtitleSegments as unknown as Prisma.JsonArray,
          cta: item.cta ? (item.cta as unknown as Prisma.JsonObject) : undefined,
          format: 'portrait',
          status: 'pending',
        },
      }),
    ),
    prisma.video.update({
      where: { id: video.id },
      data: { status: 'generating_clips' },
    }),
    prisma.usageRecord.updateMany({
      where: { videoId: video.id, userId: user.id },
      data: { llmCostKopecks: totalLlmCostKopecks },
    }),
  ]);

  // 8. Enqueue render jobs
  const createdClips = transactionResult.slice(0, clipsToCreate.length);
  const renderQueue = createQueue(QUEUE_NAMES.VIDEO_RENDER);

  for (const clip of createdClips) {
    const typedClip = clip as { id: string; startTime: number; endTime: number; format: string; subtitleSegments: unknown; cta: unknown };
    await renderQueue.add('render', {
      clipId: typedClip.id,
      videoId: video.id,
      sourceFilePath: video.filePath,
      startTime: typedClip.startTime,
      endTime: typedClip.endTime,
      format: typedClip.format,
      subtitleSegments: typedClip.subtitleSegments,
      cta: typedClip.cta,
      watermark: planId === 'free',
    }, DEFAULT_JOB_OPTIONS);
  }

  logger.info({
    event: 'llm_analyze_complete',
    videoId,
    clips: clipsToCreate.length,
    costKopecks: totalLlmCostKopecks,
  });
}

// --- Helpers: LLM calls ---

async function scoreVirality(
  strategy: 'ru' | 'global',
  momentText: string,
  moment: MomentCandidate,
  planId: string,
): Promise<{ score: ViralityScore; costKopecks: number }> {
  const context = { task: 'virality_scoring' as const, strategy, planId };
  const response = await router.complete(
    context,
    [
      { role: 'system', content: VIRALITY_SCORING_PROMPT },
      { role: 'user', content: buildScoringInput(momentText) },
    ],
    { jsonMode: true, temperature: 0.3 },
  );

  const parsed = ViralityResponseSchema.safeParse(safeJsonParse(response.content));

  if (!parsed.success) {
    logger.warn({ event: 'llm_scoring_parse_failed', error: parsed.error.message });
    // Fallback: derive score from moment's hookStrength
    return {
      score: {
        total: moment.hookStrength * 4,
        hook: moment.hookStrength,
        engagement: moment.hookStrength,
        flow: moment.hookStrength,
        trend: moment.hookStrength,
        tips: [],
      },
      costKopecks: response.costKopecks,
    };
  }

  const score = parsed.data;
  // Recalculate total to ensure consistency
  score.total = score.hook + score.engagement + score.flow + score.trend;

  return { score, costKopecks: response.costKopecks };
}

async function generateTitle(
  strategy: 'ru' | 'global',
  momentText: string,
  moment: MomentCandidate,
): Promise<{ title: string; costKopecks: number }> {
  const context = { task: 'title_generation' as const, strategy };
  const response = await router.complete(
    context,
    [
      { role: 'system', content: TITLE_GENERATION_PROMPT },
      { role: 'user', content: buildTitleInput(momentText) },
    ],
    { jsonMode: true, temperature: 0.8 },
  );

  const parsed = TitleResponseSchema.safeParse(safeJsonParse(response.content));

  if (!parsed.success) {
    // Fallback: use preliminary title from moment selection
    return { title: moment.title.slice(0, 60), costKopecks: response.costKopecks };
  }

  let title = parsed.data.title;
  // Enforce 60 char limit
  if (title.length > 60) {
    title = title.slice(0, 57) + '...';
  }

  return { title, costKopecks: response.costKopecks };
}

async function generateCta(
  strategy: 'ru' | 'global',
  momentText: string,
): Promise<{ cta: { text: string; position: 'end' | 'overlay'; duration: number } | null; costKopecks: number }> {
  const context = { task: 'cta_suggestion' as const, strategy };
  const response = await router.complete(
    context,
    [
      { role: 'system', content: CTA_SUGGESTION_PROMPT },
      { role: 'user', content: buildCtaInput(momentText) },
    ],
    { jsonMode: true, temperature: 0.6 },
  );

  const parsed = CtaResponseSchema.safeParse(safeJsonParse(response.content));

  if (!parsed.success) {
    return { cta: null, costKopecks: response.costKopecks };
  }

  return { cta: parsed.data, costKopecks: response.costKopecks };
}

// --- Helpers: Pure functions ---

function validateMoments(moments: MomentCandidate[], videoDurationSeconds: number): MomentCandidate[] {
  return moments.map((m) => {
    const moment = { ...m };
    moment.start = Math.max(0, moment.start);
    moment.end = Math.min(videoDurationSeconds, moment.end);

    if (moment.end - moment.start < 15) {
      moment.end = moment.start + 15;
    }
    if (moment.end - moment.start > 60) {
      moment.end = moment.start + 60;
    }
    if (moment.end > videoDurationSeconds) {
      moment.end = videoDurationSeconds;
      moment.start = Math.max(0, moment.end - 30);
    }

    return moment;
  });
}

function deduplicateMoments(moments: MomentCandidate[]): MomentCandidate[] {
  const sorted = [...moments].sort((a, b) => b.hookStrength - a.hookStrength);
  const result: MomentCandidate[] = [];

  for (const moment of sorted) {
    const hasOverlap = result.some((existing) => {
      const overlapStart = Math.max(moment.start, existing.start);
      const overlapEnd = Math.min(moment.end, existing.end);
      const overlapDuration = Math.max(0, overlapEnd - overlapStart);
      const momentDuration = moment.end - moment.start;
      return momentDuration > 0 && overlapDuration / momentDuration > 0.5;
    });

    if (!hasOverlap) {
      result.push(moment);
    }
  }

  return result;
}

function deduplicateTitles(moments: EnrichedMoment[]): EnrichedMoment[] {
  const seenTitles = new Set<string>();

  for (const item of moments) {
    if (seenTitles.has(item.title)) {
      let suffix = 2;
      while (seenTitles.has(`${item.title} — Ч.${suffix}`)) {
        suffix++;
      }
      item.title = `${item.title} — Ч.${suffix}`;
    }
    seenTitles.add(item.title);
  }

  return moments;
}

function generateFallbackMoments(videoDurationSeconds: number, count: number): MomentCandidate[] {
  const clipDuration = 30;
  const spacing = (videoDurationSeconds - clipDuration) / (count + 1);
  const moments: MomentCandidate[] = [];

  for (let i = 1; i <= count; i++) {
    const start = Math.floor(spacing * i);
    const end = start + clipDuration;
    moments.push({
      start,
      end,
      title: `Момент ${i}`,
      reason: 'Auto-generated fallback',
      hookStrength: 10,
    });
  }

  return moments;
}

function getMaxClipsForPlan(planId: string): number {
  switch (planId) {
    case 'free': return 3;
    case 'start': return 10;
    case 'pro': return Infinity;
    case 'business': return Infinity;
    default: return 3;
  }
}

function safeJsonParse(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// --- Worker ---

const worker = new Worker<LLMJobData>(
  QUEUE_NAMES.LLM,
  async (job) => {
    const { task, videoId } = job.data;

    logger.info({ event: 'llm_analyze_start', videoId, task });

    switch (task) {
      case 'moment_selection':
        return handleMomentSelection(job.data);
      default:
        throw new Error(`Unknown task: ${task}`);
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
  },
);

worker.on('failed', async (job, err) => {
  const videoId = job?.data?.videoId;
  logger.error({ event: 'llm_job_failed', jobId: job?.id, task: job?.data?.task, error: err.message });

  // Set video to failed after all retries exhausted
  if (videoId && job?.attemptsMade === job?.opts?.attempts) {
    try {
      await prisma.video.update({
        where: { id: videoId },
        data: { status: 'failed' },
      });
      logger.info({ event: 'llm_video_marked_failed', videoId });
    } catch (updateErr) {
      logger.warn({ event: 'llm_status_update_failed', videoId, error: updateErr });
    }
  }
});

export default worker;
