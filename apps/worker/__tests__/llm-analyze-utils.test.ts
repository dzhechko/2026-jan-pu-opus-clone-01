import { describe, it, expect } from 'vitest';
import {
  validateMoments,
  deduplicateMoments,
  deduplicateTitles,
  generateFallbackMoments,
  getMaxClipsForPlan,
  safeJsonParse,
  truncateTranscript,
  MomentResponseSchema,
  ViralityResponseSchema,
  TitleResponseSchema,
  CtaResponseSchema,
  MomentSelectionInputSchema,
  TranscriptSegmentSchema,
  type MomentCandidate,
  type EnrichedMoment,
} from '../workers/llm-analyze-utils';
import type { ViralityScore } from '@clipmaker/types';

// --- getMaxClipsForPlan ---

describe('getMaxClipsForPlan', () => {
  it('returns 3 for free plan', () => {
    expect(getMaxClipsForPlan('free')).toBe(3);
  });

  it('returns 10 for start plan', () => {
    expect(getMaxClipsForPlan('start')).toBe(10);
  });

  it('returns 100 for pro plan', () => {
    expect(getMaxClipsForPlan('pro')).toBe(100);
  });

  it('returns 100 for business plan', () => {
    expect(getMaxClipsForPlan('business')).toBe(100);
  });

  it('returns 3 for unknown plan', () => {
    expect(getMaxClipsForPlan('unknown')).toBe(3);
  });

  it('returns a finite number for all known plans', () => {
    for (const plan of ['free', 'start', 'pro', 'business']) {
      expect(Number.isFinite(getMaxClipsForPlan(plan))).toBe(true);
    }
  });
});

// --- safeJsonParse ---

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns null for invalid JSON', () => {
    expect(safeJsonParse('not json')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(safeJsonParse('')).toBeNull();
  });

  it('parses arrays', () => {
    expect(safeJsonParse('[1,2,3]')).toEqual([1, 2, 3]);
  });
});

// --- validateMoments ---

describe('validateMoments', () => {
  const videoDuration = 300; // 5 minutes

  it('clamps start to >= 0', () => {
    const moments: MomentCandidate[] = [
      { start: -10, end: 30, title: 'test', reason: 'r', hookStrength: 10 },
    ];
    const result = validateMoments(moments, videoDuration);
    expect(result[0].start).toBe(0);
  });

  it('clamps end to <= videoDuration', () => {
    const moments: MomentCandidate[] = [
      { start: 280, end: 400, title: 'test', reason: 'r', hookStrength: 10 },
    ];
    const result = validateMoments(moments, videoDuration);
    expect(result[0].end).toBeLessThanOrEqual(videoDuration);
  });

  it('enforces minimum 15s duration', () => {
    const moments: MomentCandidate[] = [
      { start: 100, end: 105, title: 'short', reason: 'r', hookStrength: 10 },
    ];
    const result = validateMoments(moments, videoDuration);
    expect(result[0].end - result[0].start).toBeGreaterThanOrEqual(15);
  });

  it('enforces maximum 60s duration', () => {
    const moments: MomentCandidate[] = [
      { start: 10, end: 100, title: 'long', reason: 'r', hookStrength: 10 },
    ];
    const result = validateMoments(moments, videoDuration);
    expect(result[0].end - result[0].start).toBeLessThanOrEqual(60);
  });

  it('handles clip near end of video', () => {
    const moments: MomentCandidate[] = [
      { start: 295, end: 320, title: 'near end', reason: 'r', hookStrength: 10 },
    ];
    const result = validateMoments(moments, videoDuration);
    expect(result[0].end).toBeLessThanOrEqual(videoDuration);
    expect(result[0].start).toBeGreaterThanOrEqual(0);
    expect(result[0].end - result[0].start).toBeGreaterThanOrEqual(15);
  });

  it('handles very short video (< 15s)', () => {
    const moments: MomentCandidate[] = [
      { start: 0, end: 10, title: 'short video', reason: 'r', hookStrength: 10 },
    ];
    const result = validateMoments(moments, 10);
    expect(result[0].start).toBe(0);
    expect(result[0].end).toBe(10);
  });

  it('does not mutate original array', () => {
    const moments: MomentCandidate[] = [
      { start: -5, end: 500, title: 'test', reason: 'r', hookStrength: 10 },
    ];
    const original = { ...moments[0] };
    validateMoments(moments, videoDuration);
    expect(moments[0].start).toBe(original.start);
    expect(moments[0].end).toBe(original.end);
  });

  it('handles exact 2-minute video with multiple clips', () => {
    const duration = 120;
    const moments: MomentCandidate[] = [
      { start: 0, end: 30, title: 'm1', reason: 'r', hookStrength: 20 },
      { start: 50, end: 80, title: 'm2', reason: 'r', hookStrength: 15 },
      { start: 90, end: 120, title: 'm3', reason: 'r', hookStrength: 10 },
    ];
    const result = validateMoments(moments, duration);
    for (const m of result) {
      expect(m.start).toBeGreaterThanOrEqual(0);
      expect(m.end).toBeLessThanOrEqual(duration);
      expect(m.end - m.start).toBeGreaterThanOrEqual(15);
      expect(m.end - m.start).toBeLessThanOrEqual(60);
    }
  });
});

