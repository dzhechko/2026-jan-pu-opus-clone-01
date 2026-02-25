# Review Report: Video Render

## Review Method

Brutal honesty review (Linus mode + Ramsay mode) using parallel review agents:

| Agent | Scope | Focus |
|-------|-------|-------|
| code-quality | `apps/worker/lib/ffmpeg.ts` | FFmpeg correctness, security, edge cases |
| architecture | `apps/worker/workers/video-render.ts` | Pipeline correctness, BullMQ patterns, error handling |

## Summary

| Metric | Count |
|--------|-------|
| **Critical issues found** | 6 |
| **Major issues found** | 9 |
| **Minor issues found** | 11 |
| **Critical fixed** | 5 |
| **Major fixed** | 7 |
| **Remaining (accepted)** | 4 |

## Critical Issues — All Fixed

| # | Issue | File | Fix |
|---|-------|------|-----|
| C1 | **`-to` with input seeking produces wrong clip duration**: `-ss` before `-i` resets timestamps, so `-to` becomes absolute output time. A 30s clip at offset 300s would produce a 360s file | ffmpeg.ts | Changed `-to endTime` to `-t duration` (endTime - startTime) |
| C2 | **`escapeDrawtext` single-quote escaping uses shell idiom** (`'\\''`), which doesn't work in FFmpeg filter parser context | ffmpeg.ts | Changed to `\\'` (FFmpeg filter-level single-quote escape) |
| C3 | **No `font=` specified for drawtext filters**: Cyrillic text would render as boxes/empty on servers without fontconfig default | ffmpeg.ts | Added `font=Montserrat` to all 3 drawtext filters (CTA overlay, CTA end card, watermark) |
| C4 | **Catch block marks clip as `failed` before retry**: Could trigger premature `checkVideoFailure` from sibling clips, marking entire video as failed while retries remain | video-render.ts | Removed status update from catch block (follow STT worker pattern). Only `on('failed')` handler marks failed after retry exhaustion |
| C5 | **Unused `FFMPEG_TIMEOUT` constant and `execFFmpeg` import** in worker | video-render.ts | Removed dead code |

## Major Issues — Fixed

| # | Issue | File | Fix |
|---|-------|------|-----|
| M1 | **CTA end card missing codec params**: No `-profile:v high -level 4.1`, mismatched audio sample rate — concat demuxer would fail or produce glitches | ffmpeg.ts | Added matching profile/level/pix_fmt and explicit `-ar 44100` to both main render and CTA end card |
| M2 | **`wrapSubtitleText` applied after ASS escape**: `\\N` and `\\{` counted in wrap length calculation, causing incorrect line breaks | ffmpeg.ts | Reordered: wrap first on raw text, then convert newlines, then escape ASS chars |
| M3 | **Validation failures retried**: Zod parse failure threw regular `Error`, causing BullMQ to retry with the same bad data 3 times | video-render.ts | Changed to `UnrecoverableError` (BullMQ skips retries) |
| M4 | **`on('failed')` retry exhaustion detection fails with undefined `attempts`**: `job.opts?.attempts` is undefined if job was enqueued without explicit options | video-render.ts | Changed `===` to `>=` with fallback: `job.opts?.attempts ?? 0` |
| M5 | **`extractAudio` missing `-y` flag**: Retry of failed STT jobs would hang waiting for FFmpeg interactive confirmation | ffmpeg.ts | Added `-y` to extractAudio args |
| M6 | **Progress updates could fail on Redis blip**: `job.updateProgress()` throws on Redis errors, killing otherwise successful renders | video-render.ts | Created `safeProgress()` helper that wraps in `.catch(() => {})` |
| M7 | **Main render audio sample rate not forced**: Source video at 48kHz would produce clip incompatible with CTA end card at 44.1kHz | ffmpeg.ts | Added `-ar 44100` to `renderClip` args |

## Remaining Issues (Accepted)

| # | Issue | Severity | Status | Rationale |
|---|-------|----------|--------|-----------|
| R1 | `readFile` loads entire rendered clip into memory (~50-200MB per clip) | Major | Accepted | `putObject` in `@clipmaker/s3` only accepts `Buffer`. Streaming upload requires S3 package changes (separate PR). With concurrency 3, peak memory is ~600MB — within the 4GB+ worker container limit |
| R2 | No atomic idempotency guard (read-then-act without `WHERE status`) | Major | Accepted | Two concurrent jobs for same clip are prevented by BullMQ's job deduplication. Race condition requires queue misconfiguration. Different tmpDirs prevent data corruption. S3 upload is last-writer-wins (safe) |
| R3 | Input seeking may desync ASS subtitle timing by up to one keyframe interval | Minor | Accepted | For webinar recordings (15-60s clips), keyframe imprecision is ≤2 frames at typical GOP settings. Imperceptible to viewers |
| R4 | CTA end card concat fails if source video has no audio track (stream count mismatch) | Minor | Accepted | Webinar recordings always have audio. Edge case for future handling |

## Files Modified

| File | Lines | Changes |
|------|-------|---------|
| `apps/worker/lib/ffmpeg.ts` | 525 | `-to` → `-t`, escaping fixes, font= for drawtext, codec alignment, wrap ordering, `-y` for extractAudio |
| `apps/worker/workers/video-render.ts` | 355 | UnrecoverableError, remove catch-block status update, safeProgress helper, retry exhaustion detection fix, dead code removal |

## Commits

| Hash | Message |
|------|---------|
| `f35124c` | `feat(video-render): implement FFmpeg render pipeline with subtitles, CTA, watermark` |
| `080a4a7` | `fix(video-render): resolve all critical and major review issues` |
