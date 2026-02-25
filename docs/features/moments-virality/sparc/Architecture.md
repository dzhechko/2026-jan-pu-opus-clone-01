# Architecture: Moments + Virality

## System Context

```
┌─────────────────────────────────────────────────────────┐
│                    КлипМейкер                           │
│                                                         │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Next.js  │←──→│   tRPC API   │←──→│  PostgreSQL   │  │
│  │ Frontend │    │   (video,    │    │  (videos,     │  │
│  │          │    │    clip,     │    │   clips,      │  │
│  │          │    │    user)     │    │   transcripts)│  │
│  └──────────┘    └──────┬───────┘    └──────────────┘  │
│                         │                               │
│                    ┌────▼────┐                          │
│                    │  Redis  │                          │
│                    │ (BullMQ)│                          │
│                    └────┬────┘                          │
│              ┌──────────┼──────────┐                   │
│              ▼          ▼          ▼                    │
│     ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│     │STT Worker│ │LLM Worker│ │Render    │            │
│     │(Whisper) │→│(Moments) │→│Worker    │            │
│     │          │ │          │ │(FFmpeg)  │            │
│     └──────────┘ └──────────┘ └──────────┘            │
│              │         │           │                    │
│              ▼         ▼           ▼                    │
│         ┌───────────────────────────────┐              │
│         │   Cloud.ru / Global APIs      │              │
│         │   (Whisper, T-Pro, GigaChat)  │              │
│         └───────────────────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

## Component Breakdown

### 1. LLM Analyze Worker (`apps/worker/workers/llm-analyze.ts`)

**Responsibility:** Process LLM analysis jobs from BullMQ queue.

**Queue:** `QUEUE_NAMES.LLM` (from `packages/queue`)

**Job Types:** Single entry point, dispatches by `job.data.task`:
- `moment_selection` — Full pipeline: select → score → title → CTA → create clips

**Dependencies:**
- `@clipmaker/db` (Prisma client)
- `@clipmaker/queue` (queue names, job options)
- `@clipmaker/types` (LLMJobData, TranscriptSegment)
- `../lib/llm-router` (LLMRouter class)
- `../lib/prompts/*` (prompt templates)
- `p-map` (parallel processing)

### 2. Prompt Templates (`apps/worker/lib/prompts/`)

| File | Export | Used By |
|------|--------|---------|
| `moment-selection.ts` | `SYSTEM_PROMPT`, `buildUserMessage()` | handleMomentSelection |
| `virality-scoring.ts` | `SYSTEM_PROMPT`, `buildUserMessage()` | scoreVirality |
| `title-generation.ts` | `SYSTEM_PROMPT`, `buildUserMessage()` | generateTitle |
| `cta-suggestion.ts` | `SYSTEM_PROMPT`, `buildUserMessage()` | generateCta |

### 3. LLM Router (`apps/worker/lib/llm-router.ts`) — EXISTING

Already implements tier selection, model routing, fallback logic, and cost tracking. Used as-is.

### 4. STT Worker Modification (`apps/worker/workers/stt.ts`)

**Change:** After saving transcript, enqueue `moment_selection` job to LLM queue.

### 5. Clip Router Extension (`apps/web/lib/trpc/routers/clip.ts`)

**New procedure:** `getByVideo(videoId)` — Returns clips for a video sorted by virality score.

### 6. Frontend Components

| Component | Path | Purpose |
|-----------|------|---------|
| `ClipCard` | `components/clips/clip-card.tsx` | Display clip with score badge |
| `ViralityBreakdown` | `components/clips/virality-breakdown.tsx` | Score breakdown modal |
| `ClipList` | `components/clips/clip-list.tsx` | Update existing component with score sorting |

## Data Flow

```
1. STT Worker completes → saves Transcript → enqueues LLM job
   video.status: "transcribing" → "analyzing"

2. LLM Worker picks up job → calls LLM Router for moment selection
   LLM Router: selectTier() → complete() → parse JSON response

3. For each moment (3 concurrent):
   ├── scoreVirality() → LLM Router (tier1) → ViralityScore
   ├── generateTitle() → LLM Router (tier0) → title string
   └── generateCta()   → LLM Router (tier0) → CtaData

4. Create Clip records (batch transaction):
   - Sort by viralityScore.total DESC
   - Apply plan limits (free=3, start=10, pro/business=unlimited)
   - Insert Clip rows
   - Update Video status → "generating_clips"
   - Update UsageRecord.llmCostKopecks

5. Enqueue render jobs (out of scope for this feature)
   video.status: "analyzing" → "generating_clips"
```

## Files to Create

| File | Type | Description |
|------|------|-------------|
| `apps/worker/workers/llm-analyze.ts` | Rewrite | Full LLM analyze worker |
| `apps/worker/lib/prompts/moment-selection.ts` | New | Prompt template |
| `apps/worker/lib/prompts/virality-scoring.ts` | New | Prompt template |
| `apps/worker/lib/prompts/title-generation.ts` | New | Prompt template |
| `apps/worker/lib/prompts/cta-suggestion.ts` | New | Prompt template |

## Files to Modify

| File | Change |
|------|--------|
| `apps/worker/workers/stt.ts` | Add LLM job enqueue after transcript saved |
| `apps/web/lib/trpc/routers/clip.ts` | Add `getByVideo` procedure |
| `apps/web/components/clips/clip-list.tsx` | Update with virality score display |
| `apps/web/components/clips/clip-card.tsx` | Already exists in clip-list.tsx, extract + enhance |
| `apps/worker/lib/llm-router.ts` | No changes needed |
| `docker-compose.yml` | Update worker-llm command if worker file renamed |

## New Files (Frontend)

| File | Description |
|------|-------------|
| `apps/web/components/clips/virality-breakdown.tsx` | Score breakdown popover/modal |

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Job dispatch | Single worker, switch by task | Simpler than 4 workers; all tasks share LLM Router |
| Parallel scoring | `pMap` inside worker | Avoids queue overhead for 30+ sub-jobs |
| JSON validation | Zod on LLM response | Catches malformed AI output early |
| Fallback strategy | Tier escalation + evenly-spaced | Guarantees clips even with poor transcript |
| Cost tracking | Aggregate in UsageRecord | Single DB update per video |
| Plan limits | Trim after scoring | User gets best N clips, not random N |

## Security Considerations

- LLM prompts do not include user API keys (Cloud.ru key is server-side env var)
- Clip ownership validated via `video.userId` check in all tRPC procedures
- LLM response JSON validated with Zod before DB write
- No user input passed directly to prompts (transcript text is sanitized at STT stage)

## Error Handling

| Error | Recovery |
|-------|----------|
| LLM API timeout | BullMQ retry (3 attempts, exponential backoff) |
| Invalid JSON from LLM | Log warning, use fallback values |
| Moment selection returns 0 | Retry with tier+1, then fallback to evenly-spaced |
| Scoring fails for one clip | Use hookStrength-derived fallback score |
| DB transaction fails | BullMQ retry; video stays "analyzing" |
| Video not in "analyzing" state | Skip job (idempotency guard) |
| BullMQ retries exhausted | `onFailed` hook sets video.status = 'failed' |
| LLM cost exceeds 10₽ (1000 kopecks) | Abort job, set video.status = 'failed' |
