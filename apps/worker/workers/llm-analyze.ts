import { Worker } from 'bullmq';
import pMap from 'p-map';
import type { LLMJobData, TranscriptSegment, ViralityScore, ByokKeys } from '@clipmaker/types';
import { QUEUE_NAMES, DEFAULT_JOB_OPTIONS } from '@clipmaker/queue';
import { createQueue, getRedisConnection } from '@clipmaker/queue/src/queues';
import { prisma, type Prisma } from '@clipmaker/db';
import { LLMRouter } from '../lib/llm-router';
import { createLogger } from '../lib/logger';
import { peekByokKey, clearByokKeys } from '../lib/byok-cache';
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
import {
  MomentResponseSchema,
  ViralityResponseSchema,
  TitleResponseSchema,
  CtaResponseSchema,
  MomentSelectionInputSchema,
  TranscriptSegmentSchema,
  LLM_COST_CAP_KOPECKS,
  MAX_TRANSCRIPT_TOKENS,
  safeJsonParse,
  validateMoments,
  deduplicateMoments,
  deduplicateTitles,
  generateFallbackMoments,
  getMaxClipsForPlan,
  truncateTranscript,
  type MomentCandidate,
  type EnrichedMoment,
} from './llm-analyze-utils';

const logger = createLogger('worker-llm');

// --- Router (fail-fast on missing API keys) ---

const cloudruApiKey = process.env.CLOUDRU_API_KEY;
if (!cloudruApiKey && !process.env.GEMINI_API_KEY) {
  throw new Error('At least one LLM API key required: CLOUDRU_API_KEY or GEMINI_API_KEY');
}

const router = new LLMRouter(
  cloudruApiKey,
  {
    gemini: process.env.GEMINI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  },
);

// --- Main Handler ---

