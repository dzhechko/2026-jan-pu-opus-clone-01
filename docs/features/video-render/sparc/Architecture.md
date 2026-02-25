# Architecture: Video Render

## System Context

```
                         ┌──────────────────────────────────────────────┐
                         │              КлипМейкер                      │
                         │                                              │
┌──────────┐             │  ┌──────────┐    ┌──────────┐               │
│ LLM      │  enqueue    │  │  Redis   │    │PostgreSQL│               │
│ Analyze  │─render jobs─┼─→│ (BullMQ) │    │  (clips  │               │
│ Worker   │             │  │  video-  │    │  table)  │               │
└──────────┘             │  │  render  │    └────▲─────┘               │
                         │  │  queue   │         │                      │
                         │  └────┬─────┘         │ status updates       │
                         │       │               │ filePath, thumbnail  │
                         │       ▼               │                      │
                         │  ┌─────────────────────────────────────┐    │
                         │  │        Video Render Worker           │    │
                         │  │     (apps/worker/workers/            │    │
                         │  │           video-render.ts)           │    │
                         │  │                                      │    │
                         │  │  1. Download source video from S3    │    │
                         │  │  2. Write subtitle .ass file         │    │
                         │  │  3. Build FFmpeg filter chain:       │    │
                         │  │     scale + subtitles + CTA +        │    │
                         │  │     watermark                        │    │
                         │  │  4. Render clip via FFmpeg subprocess │    │
                         │  │  5. Generate thumbnail               │    │
                         │  │  6. Upload clip + thumbnail to S3    │    │
                         │  │  7. Update Clip record in DB         │    │
                         │  └──────┬──────────────┬────────────────┘    │
                         │         │              │                      │
                         │         ▼              ▼                      │
                         │  ┌──────────┐   ┌──────────┐                │
                         │  │  /tmp    │   │    S3    │                │
                         │  │ (local   │   │ (Yandex  │                │
                         │  │  tmpdir) │   │  Object  │                │
                         │  │          │   │  Storage) │                │
                         │  └──────────┘   └──────────┘                │
                         └──────────────────────────────────────────────┘

Pipeline flow:

  LLM Analyze Worker
        │
        │ enqueue VideoRenderJobData per clip
        ▼
  Redis Queue (video-render)
        │
        │ BullMQ dequeue (concurrency: 2)
        ▼
  Render Worker
   ├─→ downloadFromS3(sourceFilePath) → /tmp/render-{clipId}/source.mp4
   ├─→ writeSubtitleFile(subtitleSegments) → /tmp/render-{clipId}/subs.ass
   ├─→ buildFilterChain(format, subs, cta, watermark)
   ├─→ renderClip(inputPath, outputPath, filterChain)
   ├─→ generateThumbnail(outputPath) → /tmp/render-{clipId}/thumb.jpg
   ├─→ uploadToS3(clip.mp4, thumb.jpg)
   └─→ prisma.clip.update({ filePath, thumbnailPath, status: 'ready' })
        │
        ▼
  Publish Worker (downstream, out of scope)
```

## Component Breakdown

### 1. Video Render Worker (`apps/worker/workers/video-render.ts`)

**Responsibility:** Orchestrate the full clip rendering pipeline: download source, render via FFmpeg, upload result, update database.

**Queue:** `QUEUE_NAMES.VIDEO_RENDER` (`'video-render'`) from `packages/queue`

**Job data:** `VideoRenderJobData` from `packages/types/src/queue.ts`

```typescript
type VideoRenderJobData = {
  clipId: string;
  videoId: string;
  sourceFilePath: string;       // S3 key of the source video
  startTime: number;            // seconds
  endTime: number;              // seconds
  format: 'portrait' | 'square' | 'landscape';
  subtitleSegments: Array<{ start: number; end: number; text: string }>;
  cta?: { text: string; position: 'end' | 'overlay'; duration: number };
  watermark: boolean;
};
```

**Current state:** Skeleton exists (66 lines). Downloads nothing from S3, no subtitle/CTA/watermark support, no thumbnail generation, no S3 upload. Hardcodes output path without temp directory isolation.

