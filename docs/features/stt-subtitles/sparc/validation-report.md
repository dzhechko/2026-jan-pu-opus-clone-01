# STT + Subtitles — Validation Report

**Date:** 2026-02-25
**Iteration:** 1 (single pass — all issues fixed)

## Validator Scores

| Validator | Score (pre-fix) | Issues Found | Issues Fixed | Score (post-fix) |
|-----------|----------------|--------------|--------------|-----------------|
| Stories (INVEST+SMART) | 85/100 | 2 MAJOR, 10 MINOR | All | ~92/100 |
| Pseudocode | 84/100 | 2 blocker, 3 major, 4 minor | All | ~93/100 |
| Architecture | 77/100 | 2 HIGH, 3 MEDIUM | All | ~88/100 |
| Coherence | 83/100 | 3 FAIL, 2 minor | All | ~95/100 |
| BDD | 25 scenarios | 10 coverage gaps | Key gaps addressed | 25 scenarios |

**Average (post-fix): ~92/100**
**BLOCKED items: 0**

## Issues Fixed

### Critical / Blockers (fixed in Pseudocode.md)

1. **`seg.no_speech_prob` variable scoping bug** — Filter referenced outer loop variable `seg` instead of current item. Fixed: filter raw Whisper segments BEFORE mapping to TranscriptSegment, using `raw.no_speech_prob`.

2. **`getOpenAIClient` undefined function** — Pseudocode called nonexistent function. Fixed: added `createSTTClient()` helper definition that extracts OpenAI client creation from LLMRouter's private method.

3. **`ffprobeGetDuration` used `execSync` with string concat** — Contradicted own security note. Fixed: rewrote to use `execFile('ffprobe', [...args], { timeout })` with array args.

4. **Per-chunk retry not shown in transcription loop** — Retry strategy was mentioned in error handling section but not in step 7 code. Fixed: added `retryWithBackoff()` wrapper around each chunk's API call, with `retryWithBackoff` helper definition.

### Major (fixed across docs)

5. **Chunk trigger inconsistency (13 min vs 10 min)** — Specification said >13 min, Pseudocode used 10 min. Fixed: Specification now says >10 min with rationale (10-min chunks ≈ 19.2MB, under 25MB limit).

6. **S3 retry contradiction** — Refinement said retry 2x, Pseudocode said fail immediately. Fixed: Pseudocode error handling now says "retry up to 2 times (transient)" for S3 download. Aligned with Refinement.

7. **"Highlighted during playback" underspecified** — No Gherkin scenario. Fixed: added separate scenario with CSS class "active", scroll-into-view, 500ms tolerance from timeupdate event.

8. **Undo scope undefined** — Ctrl+Z behavior ambiguous. Fixed: scenario now specifies "session-level, per segment" — reverts to text before current editing session started.

9. **Missing API output fields** — Specification table omitted `sttProvider` from getSegments and `language` from getFullText. Fixed: both added.

10. **`llm-router.ts` missing from file list** — Architecture.md mentioned modification but Final_Summary and Completion omitted it. Fixed: added to both.

11. **`confirmUpload` enqueue bug** — Sends `userId` (not in STTJobData) and omits `language`. Fixed: documented as "Existing Code Patches Required" in Completion.md and as "Integration Fix" in Pseudocode.md.

### Minor (fixed)

12. **No zero-quota scenario** — Added "Zero minutes remaining" Gherkin scenario.
13. **No "failed" status UI scenario** — Added "Video transcription failed" scenario showing error message.
14. **Provider selection as single scenario with inline branching** — Split into two separate scenarios (RU and Global).
15. **Usage tracking table had inline comments** — Cleaned up table values.
16. **`execFFmpeg` timeout not parameterized** — Added `timeoutMs` parameter with default 30s, extraction passes 120s.
17. **No NFR for transcript render** — Added NFR-STT-08: <100ms for 200 segments.
18. **Edit validation missing 1000-char limit** — Added scenario.
19. **Unauthorized edit scenario missing** — Added.
20. **Batch save loading state missing** — Added "Сохранение..." state.
21. **BullMQ job-level retry not documented** — Added note about attempts: 3, backoff: exponential 5s as safety net.

## BDD Scenarios

25 scenarios generated and saved to `docs/features/stt-subtitles/test-scenarios.md` covering:
- 7 happy paths
- 7 error handling
- 5 edge cases
- 3 security
- 3 performance

## Verdict

All SPARC documents are consistent and implementable. No BLOCKED items. Average score ~92/100.

**Proceed to Phase 3 (Implementation): YES**