async function handleMomentSelection(jobData: LLMJobData): Promise<void> {
  const { videoId, strategy } = jobData;

  // C3: Validate job input with Zod instead of unsafe cast
  const inputResult = MomentSelectionInputSchema.safeParse(jobData.input);
  if (!inputResult.success) {
    throw new Error(`Invalid job input: ${inputResult.error.message}`);
  }
  const { fullText: rawFullText, tokenCount, planId, videoDurationSeconds } = inputResult.data;

  // M9: Truncate transcript if too long
  const fullText = truncateTranscript(rawFullText, MAX_TRANSCRIPT_TOKENS);

  let totalLlmCostKopecks = 0;

  // M15: Fetch video with user and transcript in a single query
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: { user: true, transcript: true },
  });
  if (!video || video.status !== 'analyzing') {
    throw new Error(`Invalid video state: ${video?.status ?? 'not found'}`);
  }
  if (!video.user) throw new Error('User not found');
  if (!video.transcript) throw new Error('Transcript not found');

  const user = video.user;
  const transcript = video.transcript;

  // BYOK: Load user's API keys from Redis cache (Global strategy only)
  let byokKeys: ByokKeys | undefined;
  if (strategy === 'global') {
    const [geminiKey, anthropicKey] = await Promise.all([
      peekByokKey(user.id, 'gemini'),
      peekByokKey(user.id, 'anthropic'),
    ]);
    if (geminiKey || anthropicKey) {
      byokKeys = {};
      if (geminiKey) byokKeys.gemini = geminiKey;
      if (anthropicKey) byokKeys.anthropic = anthropicKey;
      logger.info({
        event: 'llm_byok_keys_loaded',
        videoId,
        providers: Object.keys(byokKeys),
      });
    }
  }

  // C3: Validate transcript segments with Zod
  const rawSegments = Array.isArray(transcript.segments) ? transcript.segments : [];
  const segments = rawSegments
    .map((s) => TranscriptSegmentSchema.safeParse(s))
    .filter((r): r is { success: true; data: TranscriptSegment } => r.success)
    .map((r) => r.data);

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
      byokKeys,
    );
    totalLlmCostKopecks += response.costKopecks;

    let parsed = MomentResponseSchema.safeParse(safeJsonParse(response.content));

    // Retry once on parse failure
    if (!parsed.success) {
      // C4: Pre-check cost before retry
      if (totalLlmCostKopecks > LLM_COST_CAP_KOPECKS) {
        await markVideoFailed(video.id, totalLlmCostKopecks);
        throw new Error('LLM cost cap exceeded');
      }

      logger.warn({ event: 'llm_moment_parse_failed', videoId, error: parsed.error.message });
      const retryResponse = await router.complete(
        context,
        [
          { role: 'system', content: MOMENT_SELECTION_PROMPT },
          { role: 'user', content: buildMomentSelectionInput(fullText, videoDurationSeconds) },
        ],
        { jsonMode: true, temperature: 0.5 },
        byokKeys,
      );
      totalLlmCostKopecks += retryResponse.costKopecks;
      parsed = MomentResponseSchema.safeParse(safeJsonParse(retryResponse.content));

      if (!parsed.success) {
        // M6: Instead of throwing, use fallback moments (the schema requires .min(1)
        // so this handles the case where parse keeps failing)
        logger.warn({ event: 'llm_fallback_moments', videoId, reason: 'Parse failed after retry' });
        moments = generateFallbackMoments(videoDurationSeconds, 3);
      } else {
        moments = parsed.data.moments.map((m) => ({
          start: m.start,
          end: m.end,
          title: m.title,
          reason: m.reason,
          hookStrength: m.hook_strength,
        }));
      }
    } else {
      moments = parsed.data.moments.map((m) => ({
        start: m.start,
        end: m.end,
        title: m.title,
        reason: m.reason,
        hookStrength: m.hook_strength,
      }));
    }

    logger.info({
      event: 'llm_moment_selection',
      videoId,
      momentsFound: moments.length,
      costKopecks: totalLlmCostKopecks,
    });
  }

  // 4. Validate and deduplicate moments
  moments = validateMoments(moments, videoDurationSeconds);
  moments = deduplicateMoments(moments);

  // C4: Pre-check cost cap before enrichment
  if (totalLlmCostKopecks > LLM_COST_CAP_KOPECKS) {
    await markVideoFailed(video.id, totalLlmCostKopecks);
    throw new Error('LLM cost cap exceeded');
  }

  // 5. Score, title, CTA in parallel (3 moments concurrently)
  const enrichedMoments = await pMap(
    moments,
    async (moment): Promise<EnrichedMoment> => {
      // C4: Pre-check before starting this moment's LLM calls
      if (totalLlmCostKopecks > LLM_COST_CAP_KOPECKS) {
        throw new Error('LLM cost cap exceeded');
      }

      // Extract subtitle segments for this moment
      const clipSegments = segments
        .filter((s) => s.start >= moment.start && s.end <= moment.end)
        .map((s) => ({ start: s.start - moment.start, end: s.end - moment.start, text: s.text }));

      const momentText = clipSegments.map((s) => s.text).join(' ') || moment.title;

      // Run scoring + title + CTA in parallel
      const [scoreResult, titleResult, ctaResult] = await Promise.all([
        scoreVirality(strategy, momentText, moment, planId, byokKeys),
        generateTitle(strategy, momentText, moment, byokKeys),
        generateCta(strategy, momentText, byokKeys),
      ]);

      totalLlmCostKopecks += scoreResult.costKopecks + titleResult.costKopecks + ctaResult.costKopecks;

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
  // M11: Use WHERE status='analyzing' to prevent TOCTOU race
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
      where: { id: video.id, status: 'analyzing' },
      data: { status: 'generating_clips' },
    }),
    prisma.usageRecord.updateMany({
      where: { videoId: video.id, userId: user.id },
      data: { llmCostKopecks: totalLlmCostKopecks },
    }),
  ]);

  // 8. Enqueue render jobs (M8: use addBulk instead of sequential adds)
  const createdClips = transactionResult.slice(0, clipsToCreate.length) as Array<{
    id: string;
    startTime: number;
    endTime: number;
    format: string;
    subtitleSegments: unknown;
    cta: unknown;
  }>;

  const renderQueue = createQueue(QUEUE_NAMES.VIDEO_RENDER);
  await renderQueue.addBulk(
    createdClips.map((clip) => ({
      name: 'render',
      data: {
        clipId: clip.id,
        videoId: video.id,
        sourceFilePath: video.filePath,
        startTime: clip.startTime,
        endTime: clip.endTime,
        format: clip.format,
        subtitleSegments: clip.subtitleSegments,
        cta: clip.cta,
        watermark: planId === 'free',
      },
      opts: DEFAULT_JOB_OPTIONS,
    })),
  );

  // BYOK: Clean up cached keys after pipeline completes
  if (byokKeys) {
    await clearByokKeys(user.id).catch((err) => {
      logger.warn({ event: 'byok_cleanup_failed', userId: user.id, error: String(err) });
    });
  }

  logger.info({
    event: 'llm_analyze_complete',
    videoId,
    clips: clipsToCreate.length,
    costKopecks: totalLlmCostKopecks,
    usedByok: !!byokKeys,
  });
}