**Changes required:**
1. Create isolated temp directory per job using `fs.mkdtemp(path.join(os.tmpdir(), 'render-'))`
2. Download source video from S3 to temp dir via `downloadFromS3()`
3. Write `.ass` subtitle file from `subtitleSegments`
4. Build FFmpeg filter chain using new filter builder functions
5. Call `renderClip()` with assembled filter chain
6. Call `generateThumbnail()` on rendered output
7. Upload clip MP4 and thumbnail JPG to S3 using `putObject()`
8. Update Clip record with `filePath`, `thumbnailPath`, `status: 'ready'`
9. Cleanup temp directory in `finally` block (always, even on error)
10. Reduce concurrency from 3 to 2 (FFmpeg is CPU-heavy)

**Dependencies:**
- `@clipmaker/db` (Prisma client)
- `@clipmaker/queue` (QUEUE_NAMES, getRedisConnection)
- `@clipmaker/types` (VideoRenderJobData)
- `@clipmaker/s3` (putObject)
- `@clipmaker/s3/paths` (clipPath, thumbnailPath)
- `../lib/ffmpeg` (renderClip, generateThumbnail, writeSubtitleFile)
- `../lib/s3-download` (downloadFromS3)
- `../lib/logger` (createLogger)

### 2. FFmpeg Library (`apps/worker/lib/ffmpeg.ts`)

**Current state:** Contains `execFFmpeg()`, `ffprobeGetDuration()`, `extractAudio()`, and `renderClip()`. The `renderClip()` function applies only a scale filter and ignores subtitle, CTA, and watermark fields from `RenderOptions`.

**Functions to add:**

| Function | Signature | Description |
|----------|-----------|-------------|
| `buildSubtitleFilter` | `(assFilePath: string) => string` | Returns FFmpeg `ass` filter string pointing to the `.ass` file |
| `buildCtaFilter` | `(cta: { text: string; position: 'end' \| 'overlay'; duration: number }, clipDuration: number) => string` | Returns `drawtext` filter for CTA overlay or end card |
| `buildWatermarkFilter` | `(text: string) => string` | Returns `drawtext` filter for small watermark in corner |
| `writeSubtitleFile` | `(segments: Array<{ start: number; end: number; text: string }>, outputPath: string) => Promise<void>` | Writes ASS subtitle file from transcript segments |
| `generateThumbnail` | `(videoPath: string, outputPath: string, atSecond?: number) => Promise<void>` | Extracts single frame as JPEG thumbnail |

**Functions to modify:**

| Function | Change |
|----------|--------|
| `renderClip` | Accept extended `RenderOptions` with `subtitleFile`, `ctaConfig`, `watermarkText`. Build compound `-vf` filter chain by composing `getScaleFilter` + `buildSubtitleFilter` + `buildCtaFilter` + `buildWatermarkFilter`. |
| `RenderOptions` (type) | Add `ctaConfig?: { text: string; position: 'end' \| 'overlay'; duration: number }` field |

**Filter chain composition order:**
```
scale → subtitles (ass) → CTA (drawtext) → watermark (drawtext)
```

Each filter is optional. Filters are joined with commas in the `-vf` argument. If no filters beyond scale are present, behavior is identical to current implementation.

### 3. Existing Packages (No Changes Needed)

| Package | Status | Notes |
|---------|--------|-------|
| `packages/s3` | No changes | `putObject`, `getObjectStream` already exist |
| `packages/s3/src/paths.ts` | No changes | `clipPath()`, `thumbnailPath()` already exist with safe ID validation |
| `packages/queue` | No changes | `QUEUE_NAMES.VIDEO_RENDER`, `DEFAULT_JOB_OPTIONS` already defined |
| `packages/types` | No changes | `VideoRenderJobData` already includes `subtitleSegments`, `cta`, `watermark` |
| `packages/db` | No changes | `Clip` model already has `filePath`, `thumbnailPath`, `status` fields |

### 4. No New tRPC Routes

The video render worker is a background job. No new API endpoints are needed. The existing `clip.getByVideo` query (from moments-virality feature) already returns `filePath`, `thumbnailPath`, and `status`, which the frontend uses to display render progress and results.

## Data Flow (Detailed)

