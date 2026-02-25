# Final Summary: Moments + Virality

## Feature Overview

AI-powered moment selection and virality scoring — the core intelligence layer of КлипМейкер's video-to-shorts pipeline. Takes a completed transcript and produces scored, titled clip candidates with CTAs, ready for FFmpeg rendering.

## What Gets Built

### Backend (Worker)
- **LLM Analyze Worker** — Processes `moment_selection` jobs from BullMQ queue
- **4 Prompt Templates** — Moment selection, virality scoring, title generation, CTA suggestion
- **STT Integration** — STT worker enqueues LLM analysis after transcript is saved

### Backend (API)
- **clip.getByVideo** — tRPC procedure returning clips sorted by virality score

### Frontend
- **Enhanced ClipCard** — Score badge with color coding (green/yellow/gray)
- **ViralityBreakdown** — Click-to-expand score breakdown with tips
- **Updated ClipList** — Sorted by score, plan-limited

## Pipeline Flow

```
Transcript Ready → Moment Selection (tier1) → Parallel: Score + Title + CTA → Create Clips → Enqueue Render
```

## Key Numbers

| Metric | Value |
|--------|-------|
| Processing time (60 min video) | ~60-90s |
| LLM cost (60 min video, RU) | ~2.5₽ |
| Clips per video | 3-10 (plan-dependent) |
| Parallel LLM calls | 3 concurrent (scoring) |
| Retry strategy | Tier escalation + fallback |

## Files Changed

| File | Change Type |
|------|------------|
| `apps/worker/workers/llm-analyze.ts` | Rewrite (placeholder → full implementation) |
| `apps/worker/lib/prompts/moment-selection.ts` | New |
| `apps/worker/lib/prompts/virality-scoring.ts` | New |
| `apps/worker/lib/prompts/title-generation.ts` | New |
| `apps/worker/lib/prompts/cta-suggestion.ts` | New |
| `apps/worker/workers/stt.ts` | Modify (add LLM job enqueue) |
| `apps/web/lib/trpc/routers/clip.ts` | Modify (add getByVideo) |
| `apps/web/components/clips/clip-list.tsx` | Modify (score display) |
| `apps/web/components/clips/virality-breakdown.tsx` | New |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| LLM returns invalid JSON | Medium | Low | Zod validation + fallback |
| Cloud.ru API outage | Low | High | BullMQ retry + manual pause |
| Cost spike on long videos | Low | Medium | Cost cap at 10₽/video |
| Poor moment quality | Medium | Medium | Tier escalation + user can edit |
| Processing timeout | Low | Medium | Parallel processing stays under 3 min |

## Dependencies

- **Requires**: STT feature (completed)
- **Required by**: Video Render feature (US-07), Auto-Post (US-08)
- **Uses**: LLM Router (existing), BullMQ (existing), Prisma Clip model (existing)
