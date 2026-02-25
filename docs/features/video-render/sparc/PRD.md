# PRD: Video Render (FFmpeg Worker)

## Executive Summary

Implement the FFmpeg-based video rendering worker that transforms Clip records (created by the LLM analyze pipeline) into final MP4 short-form videos with burned-in Russian subtitles, CTA overlays, and watermarks, then uploads them to S3 and generates thumbnails. This is the critical bridge between AI analysis and user-downloadable/publishable content.

## Problem Statement

The LLM analyze worker successfully creates Clip records with timestamps, virality scores, titles, subtitle segments, and CTA suggestions. It enqueues render jobs via `addBulk` to the `video-render` queue. However, the current `video-render.ts` worker (66 lines) is a skeleton that:

1. **Does not burn subtitles** -- `subtitleSegments` from the job data are ignored; `renderClip()` never receives a subtitle file
2. **Does not render CTA overlays** -- the `cta` field (text + position + duration) is destructured but never used
3. **Does not upload to S3** -- there is a `TODO` comment where the S3 upload should be; `filePath` is set to a local path pattern, not an actual S3 key
4. **Does not generate thumbnails** -- `thumbnailPath` in the Clip model is never populated
5. **Does not clean up temp files** -- rendered MP4 files accumulate in `/tmp`

Without this feature, users see clips with status `ready` but cannot download, preview, or publish them. The entire pipeline is blocked at the last mile.

## Target Users

- **Online course authors** using КлипМейкер to convert webinar recordings into promotional shorts
- **Content managers** reviewing and approving generated clips before publishing
- **Downstream workers** (publish worker) that need `filePath` pointing to a valid S3 object

## Core Value Proposition

Fully automated last-mile rendering: from AI-selected moments to download-ready MP4 shorts with professional subtitles, branding, and CTAs -- zero manual video editing required.

## Key Features (MVP)

### F1: Trim + Reframe

Trim the source video to `[startTime, endTime]` and reframe to the target format:
- **Portrait** (1080x1920, 9:16) -- primary for VK Clips, Shorts, Reels
- **Square** (1080x1080, 1:1) -- for Telegram, Dzen
- **Landscape** (1920x1080, 16:9) -- for Rutube, standard YouTube

Use existing `getScaleFilter()` with `force_original_aspect_ratio=decrease` and center padding.

### F2: Subtitle Burn-In

Render subtitle segments directly onto the video using FFmpeg's `ass` (Advanced SubStation Alpha) filter:
- Generate a `.ass` file from `subtitleSegments` array (`{start, end, text}`)
- Timestamps are relative to the clip (not the source video)
- Default style: white text, black semi-transparent background, bottom-center placement
- Font: "Noto Sans" (supports Cyrillic), 48px for portrait, 36px for square/landscape
- Max 2 lines per segment, word-wrap enabled
- Future: user-customizable `SubtitleStyle` (fontFamily, fontSize, fontColor, backgroundColor, bold, shadow)

### F3: CTA Overlay

Render a call-to-action based on `cta` from job data:
- **Position: `end`** -- append a 3-5 second branded frame after the clip with CTA text centered
- **Position: `overlay`** -- draw CTA text as a lower-third overlay during the last N seconds of the clip
- Text styling: white on semi-transparent dark background, 40px, Cyrillic-safe font
- CTA duration from `cta.duration` (default 3 seconds)

### F4: Watermark

For free-plan users (`watermark: true` in job data):
- Semi-transparent "KlipMaker.ru" text in the top-right corner
- Small enough to not obstruct content, large enough to be readable
- Applied via FFmpeg `drawtext` filter

### F5: S3 Upload

After successful rendering:
- Read the rendered MP4 from temp file
- Upload to S3 using `putObject()` from `@clipmaker/s3`
- S3 path via `clipPath(userId, videoId, clipId)` -- resolves to `clips/{userId}/{videoId}/{clipId}.mp4`
- Update `Clip.filePath` with the S3 key
- Requires fetching `userId` from the Clip record (join with Video)