// --- deduplicateMoments ---

describe('deduplicateMoments', () => {
  it('removes moments with >50% overlap, keeping higher hookStrength', () => {
    const moments: MomentCandidate[] = [
      { start: 0, end: 30, title: 'weak', reason: 'r', hookStrength: 5 },
      { start: 5, end: 35, title: 'strong', reason: 'r', hookStrength: 20 },
    ];
    const result = deduplicateMoments(moments);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('strong');
  });

  it('keeps non-overlapping moments', () => {
    const moments: MomentCandidate[] = [
      { start: 0, end: 30, title: 'first', reason: 'r', hookStrength: 10 },
      { start: 60, end: 90, title: 'second', reason: 'r', hookStrength: 15 },
    ];
    const result = deduplicateMoments(moments);
    expect(result).toHaveLength(2);
  });

  it('keeps moments with exactly 50% overlap', () => {
    const moments: MomentCandidate[] = [
      { start: 0, end: 30, title: 'first', reason: 'r', hookStrength: 10 },
      { start: 15, end: 45, title: 'second', reason: 'r', hookStrength: 15 },
    ];
    const result = deduplicateMoments(moments);
    // 15s overlap / 30s duration = 50% — threshold is >, not >=
    expect(result).toHaveLength(2);
  });

  it('removes moments with >50% overlap', () => {
    const moments: MomentCandidate[] = [
      { start: 0, end: 30, title: 'first', reason: 'r', hookStrength: 10 },
      { start: 14, end: 44, title: 'second', reason: 'r', hookStrength: 5 },
    ];
    const result = deduplicateMoments(moments);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('first'); // higher hookStrength kept
  });

  it('handles empty array', () => {
    expect(deduplicateMoments([])).toEqual([]);
  });

  it('does not mutate input', () => {
    const moments: MomentCandidate[] = [
      { start: 0, end: 30, title: 'a', reason: 'r', hookStrength: 10 },
    ];
    deduplicateMoments(moments);
    expect(moments).toHaveLength(1);
  });
});

// --- deduplicateTitles ---

