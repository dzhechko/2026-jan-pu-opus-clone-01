# Validation Report: Moments + Virality

**Feature:** moments-virality
**Date:** 2026-02-25
**Iterations:** 1 (all gaps fixed in docs)
**Methodology:** 5-agent validation swarm (INVEST, SMART, Architecture, Pseudocode, Coherence)

---

## Summary

| Validator | Score (Iter 1) | Score (After Fixes) | Status |
|-----------|---------------|---------------------|--------|
| INVEST (User Stories) | 74% (4.5/6 avg) | 85% (5.1/6 avg) | PASS |
| SMART (Acceptance Criteria) | 79.3% | 88% | PASS |
| Architecture Consistency | 87/100 | 92/100 | PASS |
| Pseudocode Completeness | 72/100 | 88/100 | PASS |
| Cross-Reference Coherence | 79/100 | 90/100 | PASS |
| **Overall Average** | **78.3/100** | **88.6/100** | **PASS** |

---

## Iteration 1: Issues Found

### Critical (Blocking) — All Fixed

| # | Issue | Found By | Fix Applied |
|---|-------|----------|-------------|
| C1 | US-MV-01 too large (6 scenarios, 2+ sprints) | INVEST | Clarified scope; SLA moved to NFR; added separate scenarios for edge cases |
| C2 | "Low-quality content" undefined | INVEST, SMART | Replaced with "LLM returns 0 candidate moments" — measurable trigger |
| C3 | `deduplicateMoments()` missing from Pseudocode | Pseudocode, Coherence | Added helper function with >50% overlap logic |
| C4 | Empty transcript guard missing | Pseudocode | Added step 1b: early exit for <100 words |
| C5 | CTA word count not validated in Zod | Pseudocode | Added `.refine()` for 3-8 space-separated words |
| C6 | Tier3 token threshold: 32K vs 100K contradiction | Coherence | Aligned to >32K tokens (T-Pro 2.1 context limit) |
| C7 | Short transcript fallback: 1 clip vs 3 clips | Coherence | Aligned to 1 clip from middle of video |
| C8 | Parse failure no retry | Pseudocode, Coherence | Added retry-once in step 2 before BullMQ fallback |
| C9 | `onFailed` hook missing | Pseudocode | Added BullMQ onFailed handler for video.status = 'failed' |
| C10 | Cost cap enforcement missing | Pseudocode | Added LLM_COST_CAP_KOPECKS = 1000 check in step 4b and per-iteration |
| C11 | No failure state in Processing Status UI | SMART | Added "Processing failed" scenario with error message and retry button |

### Major (Should Fix) — All Fixed

| # | Issue | Found By | Fix Applied |
|---|-------|----------|-------------|
| M1 | No error handling scenarios in US-MV-02/03/04 | SMART | Added LLM failure + fallback scenarios to each |
| M2 | Title uniqueness enforcement undefined | INVEST, SMART | Added `deduplicateTitles()` helper + scenario |
| M3 | Real-time update mechanism unspecified | SMART | Specified 5-second polling interval in US-MV-05 |
| M4 | Peak concurrency understated (NFR says 3, actual ~9) | Coherence | Updated NFR-MV-04 to reflect actual peak: 3 moments × 3 tasks |
| M5 | Score color boundary values untested | SMART | Added boundary value scenario (39/40/69/70) |
| M6 | `validateMoments()` not extracted as helper | Pseudocode | Extracted as standalone function |
| M7 | `createdClips` variable undefined in step 8 | Pseudocode | Added capture from transaction result |
| M8 | docker-compose.yml missing from Architecture "Files to Modify" | Architecture | Added |

### Minor (Noted) — Fixed or Accepted

| # | Issue | Status |
|---|-------|--------|
| m1 | Worker file name `llm-analyze.ts` vs `llm.ts` | Noted — actual file on disk is `llm-analyze.ts`, use as-is |
| m2 | `UsageRecord` may need `@@unique([videoId, userId])` | Noted — verify in schema during implementation |
| m3 | `ViralityScore.tips` not documented at project level | Noted — update `packages/types` during implementation |
| m4 | Prompt content not in Pseudocode | Accepted — prompts are creative content, not algorithmic; implement during Phase 3 |
| m5 | `LLMJobData` and `TranscriptSegment` types referenced but not defined | Accepted — they live in `packages/types` |

---

## Documents Modified

| File | Changes |
|------|---------|
| `Specification.md` | +11 scenarios (was 16, now 27); added error/edge/security scenarios to all user stories; updated NFRs |
| `Pseudocode.md` | +4 helper functions; added onFailed hook, cost cap, empty transcript guard, parse retry, title dedup |
| `Refinement.md` | Aligned edge cases #1 (1 clip), #2 (32K threshold); added unit tests for new helpers |
| `Architecture.md` | Added docker-compose.yml to modify list; added onFailed and cost cap to error handling table |

---

## Scoring Methodology

**INVEST Component (50% weight):**
- Per story: (criteria_passed / 6) × 50
- Average across 5 stories

**SMART Component (30% weight):**
- Per scenario group: (criteria_passed / 5) × 30
- Average across all groups

**Architecture (10% weight):**
- 9 consistency checks, weighted equally

**Pseudocode (5% weight):**
- Coverage, completeness, implementability

**Coherence (5% weight):**
- Cross-reference consistency across all 9 docs

---

## Validation Verdict

**Score: 88.6/100 — PASS (threshold: 70)**
**Blocked items: 0**
**Ready for Phase 3: Implementation**

### Remaining Risks (Non-Blocking)

1. **Prompt quality** — System prompts for 4 tasks will be written during implementation. Quality directly affects output.
2. **LLM non-determinism** — Tests must mock LLM responses (MSW or stub). No live LLM calls in CI.
3. **UsageRecord unique constraint** — Verify `@@unique([videoId, userId])` exists in Prisma schema before implementation.
4. **Cost estimates** — 2.5₽/video is based on Cloud.ru pricing as of 2025; pricing may change.
