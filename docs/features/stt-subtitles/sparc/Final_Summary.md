# STT + Subtitles — Final Summary

## Feature Overview

Implements the speech-to-text transcription pipeline and subtitle editing for КлипМейкер. This is the critical bridge between video upload (done) and AI moment selection (next feature).

## What Gets Built

### Backend (apps/worker)
1. **STT Worker** — full implementation replacing placeholder:
   - S3 download → FFmpeg audio extraction → chunk → Whisper API → transcript assembly
   - Parallel chunk processing (3 concurrent) for 3x speed
   - Quota enforcement (debit minutes after success)
   - Usage tracking (cost in kopecks)
   - Proper error handling with BullMQ retry

2. **Helper modules:**
   - `s3-download.ts` — stream S3 objects to local files
   - `audio-chunker.ts` — split audio into 10-min chunks, reassemble timestamps

3. **FFmpeg enhancements:**
   - `ffprobeGetDuration()` — extract video duration
   - `extractAudio()` — video → WAV 16kHz mono

### Backend (apps/web)
4. **tRPC transcript router:**
   - `getSegments` — fetch transcript segments with timestamps
   - `updateSegments` — batch edit segment texts
   - `getFullText` — full text + token count for downstream LLM

### Frontend (apps/web)
5. **TranscriptViewer** — time-aligned segment list on video detail page
6. **SegmentEditor** — inline text editing with optimistic updates

## Key Numbers

| Metric | Value |
|--------|-------|
| STT cost (RU, 60 min) | 18₽ (0.30₽/min) |
| STT cost (Global, 60 min) | 33₽ (0.55₽/min) |
| Processing time (60 min video) | ~30s (parallel chunks) |
| Chunk size | 10 min / ~19.2MB WAV |
| Max concurrency | 3 chunks parallel |
| Accuracy target | ≥95% WER for clear speech |

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Audio extraction | In-worker FFmpeg | <10s, not worth separate job |
| Chunking | 10-min intervals | Fits 25MB limit with margin |
| Timestamps | Segment-level | Sufficient for subtitles, confirmed on both providers |
| Token counting | Word count × 2.5 | Good enough for tier routing, no extra dependency |
| Temp storage | /tmp per-job | Simple, cleaned in finally block |
| Minutes debit | After success | Users don't lose minutes on failures |

## Files to Create/Modify

| File | Action | Size Estimate |
|------|--------|---------------|
| `apps/worker/workers/stt.ts` | Rewrite | ~200 lines |
| `apps/worker/lib/s3-download.ts` | Create | ~30 lines |
| `apps/worker/lib/audio-chunker.ts` | Create | ~60 lines |
| `apps/worker/lib/ffmpeg.ts` | Modify | +40 lines |
| `packages/s3/src/operations.ts` | Modify | +15 lines |
| `packages/s3/src/index.ts` | Modify | +1 export |
| `apps/web/lib/trpc/routers/transcript.ts` | Create | ~100 lines |
| `apps/web/lib/trpc/routers/index.ts` | Modify | +2 lines |
| `apps/web/components/transcript/transcript-viewer.tsx` | Create | ~120 lines |
| `apps/web/components/transcript/segment-editor.tsx` | Create | ~80 lines |
| `apps/web/app/(dashboard)/dashboard/videos/[id]/page.tsx` | Modify | +20 lines |
| `apps/worker/package.json` | Modify | +1 dep (p-map) |

## Risk Summary

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Cloud.ru verbose_json unsupported | Low | Fallback to text format + sentence splitting |
| FFmpeg missing in container | Low | Startup health check |
| /tmp exhaustion | Medium | Cleanup in finally + tmpfs limit |
| Whisper accuracy < 95% | Medium | Subtitle editor for corrections |

## Dependencies & Downstream

- **Depends on:** S3 Upload (done), Auth (done), Queue infrastructure (done)
- **Enables:** Moment Selection (reads transcript), Video Render (reads subtitle segments)
- **No schema changes** — all models already exist in Prisma
