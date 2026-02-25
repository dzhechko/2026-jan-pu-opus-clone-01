# Final Summary: Video Render

## Feature Overview

FFmpeg-based video rendering pipeline that transforms clip candidates (from the LLM Analyze stage) into publication-ready short videos with burned-in Russian subtitles, CTA overlays, watermarks, and thumbnails. The final step before auto-posting to VK/Rutube/Dzen/Telegram.

## What Gets Built

### Worker (`apps/worker`)
- **Enhanced `renderClip` function** (`apps/worker/lib/ffmpeg.ts`) — Add ASS subtitle burn-in, CTA drawtext overlay, watermark drawtext overlay, and `filter_complex` composition
- **ASS file generator** (`apps/worker/lib/ffmpeg.ts`) — Convert `subtitleSegments` array to a styled `.ass` file with Montserrat Bold, Cyrillic encoding, and proper timing
- **Thumbnail extractor** (`apps/worker/lib/ffmpeg.ts`) — Extract JPEG frame at 25% clip duration
- **S3 upload integration** (`apps/worker/workers/video-render.ts`) — Upload rendered clip and thumbnail to S3, update Clip record with final paths
- **Temp file cleanup** — Reliable cleanup of `.mp4`, `.ass`, `.jpg` temp files in `finally` block

### No New Files Required (Enhancement of Existing)
- `apps/worker/lib/ffmpeg.ts` — Enhance `renderClip` + add `generateAssFile` + add `extractThumbnail`
- `apps/worker/workers/video-render.ts` — Add S3 upload, thumbnail generation, temp cleanup

### Docker
- Add Montserrat Bold font to worker Docker image
- Add `fc-cache` step for font registration

## Pipeline Flow

```
BullMQ Job (video-render queue)
  │
  ├─ 1. Generate ASS subtitle file from subtitleSegments
  │     └─ /tmp/subs-{clipId}.ass
  │
  ├─ 2. Render clip with filter_complex
  │     ├─ [0:v] → scale/pad (format-dependent)
  │     ├─ → ass filter (subtitle burn-in)
  │     ├─ → drawtext (watermark, if free plan)
  │     ├─ → drawtext (CTA, timed at end)
  │     └─ → /tmp/clip-{clipId}.mp4
  │
  ├─ 3. Extract thumbnail
  │     └─ /tmp/thumb-{clipId}.jpg (frame at 25% duration)
  │
  ├─ 4. Upload to S3
  │     ├─ clips/{userId}/{videoId}/{clipId}.mp4
  │     └─ thumbnails/{userId}/{videoId}/{clipId}.jpg
  │
  ├─ 5. Update Clip record
  │     ├─ filePath = S3 clip path
  │     ├─ thumbnailPath = S3 thumbnail path
  │     └─ status = "ready"
  │
  └─ 6. Cleanup temp files (always, in finally block)
```

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Subtitle format | ASS via `ass` filter | Best Cyrillic styling: bold, outline, shadow, positioning |
| CTA/watermark | drawtext filter | Simple static/timed text, no external file needed |
| Filter composition | `filter_complex` | Safe programmatic construction with named streams |
| Encoding | H.264 CRF 23, `fast` preset | Good quality-size balance; platforms re-encode anyway |
| Audio | AAC 128k, 44100 Hz, stereo | Standard for speech-dominant content |
| Font | Montserrat Bold (OFL) | Clean modern look, full Cyrillic, free license |
| Thumbnail | I-frame at 25% duration | Avoids intro transitions and outro CTA |
| Concurrency | 3 parallel renders | Already set in worker; matches 4-vCPU VPS capacity |
| Hardware acceleration | None (CPU only) | VPS has no GPU; 15-60s clips render fast enough on CPU |

## Key Numbers

| Metric | Value |
|--------|-------|
| Render time (30s clip) | ~20-35s |
| Render time (10 clips, parallel) | ~70-120s |
| Output file size (30s clip) | ~6-12 MB |
| Thumbnail size | ~50-150 KB |
| S3 storage per video (10 clips) | ~81 MB |
| Storage cost per video/month | ~0.12₽ |
| FFmpeg timeout | 5 minutes |
| Worker concurrency | 3 |
| BullMQ retry | 3 attempts, exponential backoff |