```
Step 1: Job Received
  ├── BullMQ dequeues VideoRenderJobData from 'video-render' queue
  ├── Worker validates job data presence (clipId, videoId, sourceFilePath)
  └── prisma.clip.update({ status: 'rendering' })

Step 2: Setup Temp Directory
  ├── mkdtemp(os.tmpdir() + '/render-') → /tmp/render-AbCdEf/
  └── All temp files scoped under this directory

Step 3: Download Source Video
  ├── downloadFromS3(job.data.sourceFilePath, tempDir + '/source.mp4')
  └── Validates file exists after download (stat check)

Step 4: Write Subtitle File (if subtitleSegments.length > 0)
  ├── Convert segments to ASS format with styling:
  │   - Font: Arial, 48px, white with black outline
  │   - Position: bottom center (for portrait/square), bottom third (landscape)
  │   - Timing: adjusted relative to clip start (segment.start - job.startTime)
  └── writeSubtitleFile(segments, tempDir + '/subs.ass')

Step 5: Build FFmpeg Filter Chain
  ├── Base: getScaleFilter(format)
  ├── + buildSubtitleFilter(tempDir + '/subs.ass')     [if subs exist]
  ├── + buildCtaFilter(cta, endTime - startTime)        [if cta defined]
  └── + buildWatermarkFilter('KlipMaker.ru')            [if watermark: true]

Step 6: Render Clip
  ├── renderClip({ inputPath, outputPath: tempDir + '/output.mp4', ... })
  ├── FFmpeg subprocess with 5-min timeout
  └── Output: H.264 MP4 with AAC audio, faststart flag

Step 7: Generate Thumbnail
  ├── generateThumbnail(tempDir + '/output.mp4', tempDir + '/thumb.jpg')
  ├── Extract frame at 25% of clip duration (most likely engaging frame)
  └── Output: JPEG, same resolution as clip

Step 8: Upload to S3
  ├── clipKey = clipPath(userId, videoId, clipId) → 'clips/{userId}/{videoId}/{clipId}.mp4'
  ├── thumbKey = thumbnailPath(userId, videoId, clipId) → 'thumbnails/{userId}/{videoId}/{clipId}.jpg'
  ├── putObject(clipKey, clipBuffer, 'video/mp4')
  └── putObject(thumbKey, thumbBuffer, 'image/jpeg')

Step 9: Update Database
  └── prisma.clip.update({
        where: { id: clipId },
        data: {
          filePath: clipKey,
          thumbnailPath: thumbKey,
          status: 'ready',
        },
      })

Step 10: Cleanup (in finally block, always runs)
  └── rm -rf tempDir (fs.rm with recursive: true, force: true)
```

### Obtaining userId for S3 Paths

The `VideoRenderJobData` does not include `userId`. The worker must look it up:

```typescript
const clip = await prisma.clip.findUniqueOrThrow({
  where: { id: clipId },
  select: { userId: true },
});
```

This query runs once per job before the S3 upload step. The `Clip` model has `userId` as a direct field (no join needed).

## Files to Modify

| File | Change Description |
|------|-------------------|
| `apps/worker/lib/ffmpeg.ts` | Add `buildSubtitleFilter()`, `buildCtaFilter()`, `buildWatermarkFilter()`, `writeSubtitleFile()`, `generateThumbnail()`. Extend `RenderOptions` type with `ctaConfig`. Modify `renderClip()` to compose filter chain from optional filters. |
| `apps/worker/workers/video-render.ts` | Complete implementation: temp dir isolation, S3 download, subtitle file generation, extended renderClip call, thumbnail generation, S3 upload, DB update with both paths, cleanup in finally. Reduce concurrency to 2. |

## Files to Create