describe('deduplicateTitles', () => {
  const makeEnriched = (title: string): EnrichedMoment => ({
    moment: { start: 0, end: 30, title, reason: 'r', hookStrength: 10 },
    viralityScore: { total: 50, hook: 12, engagement: 13, flow: 12, trend: 13, tips: [] },
    title,
    cta: null,
    subtitleSegments: [],
  });

  it('appends suffix for duplicate titles', () => {
    const moments = [makeEnriched('Title'), makeEnriched('Title')];
    const result = deduplicateTitles(moments);
    expect(result[0].title).toBe('Title');
    expect(result[1].title).toBe('Title — Ч.2');
  });

  it('handles triple duplicates', () => {
    const moments = [makeEnriched('Test'), makeEnriched('Test'), makeEnriched('Test')];
    const result = deduplicateTitles(moments);
    expect(result[0].title).toBe('Test');
    expect(result[1].title).toBe('Test — Ч.2');
    expect(result[2].title).toBe('Test — Ч.3');
  });

  it('does not modify unique titles', () => {
    const moments = [makeEnriched('A'), makeEnriched('B'), makeEnriched('C')];
    const result = deduplicateTitles(moments);
    expect(result.map((m) => m.title)).toEqual(['A', 'B', 'C']);
  });

  it('does not mutate original objects', () => {
    const moments = [makeEnriched('Same'), makeEnriched('Same')];
    const origTitle = moments[1].title;
    deduplicateTitles(moments);
    expect(moments[1].title).toBe(origTitle);
  });
});

// --- generateFallbackMoments ---

describe('generateFallbackMoments', () => {
  it('creates requested number of moments', () => {
    const result = generateFallbackMoments(300, 3);
    expect(result).toHaveLength(3);
  });

  it('creates evenly spaced moments', () => {
    const result = generateFallbackMoments(300, 3);
    // spacing = (300 - 30) / 4 = 67.5
    for (const m of result) {
      expect(m.end - m.start).toBe(30);
    }
    // Check they don't overlap
    for (let i = 1; i < result.length; i++) {
      expect(result[i].start).toBeGreaterThan(result[i - 1].end);
    }
  });

  it('uses 30s clip duration', () => {
    const result = generateFallbackMoments(120, 2);
    for (const m of result) {
      expect(m.end - m.start).toBe(30);
    }
  });

  it('generates Russian titles', () => {
    const result = generateFallbackMoments(300, 3);
    expect(result[0].title).toBe('Момент 1');
    expect(result[1].title).toBe('Момент 2');
    expect(result[2].title).toBe('Момент 3');
  });

  it('sets hookStrength to 10', () => {
    const result = generateFallbackMoments(300, 1);
    expect(result[0].hookStrength).toBe(10);
  });
});

// --- truncateTranscript ---

describe('truncateTranscript', () => {
  it('returns full text when within limit', () => {
    const text = 'word '.repeat(100).trim();
    expect(truncateTranscript(text, 300)).toBe(text);
  });

  it('truncates when over limit', () => {
    const text = 'word '.repeat(1000).trim();
    // 200 max tokens / 2.5 = 80 max words
    const result = truncateTranscript(text, 200);
    const wordCount = result.split(/\s+/).length;
    expect(wordCount).toBeLessThanOrEqual(80);
  });

  it('handles empty text', () => {
    expect(truncateTranscript('', 1000)).toBe('');
  });
});

// --- Zod Schemas ---