### F6: Thumbnail Generation

Extract a single frame from the rendered clip as a JPEG thumbnail:
- Extract at 25% of clip duration (to capture an interesting moment, not a blank intro)
- Resolution: 640x360 (landscape), 360x640 (portrait), 360x360 (square)
- Quality: JPEG 85%
- Upload to S3 via `thumbnailPath(userId, videoId, clipId)` -- resolves to `thumbnails/{userId}/{videoId}/{clipId}.jpg`
- Update `Clip.thumbnailPath` with the S3 key

### F7: Temp File Cleanup

Ensure all temporary files are removed in a `finally` block:
- Source video download (if downloaded from S3)
- Generated `.ass` subtitle file
- Rendered MP4 file (after S3 upload)
- Thumbnail JPEG (after S3 upload)

### F8: Status Management and Error Handling

- Set `Clip.status = 'rendering'` at job start (already implemented)
- Set `Clip.status = 'ready'` on success with `filePath` and `thumbnailPath`
- Set `Clip.status = 'failed'` on error (already implemented)
- Check if all clips for a video are done; if so, update `Video.status = 'completed'`
- BullMQ retry: 3 attempts with exponential backoff (from `DEFAULT_JOB_OPTIONS`)

## Technical Context

### Existing Infrastructure

| Component | Location | Status |
|-----------|----------|--------|
| `renderClip()` | `apps/worker/lib/ffmpeg.ts` | Has trim + scale + H.264 encoding; missing subtitle/CTA/watermark filters |
| `video-render.ts` | `apps/worker/workers/video-render.ts` | Skeleton: 66 lines, missing S3 upload, subtitle, CTA, thumbnail |
| `putObject()` | `packages/s3/src/operations.ts` | Ready: uploads buffer with content type and retry |
| `clipPath()` | `packages/s3/src/paths.ts` | Ready: generates safe S3 key |
| `thumbnailPath()` | `packages/s3/src/paths.ts` | Ready: generates safe S3 key |
| `downloadFromS3()` | `apps/worker/lib/s3-download.ts` | Ready: streams S3 object to local file |
| `VideoRenderJobData` | `packages/types/src/queue.ts` | Defined with all needed fields |
| `Clip` model | `packages/db/prisma/schema.prisma` | Has `filePath`, `thumbnailPath`, `status` fields |

### FFmpeg Configuration

- **Codec:** libx264, preset `fast`, CRF 23
- **Audio:** AAC 128kbps
- **Container:** MP4 with `+faststart` (moov atom at start for streaming)
- **Timeout:** 5 minutes per clip (FFMPEG_TIMEOUT = 300,000ms)
- **Subprocess:** `spawn` (not node bindings) for isolation and timeout control

### Queue Contract

The LLM analyze worker enqueues render jobs with this data shape:
```
VideoRenderJobData {
  clipId: string
  videoId: string
  sourceFilePath: string        // S3 key of source video
  startTime: number             // seconds
  endTime: number               // seconds
  format: 'portrait' | 'square' | 'landscape'
  subtitleSegments: Array<{start, end, text}>  // relative to clip
  cta?: {text, position: 'end' | 'overlay', duration: number}
  watermark: boolean
}
```

## Success Criteria

| Metric | Target | Rationale |
|--------|--------|-----------|
| Render time (60s clip, 1080p) | < 120 seconds | Users expect near-real-time; pipeline total < 5 min |
| Render success rate | >= 99% | Failed renders block entire user flow |
| GPU/CPU cost per clip | < 5 kopecks | Business model requires 0.34 rub/min processing |
| Output file size (60s portrait) | 8-15 MB | Balance quality vs upload/download speed |
| Subtitle accuracy | Exact match with STT segments | No dropped or misaligned subtitles |
| Thumbnail quality | JPEG, identifiable content | Must look good in clip gallery UI |
| Temp file cleanup | 100% removal rate | VPS disk is limited (50-200 GB) |
| S3 upload success | 99.9% (with retry) | S3 operations use existing `withRetry` |

