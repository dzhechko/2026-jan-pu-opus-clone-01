# STT + Subtitles — Review Report

## Review Agents

| Agent | Focus | Issues Found |
|-------|-------|-------------|
| Code Quality (Linus) | Clean code, naming, error handling | 14 |
| Architecture | tRPC patterns, React components, cross-package | 11 |
| Security | OWASP, injection, auth, input validation | 12 |
| Performance | Memory, streaming, render efficiency, DB | 12 |

## Critical Issues (Fixed)

| # | Issue | Fix |
|---|-------|-----|
| 1 | `createReadStream` created outside `retryWithBackoff` — stream consumed on retry, causing silent failures | Moved `createReadStream(chunk.path)` inside the retry callback |
| 2 | `allSegments.push(...mapped)` shared mutable array in concurrent `pMap` callbacks | Replaced with `pMap` return values + `.flat()` — no shared state |
| 3 | Worker trusts `job.data.filePath` from Redis (compromised Redis = arbitrary S3 key) | Use `video.filePath` from DB instead of job payload |

## Major Issues (Fixed)

| # | Issue | Fix |
|---|-------|-----|
| 4 | `TranscriptSegment` type duplicated in 3 files | Import from `@clipmaker/types` everywhere |
| 5 | `sttQueue.add()` missing `DEFAULT_JOB_OPTIONS` — no retries on STT failure | Added `DEFAULT_JOB_OPTIONS` import and usage |
| 6 | `updateSegments` has no rate limiting | Added `checkRateLimit('transcript:update', userId, 20, 60)` |
| 7 | No HTML sanitization on edited subtitle text | Added `stripHtml()` server-side before DB write |
| 8 | `SegmentEditor` not memoized — 1000+ re-renders on every `currentTime` change | Wrapped in `React.memo` |
| 9 | `activeIndex` computed via O(n) `findIndex` on every render | Binary search via `useMemo` — O(log n) |
| 10 | `setTimeout` not cleaned up on unmount | Added `useRef` + cleanup in `useEffect` |
| 11 | FFmpeg `stderr` buffer unbounded | Capped at 64KB |
| 12 | `extractAudio` fixed 120s timeout insufficient for 4GB files | Scaled: `Math.max(120_000, maxDurationSeconds * 200)` |
| 13 | `language` from job payload not validated | Added allowlist check (`['ru', 'en', 'auto']`) |
| 14 | Prisma type cast unreadable `Parameters<>` chain | Simplified to `Prisma.JsonArray` |

## Deferred Issues (Documented, Not Critical)

| # | Issue | Rationale |
|---|-------|-----------|
| 1 | TOCTOU quota race (concurrent STT jobs for same user) | Worker concurrency is 2, users rarely process 2 videos simultaneously. Will fix with Redis lock when billing is critical. |
| 2 | `updateSegments` read-modify-write without optimistic locking | Single-user editing scenario. Will add version column when multi-tab editing is supported. |
| 3 | No list virtualization for 1000+ segments | React.memo significantly reduces re-render cost. Will add `@tanstack/react-virtual` if users report lag with long transcripts. |
| 4 | `renderClip` ignores `subtitleFile` and `watermark` fields | Subtitle overlay is a separate feature (video-render). Fields are placeholders for that feature. |
| 5 | STT client cached forever in module-level Map | API keys rarely rotate. Will add `clearSTTClients()` when key rotation is implemented. |
| 6 | `console.error` in video.ts instead of Pino | Pre-existing code, not introduced by this feature. Will address in logging standardization pass. |

## What's Good

- Clean 10-step pipeline with numbered comments, structured Pino logging
- Proper temp directory cleanup in `finally` block
- Single Prisma `$transaction` for transcript + video + user + usage record
- Silence filtering with `no_speech_prob < 0.8`
- Streaming S3 download (no buffering multi-GB files)
- Consistent tRPC patterns (protectedProcedure, Zod, ownership checks)
- Batch edit UX (accumulate edits in Map, single mutation)
- All FFmpeg calls use `execFile` with array args (no shell injection)
- S3 path traversal prevention via regex allowlists in paths.ts