describe('MomentResponseSchema', () => {
  it('validates correct response', () => {
    const valid = {
      moments: [{
        start: 10,
        end: 40,
        title: 'Test moment',
        reason: 'Great hook',
        hook_strength: 20,
      }],
    };
    expect(MomentResponseSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects empty moments array', () => {
    expect(MomentResponseSchema.safeParse({ moments: [] }).success).toBe(false);
  });

  it('rejects negative timestamps', () => {
    const invalid = {
      moments: [{ start: -1, end: 30, title: 'x', reason: 'r', hook_strength: 10 }],
    };
    expect(MomentResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects hook_strength > 25', () => {
    const invalid = {
      moments: [{ start: 0, end: 30, title: 'x', reason: 'r', hook_strength: 30 }],
    };
    expect(MomentResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects more than 15 moments', () => {
    const moments = Array.from({ length: 16 }, (_, i) => ({
      start: i * 30,
      end: i * 30 + 25,
      title: `Moment ${i}`,
      reason: 'r',
      hook_strength: 10,
    }));
    expect(MomentResponseSchema.safeParse({ moments }).success).toBe(false);
  });
});

describe('ViralityResponseSchema', () => {
  it('validates correct response', () => {
    const valid = { hook: 20, engagement: 15, flow: 18, trend: 12, total: 65, tips: ['tip1'] };
    expect(ViralityResponseSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects scores > 25', () => {
    const invalid = { hook: 30, engagement: 15, flow: 18, trend: 12, total: 75, tips: ['tip'] };
    expect(ViralityResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it('requires at least 1 tip', () => {
    const invalid = { hook: 20, engagement: 15, flow: 18, trend: 12, total: 65, tips: [] };
    expect(ViralityResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it('allows max 3 tips', () => {
    const valid = { hook: 20, engagement: 15, flow: 18, trend: 12, total: 65, tips: ['a', 'b', 'c'] };
    expect(ViralityResponseSchema.safeParse(valid).success).toBe(true);
    const invalid = { hook: 20, engagement: 15, flow: 18, trend: 12, total: 65, tips: ['a', 'b', 'c', 'd'] };
    expect(ViralityResponseSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('TitleResponseSchema', () => {
  it('validates correct response', () => {
    const valid = { title: 'Как начать с нуля', alternatives: ['Вариант 2'] };
    expect(TitleResponseSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects title > 60 chars', () => {
    const invalid = { title: 'x'.repeat(61), alternatives: [] };
    expect(TitleResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects empty title', () => {
    const invalid = { title: '', alternatives: [] };
    expect(TitleResponseSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('CtaResponseSchema', () => {
  it('validates correct CTA', () => {
    const valid = { text: 'Узнайте больше на курсе', position: 'end', duration: 4 };
    expect(CtaResponseSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects CTA with < 3 words', () => {
    const invalid = { text: 'Два слова', position: 'end', duration: 4 };
    expect(CtaResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects CTA with > 8 words', () => {
    const invalid = { text: 'один два три четыре пять шесть семь восемь девять', position: 'end', duration: 4 };
    expect(CtaResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it('accepts exactly 3 words', () => {
    const valid = { text: 'три слова здесь', position: 'end', duration: 3 };
    expect(CtaResponseSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts exactly 8 words', () => {
    const valid = { text: 'один два три четыре пять шесть семь восемь', position: 'overlay', duration: 5 };
    expect(CtaResponseSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects duration outside 3-5 range', () => {
    expect(CtaResponseSchema.safeParse({ text: 'три слова здесь', position: 'end', duration: 2 }).success).toBe(false);
    expect(CtaResponseSchema.safeParse({ text: 'три слова здесь', position: 'end', duration: 6 }).success).toBe(false);
  });

  it('rejects invalid position', () => {
    const invalid = { text: 'три слова здесь', position: 'top', duration: 3 };
    expect(CtaResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects text > 50 chars', () => {
    const invalid = { text: 'три слова ' + 'x'.repeat(45), position: 'end', duration: 3 };
    expect(CtaResponseSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('MomentSelectionInputSchema', () => {
  it('validates correct input', () => {
    const valid = { fullText: 'transcript text', tokenCount: 1000, planId: 'free', videoDurationSeconds: 300 };
    expect(MomentSelectionInputSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects missing fields', () => {
    expect(MomentSelectionInputSchema.safeParse({ fullText: 'text' }).success).toBe(false);
  });

  it('rejects negative duration', () => {
    const invalid = { fullText: 'text', tokenCount: 100, planId: 'free', videoDurationSeconds: -1 };
    expect(MomentSelectionInputSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('TranscriptSegmentSchema', () => {
  it('validates correct segment', () => {
    const valid = { start: 0.5, end: 3.2, text: 'Hello world' };
    expect(TranscriptSegmentSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects negative start', () => {
    expect(TranscriptSegmentSchema.safeParse({ start: -1, end: 3, text: 'x' }).success).toBe(false);
  });

  it('rejects missing text', () => {
    expect(TranscriptSegmentSchema.safeParse({ start: 0, end: 3 }).success).toBe(false);
  });
});