## Non-Functional Requirements

### Video Output Specification

| Parameter | Value |
|-----------|-------|
| Video codec | H.264 (libx264) |
| Video profile | High, Level 4.1 |
| CRF | 23 (visually lossless for web) |
| Preset | `fast` (encode speed vs compression tradeoff) |
| Resolution (portrait) | 1080x1920 |
| Resolution (square) | 1080x1080 |
| Resolution (landscape) | 1920x1080 |
| Audio codec | AAC |
| Audio bitrate | 128 kbps |
| Audio sample rate | 44100 Hz |
| Container | MP4 |
| faststart | Yes (`-movflags +faststart`) |
| Max clip duration | 180 seconds |
| Pixel format | yuv420p (compatibility) |

### Performance Constraints

- **Concurrency:** 3 parallel render jobs per worker instance (current setting)
- **Timeout:** 5 minutes per render (kill FFmpeg process on timeout)
- **Disk:** Each render uses ~100 MB temp space (source chunk + output + thumbnail)
- **Memory:** FFmpeg subprocess, not in-process -- memory isolated from Node.js
- **Scaling:** Horizontal via additional worker instances (Docker replicas)

### Security

- Source file paths validated via `assertSafeSegment()` in `clipPath()`
- No shell injection: FFmpeg invoked via `spawn` with args array (no string interpolation)
- Temp files in `os.tmpdir()` with unique names per clipId
- Files deleted in `finally` block regardless of success/failure

## Out of Scope (This Feature)

- **Re-encoding with GPU** (NVENC/VAAPI) -- future optimization when VPS has GPU
- **Multiple format renders per clip** -- user selects one format; multi-format is a future feature
- **Custom fonts/branding** -- MVP uses system fonts; brand kit is a separate feature
- **Progress reporting via WebSocket** -- render progress is not streamed to UI in MVP
- **Audio normalization** -- loudness normalization (EBU R128) is a future enhancement
- **Video-to-video AI upscaling** -- out of scope for MVP
- **Animated CTA transitions** -- MVP uses static overlay/appended frame

## Dependencies

- `@clipmaker/s3` package (putObject, getObjectStream, clipPath, thumbnailPath)
- `@clipmaker/db` (Prisma client for Clip and Video updates)
- `@clipmaker/queue` (BullMQ worker, queue names)
- `@clipmaker/types` (VideoRenderJobData type)
- FFmpeg 7 binary installed in Docker image
- Font files: Noto Sans (Cyrillic support) installed in Docker image
- Upstream: LLM analyze worker creates Clip records and enqueues render jobs
- Downstream: Publish worker reads `Clip.filePath` to upload to platforms

## User Stories Covered

- **US-03:** "As a user, I want my clips rendered with subtitles so they are accessible and engaging"
- **US-04:** "As a user, I want a CTA on my clips to drive traffic to my course"
- **US-06:** "As a user, I want to download rendered clips as MP4 files"
- Part of **US-07:** "As a user, I want clips auto-posted to VK/Rutube" (rendering must complete first)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| FFmpeg subtitle filter fails on edge-case Cyrillic text | Medium | High | Sanitize subtitle text (escape ASS special chars), integration tests with Cyrillic samples |
| Temp disk fills up under load | Low | Critical | `finally` cleanup, monitoring, `/tmp` space alert |
| Source video S3 download slow (4 GB file) | Medium | Medium | Download only the needed segment via byte-range (future); for MVP, full download + `-ss` seek |
| Rendering exceeds 5-min timeout for long clips | Low | Medium | Max clip duration 180s; timeout is generous for 3-min clips |
| CTA `end` mode increases total duration unexpectedly | Low | Low | Document that final MP4 = clip duration + CTA duration |
