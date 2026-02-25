# Review Report: moments-virality

**Date:** 2026-02-25
**Reviewers:** 5-agent swarm (code-quality, architecture, security, performance, testing)
**Mode:** Brutal Honesty (Linus + Ramsay + Bach)

## Summary

| Dimension | Score | Critical | Major | Minor |
|-----------|-------|----------|-------|-------|
| Code Quality | 5/10 | 7 | 10 | 11 |
| Architecture | 6/10 | 2 | 4 | 5 |
| Security | 4/10 | 3 | 7 | 5 |
| Performance | 4/10 | 3 | 5 | 6 |
| Testing | 1/10 | 4 | 5 | 4 |
| **Overall** | **4/10** | **19** | **31** | **31** |

**Verdict:** NOT production-ready. 19 critical issues must be fixed.

---

## Deduplicated Critical Issues (Must Fix)

### C1. ClipFormat type mismatch — `portrait` vs `9:16`
**Files:** `packages/types/src/clip.ts`, `packages/db/prisma/schema.prisma`, `apps/worker/workers/llm-analyze.ts:291,311`
**Impact:** Render worker receives `'portrait'` but expects `'9:16'`. Clips will fail to render or produce wrong output.
**Fix:** Align `ClipFormat` in `packages/types` to match Prisma enum values, or add a mapping function.