None. All required packages, types, S3 operations, queue definitions, and DB models already exist.

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Subtitle format | ASS (Advanced SubStation Alpha) | FFmpeg's `ass` filter supports styled subtitles (font, color, outline, position). SRT lacks styling. ASS allows per-segment control of appearance without re-encoding overhead. |
| CTA rendering | FFmpeg `drawtext` filter | No external dependencies. Supports timed enable/disable via `enable='between(t,start,end)'`. Text is sanitized before embedding. |
| Watermark rendering | FFmpeg `drawtext` filter | Lightweight. No image file dependency. Semi-transparent text in corner. Same filter chain as CTA. |
| Thumbnail extraction | FFmpeg single-frame extract (`-vframes 1`) | Reuses existing FFmpeg binary. No additional dependency. Fast (single seek + decode). |
| Thumbnail position | 25% of clip duration | Empirically better than first frame (often black) or middle frame. Early enough to show content, late enough to skip intros. |
| Temp directory strategy | `os.tmpdir()` + `mkdtemp` per job | OS-managed temp path, random suffix prevents collision between concurrent jobs, cleanup in finally ensures no leak. |
| S3 upload method | `putObject` with `Buffer` | Clip files are short (15-90s at 1080p, typically 5-30MB). Buffer fits in memory. Multipart upload unnecessary for MVP. |
| Concurrency | 2 concurrent jobs per worker | FFmpeg is CPU-bound. At 2 concurrent jobs on a 4-core VPS, each job gets ~2 cores. Prevents OOM and CPU starvation. |
| Codec settings | H.264 `libx264`, preset `fast`, CRF 23, AAC 128k | Good quality/size balance for shorts. `fast` preset is ~2x faster than `medium` with minimal quality loss at CRF 23. `faststart` enables progressive playback. |
| Filter chain order | scale, subtitles, CTA, watermark | Scale first ensures consistent canvas. Subtitles render on scaled video. CTA and watermark overlay last so they are never obscured. |
| Subtitle timing adjustment | Relative to clip start | Transcript segments use absolute timestamps from the source video. Subtract `startTime` to align with the clip's 0-based timeline. |
| No new packages | Reuse existing infra | All building blocks exist: S3 ops, download helper, queue, types, Prisma, FFmpeg. Adding packages increases maintenance surface without benefit. |

## Error Handling Matrix

| Error | Detection | Recovery | DB State |
|-------|-----------|----------|----------|
| S3 source not found | `downloadFromS3` throws (GetObject 404) | Mark clip as `failed`, log error, do not retry (source missing is permanent) | `status: 'failed'` |
| S3 download transient error | `getObjectStream` throws (500/502/503) | BullMQ retry (3 attempts, exponential backoff: 5s, 10s, 20s) | `status: 'rendering'` until retry succeeds or exhausted |
| FFmpeg render timeout | `SIGKILL` after 5 minutes | BullMQ retry. If clip duration > 120s, log warning (may need higher timeout). | `status: 'rendering'` until retry |
| FFmpeg non-zero exit | `renderClip` rejects with stderr | BullMQ retry. Log last 500 chars of stderr for debugging. | `status: 'rendering'` until retry |
| FFmpeg binary not found | `spawn` emits `ENOENT` error | Fatal: worker cannot function. Log critical error. No retry (infrastructure issue). | `status: 'failed'` |
| Invalid subtitle segments | Empty array or malformed data | Skip subtitle filter (render without subs). Log warning. | Clip renders without subtitles |
| Thumbnail generation fails | `generateThumbnail` throws | Render proceeds. Upload clip without thumbnail. Set `thumbnailPath: null`. Log warning. | `status: 'ready'`, `thumbnailPath: null` |
| S3 upload fails (clip) | `putObject` throws | BullMQ retry. Rendered file still in temp dir for retry attempt. | `status: 'rendering'` until retry |
| S3 upload fails (thumbnail only) | `putObject` throws for thumbnail | Log warning, continue. Clip is usable without thumbnail. | `status: 'ready'`, `thumbnailPath: null` |
| DB update fails | Prisma throws | BullMQ retry. S3 files already uploaded (idempotent). | Previous status preserved |
| Temp dir cleanup fails | `fs.rm` throws | Log error but do not throw (already in finally). OS will clean `/tmp` periodically. | Unaffected |
| Disk space exhausted | `ENOSPC` during download or render | BullMQ retry. Log critical. Alert ops (disk monitoring). | `status: 'rendering'` until retry or `failed` |
| BullMQ retries exhausted (3 attempts) | `worker.on('failed')` event | Set `status: 'failed'` in `onFailed` handler. Log final error with all attempt details. | `status: 'failed'` |
| Clip already in terminal state | `status` is `ready` or `failed` before processing | Skip job (idempotency guard). Return early without error. | Unchanged |