## Files Changed

| File | Change Type | Description |
|------|------------|-------------|
| `apps/worker/lib/ffmpeg.ts` | Modify | Add `generateAssFile()`, `extractThumbnail()`, enhance `renderClip()` with subtitle/CTA/watermark filter_complex |
| `apps/worker/workers/video-render.ts` | Modify | Add S3 upload, thumbnail generation, temp file cleanup, use enhanced `renderClip` options |

## Detailed Change Scope

### `apps/worker/lib/ffmpeg.ts`

**New functions:**
- `generateAssFile(segments, outputPath)` — Converts `subtitleSegments` array to a `.ass` file with styled Cyrillic subtitles (Montserrat Bold 48pt, white text, black outline, bottom-center alignment)
- `extractThumbnail(inputPath, outputPath, seekTime)` — Extracts a single JPEG frame using keyframe-based seek

**Modified functions:**
- `renderClip(options)` — Extend `RenderOptions` type to accept `subtitleFile`, `ctaText`, `ctaPosition`, `ctaDuration`, `watermarkText`. Build `filter_complex` string programmatically: scale -> ass -> drawtext (watermark) -> drawtext (CTA). Replace simple `-vf` with full `filter_complex` and `-map` arguments.

### `apps/worker/workers/video-render.ts`

**Enhanced job handler:**
1. Generate ASS file from `job.data.subtitleSegments`
2. Call enhanced `renderClip` with all overlay options
3. Call `extractThumbnail` for thumbnail generation
4. Upload clip MP4 and thumbnail JPEG to S3 via existing S3 client
5. Update Clip record with `filePath`, `thumbnailPath`, `status: 'ready'`
6. Cleanup all temp files in `finally` block

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| FFmpeg crash on specific input | Low | Medium | 3x BullMQ retry with exponential backoff; stderr logging for debugging |
| Font missing in Docker image | Low | High | Build-time verification; `fc-list` health check on worker startup |
| Temp disk full on VPS | Low | High | `finally` cleanup; Docker tmpfs mount; monitoring alert at 80% |
| ASS encoding issue with Cyrillic | Low | Medium | UTF-8 BOM prefix; explicit `PlayResX/Y` matching output resolution |
| S3 upload failure after render | Low | Medium | Retry S3 upload 3x; clip stays at `rendering` status until confirmed |
| CTA timing mismatch | Low | Low | CTA `enable` expression derived from actual clip duration, not estimated |

## Dependencies

- **Requires**: S3 Upload feature (completed) — S3 client for uploading rendered clips
- **Requires**: STT Subtitles feature (completed) — Provides `subtitleSegments` in Clip records
- **Requires**: Moments + Virality feature (completed) — Creates Clip records and enqueues render jobs
- **Required by**: Auto-Post feature (US-08) — Needs rendered clips with `status: 'ready'`
- **Uses**: BullMQ `video-render` queue (existing), Prisma `Clip` model (existing), FFmpeg 7 (system dependency)

## Estimated Effort

| Task | Estimate |
|------|----------|
| ASS file generator + tests | 0.5 day |
| Enhanced renderClip with filter_complex | 1 day |
| Thumbnail extraction | 0.25 day |
| S3 upload integration in worker | 0.5 day |
| Temp file cleanup + error handling | 0.25 day |
| Docker font setup | 0.25 day |
| Integration testing (end-to-end render) | 0.5 day |
| **Total** | **~2.5-3 days** |

## Non-Goals (Explicitly Out of Scope)

- GPU/hardware acceleration (not available on VPS)
- Animated text effects or transitions (phase 2 feature)
- Multiple subtitle styles per clip (single style sufficient for MVP)
- Video preview before render (requires streaming, deferred)
- Custom font upload by user (Montserrat only for MVP)
- Re-encoding quality tiers per plan (same CRF 23 for all plans)