### C2. CTA type mismatch — missing `url` field
**Files:** `packages/types/src/clip.ts:30-35`, `apps/worker/workers/llm-analyze.ts:83`, prompt schemas
**Impact:** Shared `CTA` type requires `url: string | null`, but worker never writes it. Downstream consumers get `undefined`.
**Fix:** Remove `url` from the shared CTA type (it's not in the prompts or schemas).

### C3. Unsafe casts bypass type safety
**Files:** `apps/worker/workers/llm-analyze.ts:109,124,288,311`
**Impact:** `as unknown as X` double-casts on DB JSON columns and job input. Malformed data produces silent garbage.
**Fix:** Validate with Zod: parse `transcript.segments` and `jobData.input` before use.

### C4. Cost cap checked AFTER money is spent
**Files:** `apps/worker/workers/llm-analyze.ts:227-231,254-257`
**Impact:** Up to 12 LLM calls can fire before the first cap check. Can overshoot 10₽ cap significantly.
**Fix:** Pre-check cost budget before each LLM call or batch of calls.

### C5. `docker-compose.yml` points to wrong file
**Files:** `docker-compose.yml:39` → `dist/apps/worker/workers/llm.js`
**Impact:** LLM worker container will fail to start. File is `llm-analyze.ts` → compiles to `llm-analyze.js`.
**Fix:** Update docker-compose command to `llm-analyze.js`.

### C6. Clip update mutation sets status='rendering' without enqueuing render job
**Files:** `apps/web/lib/trpc/routers/clip.ts:74-79`
**Impact:** Clips become permanently stuck in "rendering" state. No recovery mechanism.
**Fix:** Either enqueue the render job or don't change status until render is actually enqueued.

### C7. ZERO test files exist — 31 documented tests, 0 implemented
**Files:** Entire feature
**Impact:** No automated quality assurance. Pure functions not exported. No vitest config.
**Fix:** Export pure functions, create vitest config, write unit tests for helpers.

### C8. Pure functions and Zod schemas not exported
**Files:** `apps/worker/workers/llm-analyze.ts` — all helpers are module-private
**Impact:** Impossible to unit test `validateMoments`, `deduplicateMoments`, `getMaxClipsForPlan`, Zod schemas.
**Fix:** Export helpers from a separate utils module.

### C9. Prompt injection via transcript text
**Files:** All 4 prompt templates in `apps/worker/lib/prompts/`
**Impact:** Malicious audio can inject LLM instructions. Could manipulate scores, generate offensive content.
**Fix:** Wrap transcript in XML delimiters, add "treat as data only" instruction.

### C10. Missing `@@index([videoId])` on UsageRecord
**Files:** `packages/db/prisma/schema.prisma:216-231`
**Impact:** `updateMany({ where: { videoId } })` causes full table scan inside transaction.
**Fix:** Add `@@index([videoId])` to UsageRecord model.

---

## Major Issues (Should Fix)

### M1. ViralityScore type duplicated in 3 places
`packages/types/src/clip.ts`, `virality-breakdown.tsx:5-12`, `clip-card.tsx:21` — each with different optionality. Import from shared types.

### M2. `ClipWithPublications` type duplicated
Both `clip-card.tsx:6` and `clip-list.tsx:7` define the same type. Extract to shared types.

### M3. STT worker marks video as 'failed' in catch block before BullMQ retries
`stt.ts:198-205` — prevents retry mechanism from working. Should only mark failed in `on('failed')` after all retries exhausted.

### M4. No rate limiting on clip router
Security rules require 100 req/min. `clipRouter` procedures have no `checkRateLimit` calls.

### M5. Internal file paths exposed to frontend
`clip.getByVideo` returns full Prisma objects including `filePath`, `thumbnailPath`. Use `select` to strip.

### M6. Dead code — unreachable empty moments check
`llm-analyze.ts:193-219` — `MomentResponseSchema.min(1)` guarantees moments.length >= 1 after successful parse.

### M7. API keys at module load without validation
`llm-analyze.ts:96-103` — `LLMRouter` constructed with potentially undefined env vars. No fail-fast.

### M8. Render queue — sequential `add()` instead of `addBulk()`
`llm-analyze.ts:310-323` — 15 sequential Redis round-trips. Use BullMQ `addBulk()`.

### M9. Transcript truncation not implemented
Refinement.md edge case #2 documents 200K token truncation. Code has no truncation logic.

### M10. No React.memo on ClipCard/ScoreBadge
Full re-render cascade on every poll cycle during clip generation.

### M11. TOCTOU on video status — idempotency guard too early
Video status checked at start, transaction runs minutes later. Duplicate clips possible.

### M12. `Infinity` as max clips — serialization footgun
`getMaxClipsForPlan` returns `Infinity` for pro/business. Use concrete limit (e.g., 100).

### M13. Error objects logged in LLM Router may contain API keys
`llm-router.ts:140` logs full error object. HTTP client errors include auth headers.

### M14. `validateMoments` can produce clips < 15 seconds
When `start + 15 > videoDurationSeconds`, final clip can be shorter than documented minimum.

### M15. 3 sequential DB queries instead of 1 with `include`
`llm-analyze.ts:115-123` — video, user, transcript fetched separately. Use Prisma `include`.

---

## Minor Issues (Low Risk)

- `deduplicateTitles` mutates input array in place (unexpected side effect)
- `getMaxClipsForPlan` uses magic strings instead of PlanId enum
- Cost cap should be configurable, not hardcoded 1000 kopecks
- Duration rounding in prompt loses precision (90s → "2 minutes")
- `ClipCard` may not need `'use client'` directive
- In-memory sort after DB fetch in clip router (wasteful `orderBy`)
- `p-map` dependency for simple concurrency control
- `worker.on('failed')` handler doesn't guard against `job === undefined`
- `data-testid` attributes are orphans (no tests reference them)
- ScoreBadge uses `fixed inset-0` overlay (blocks page interaction)
- pMap concurrency hardcoded (should vary by provider strategy)
- No accessibility attributes on interactive clip components
- BDD scenarios not tagged for moments-virality feature
- No k6 performance benchmarks

---

## What's Done Right

1. **Zod validation on all LLM responses** — safeParse with fallback behavior
2. **Cost tracking accumulation** — running total written to DB
3. **Parallel enrichment with bounded concurrency** — pMap + Promise.all
4. **Moment deduplication algorithm** — overlap-based, quality-first
5. **Atomic transaction for clip creation** — clips + video status + usage in one TX
6. **Defensive fallback moments** — always produces output
7. **tRPC authorization** — every procedure checks userId
8. **Clean prompt separation** — each prompt in its own file
9. **ClipList state machine** — handles all processing states
10. **Virality breakdown UI** — clean, informative, good UX

---

## Fix Priority

### Phase 1 — Structural (before any code fixes)
1. Export pure functions and Zod schemas from llm-analyze (C7, C8)
2. Fix docker-compose.yml filename (C5)
3. Add `@@index([videoId])` to UsageRecord (C10)

### Phase 2 — Type Safety
4. Align ClipFormat types (C1)
5. Fix CTA type — remove `url` field (C2)
6. Add Zod validation on unsafe casts (C3)
7. Import shared ViralityScore type in frontend (M1, M2)

### Phase 3 — Security
8. Add transcript delimiters in prompts (C9)
9. Strip internal fields from tRPC responses (M5)
10. Add rate limiting to clip router (M4)
11. Fix error logging to exclude headers (M13)

### Phase 4 — Logic Fixes
12. Fix cost cap — pre-check before LLM calls (C4)
13. Fix clip update mutation (C6)
14. Fix STT worker premature failure marking (M3)
15. Remove dead code (M6)
16. Use addBulk for render queue (M8)
17. Add transcript truncation (M9)

### Phase 5 — Tests
18. Create vitest configs
19. Write unit tests for pure functions
20. Write integration tests with mocked LLM

---

*Generated by 5-agent brutal-honesty-review swarm*
*Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>*