// --- Helpers: cost cap ---

async function markVideoFailed(videoId: string, costKopecks: number): Promise<void> {
  logger.error({ event: 'llm_cost_cap_exceeded', videoId, costKopecks });
  await prisma.video.update({ where: { id: videoId }, data: { status: 'failed' } });
}

// --- Helpers: LLM calls ---

async function scoreVirality(
  strategy: 'ru' | 'global',
  momentText: string,
  moment: MomentCandidate,
  planId: string,
  byokKeys?: ByokKeys,
): Promise<{ score: ViralityScore; costKopecks: number }> {
  const context = { task: 'virality_scoring' as const, strategy, planId };
  const response = await router.complete(
    context,
    [
      { role: 'system', content: VIRALITY_SCORING_PROMPT },
      { role: 'user', content: buildScoringInput(momentText) },
    ],
    { jsonMode: true, temperature: 0.3 },
    byokKeys,
  );

  const parsed = ViralityResponseSchema.safeParse(safeJsonParse(response.content));

  if (!parsed.success) {
    logger.warn({ event: 'llm_scoring_parse_failed', error: parsed.error.message });
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
  score.total = score.hook + score.engagement + score.flow + score.trend;

  return { score, costKopecks: response.costKopecks };
}

async function generateTitle(
  strategy: 'ru' | 'global',
  momentText: string,
  moment: MomentCandidate,
  byokKeys?: ByokKeys,
): Promise<{ title: string; costKopecks: number }> {
  const context = { task: 'title_generation' as const, strategy };
  const response = await router.complete(
    context,
    [
      { role: 'system', content: TITLE_GENERATION_PROMPT },
      { role: 'user', content: buildTitleInput(momentText) },
    ],
    { jsonMode: true, temperature: 0.8 },
    byokKeys,
  );

  const parsed = TitleResponseSchema.safeParse(safeJsonParse(response.content));

  if (!parsed.success) {
    return { title: moment.title.slice(0, 60), costKopecks: response.costKopecks };
  }

  let title = parsed.data.title;
  if (title.length > 60) {
    title = title.slice(0, 57) + '...';
  }

  return { title, costKopecks: response.costKopecks };
}

async function generateCta(
  strategy: 'ru' | 'global',
  momentText: string,
  byokKeys?: ByokKeys,
): Promise<{ cta: { text: string; position: 'end' | 'overlay'; duration: number } | null; costKopecks: number }> {
  const context = { task: 'cta_suggestion' as const, strategy };
  const response = await router.complete(
    context,
    [
      { role: 'system', content: CTA_SUGGESTION_PROMPT },
      { role: 'user', content: buildCtaInput(momentText) },
    ],
    { jsonMode: true, temperature: 0.6 },
    byokKeys,
  );

  const parsed = CtaResponseSchema.safeParse(safeJsonParse(response.content));

  if (!parsed.success) {
    return { cta: null, costKopecks: response.costKopecks };
  }

  return { cta: parsed.data, costKopecks: response.costKopecks };
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
  if (!job) {
    logger.error({ event: 'llm_job_failed', error: err.message });
    return;
  }

  const videoId = job.data?.videoId;
  logger.error({ event: 'llm_job_failed', jobId: job.id, task: job.data?.task, error: err.message });

  if (videoId && job.attemptsMade === job.opts?.attempts) {
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