## Security Considerations

| Concern | Mitigation |
|---------|-----------|
| **FFmpeg command injection** | All FFmpeg arguments passed as array elements to `spawn()` / `execFile()` (never string concatenation with `exec()`). User-provided text (CTA, watermark) is never interpolated into shell commands. The `drawtext` filter text is escaped via FFmpeg's text escaping (colons, backslashes, single quotes). |
| **Path traversal in S3 keys** | `packages/s3/src/paths.ts` validates all path segments with `/^[a-zA-Z0-9_-]+$/` regex. `clipPath()` and `thumbnailPath()` reject IDs containing slashes, dots, or other special characters. No user-supplied strings are used directly as file paths. |
| **Temp file isolation** | Each job gets a unique temp directory via `mkdtemp()` with random suffix. Directory permissions default to `0o700` (owner-only). Cleanup runs in `finally` block. No temp files escape to shared locations. |
| **Temp file cleanup guarantee** | `finally` block calls `fs.rm(tempDir, { recursive: true, force: true })`. Runs on success, error, and timeout. Even if the process crashes, OS `/tmp` cleanup handles orphans. |
| **Subtitle text injection** | ASS subtitle files are written programmatically with proper escaping. No raw user text is interpolated into FFmpeg filter expressions. Subtitle content comes from STT transcription (server-generated), not direct user input. |
| **CTA text sanitization** | CTA text originates from LLM generation (server-side). Before embedding in `drawtext` filter, text is sanitized: strip control characters, escape FFmpeg special chars (`'`, `\`, `:`). Maximum length enforced (100 chars). |
| **Resource exhaustion (DoS)** | Worker concurrency limited to 2. FFmpeg has 5-minute timeout. BullMQ rate limiting can be applied per queue. Job data `endTime - startTime` is validated (max 90 seconds for shorts). |
| **S3 credential exposure** | S3 client uses server-side environment variables (`S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`). Never logged, never included in job data. |
| **No user-uploaded overlays** | Watermark is hardcoded text (`KlipMaker.ru`), not a user-supplied image. CTA is text-only. This eliminates a class of attacks via malicious image/font files. |
| **File type validation** | Source video was validated at upload time (magic bytes check). Rendered output is always MP4 (controlled by FFmpeg codec args). Thumbnail is always JPEG (controlled by FFmpeg output format). |

## Scalability

| Dimension | Current (MVP) | Scale Path |
|-----------|--------------|------------|
| Concurrency | 2 jobs per worker instance | Add worker-video replicas in Docker Compose. BullMQ distributes jobs automatically. |
| Clip duration | Max 90s (shorts) | Sufficient for product scope. For longer clips: increase FFmpeg timeout, use streaming upload. |
| File size | Source up to 4GB, output typically 5-30MB | Source is streamed to disk. Output fits in memory buffer for `putObject`. For larger outputs: switch to S3 multipart upload. |
| Temp storage | OS tmpdir (typically 10-50GB on VPS) | Mount dedicated tmpfs or volume. Monitor with Prometheus disk alerts. |
| Parallel clips per video | Sequential per worker, parallel across workers | 10 clips from one video = 10 independent jobs. BullMQ distributes across available workers. |
| Thumbnail generation | Synchronous after render | Could be a separate lightweight job. Not needed for MVP volumes. |

## Consistency with Project Architecture

This feature operates entirely within the existing architectural boundaries:

- **No new services:** Uses the existing `worker-video` Docker service with FFmpeg pre-installed.
- **No new queues:** Uses the existing `video-render` queue already defined in `packages/queue`.
- **No new types:** Uses the existing `VideoRenderJobData` already defined in `packages/types`.
- **No new DB migrations:** Uses existing `Clip` model fields (`filePath`, `thumbnailPath`, `status`).
- **No new API routes:** Background worker only. Frontend reads clip status via existing tRPC queries.
- **Pattern compliance:** BullMQ worker with retry, Pino structured logging, Prisma for DB access, S3 for storage -- all consistent with the project's Distributed Monolith pattern.
