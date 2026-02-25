import { z } from 'zod';
import type { ViralityScore } from '@clipmaker/types';

// --- Zod Schemas (exported for testing) ---

export const MomentResponseSchema = z.object({
  moments: z.array(z.object({
    start: z.number().min(0),
    end: z.number().min(0),
    title: z.string().min(1).max(100),
    reason: z.string().min(1).max(500),
    hook_strength: z.number().min(0).max(25),
  })).min(1).max(15),
});

export const ViralityResponseSchema = z.object({
  hook: z.number().min(0).max(25),
  engagement: z.number().min(0).max(25),
  flow: z.number().min(0).max(25),
  trend: z.number().min(0).max(25),
  total: z.number().min(0).max(100),
  tips: z.array(z.string()).min(1).max(3),
});

export const TitleResponseSchema = z.object({
  title: z.string().min(1).max(60),
  alternatives: z.array(z.string().max(60)).max(3),
});

export const CtaResponseSchema = z.object({
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

export const MomentSelectionInputSchema = z.object({
  fullText: z.string(),
  tokenCount: z.number().int().min(0),
  planId: z.string().min(1),
  videoDurationSeconds: z.number().positive(),
});

export const TranscriptSegmentSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string(),
});

// --- Types ---

export type MomentCandidate = {
  start: number;
  end: number;
  title: string;
  reason: string;
  hookStrength: number;
};

export type EnrichedMoment = {
  moment: MomentCandidate;
  viralityScore: ViralityScore;
  title: string;
  cta: { text: string; position: 'end' | 'overlay'; duration: number } | null;
  subtitleSegments: Array<{ start: number; end: number; text: string }>;
};

// --- Constants ---

export const LLM_COST_CAP_KOPECKS = 1000; // 10₽ safety valve
export const MAX_TRANSCRIPT_TOKENS = 200_000;
export const MAX_CLIPS_PER_PLAN: Record<string, number> = {
  free: 3,
  start: 10,
  pro: 100,
  business: 100,
};

// --- Pure Functions ---

export function getMaxClipsForPlan(planId: string): number {
  return MAX_CLIPS_PER_PLAN[planId] ?? 3;
}

export function safeJsonParse(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function validateMoments(moments: MomentCandidate[], videoDurationSeconds: number): MomentCandidate[] {
  return moments.map((m) => {
    const moment = { ...m };
    moment.start = Math.max(0, moment.start);
    moment.end = Math.min(videoDurationSeconds, moment.end);

    const duration = moment.end - moment.start;

    if (duration < 15) {
      moment.end = moment.start + 15;
    }
    if (moment.end - moment.start > 60) {
      moment.end = moment.start + 60;
    }
    if (moment.end > videoDurationSeconds) {
      moment.end = videoDurationSeconds;
      moment.start = Math.max(0, moment.end - 15);
    }

    // Final safety: if video is too short for a 15s clip, use whatever is available
    if (moment.end - moment.start < 15 && videoDurationSeconds < 15) {
      moment.start = 0;
      moment.end = videoDurationSeconds;
    }

    return moment;
  });
}

export function deduplicateMoments(moments: MomentCandidate[]): MomentCandidate[] {
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

export function deduplicateTitles(moments: EnrichedMoment[]): EnrichedMoment[] {
  const seenTitles = new Set<string>();

  return moments.map((item) => {
    const copy = { ...item };
    if (seenTitles.has(copy.title)) {
      let suffix = 2;
      while (seenTitles.has(`${copy.title} — Ч.${suffix}`)) {
        suffix++;
      }
      copy.title = `${copy.title} — Ч.${suffix}`;
    }
    seenTitles.add(copy.title);
    return copy;
  });
}

export function generateFallbackMoments(videoDurationSeconds: number, count: number): MomentCandidate[] {
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

export function truncateTranscript(fullText: string, maxTokens: number): string {
  // ~2.5 tokens per word for Russian text
  const words = fullText.split(/\s+/);
  const maxWords = Math.floor(maxTokens / 2.5);
  if (words.length <= maxWords) return fullText;
  return words.slice(0, maxWords).join(' ');
}
