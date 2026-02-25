# Refinement: Video Render

## Edge Cases Matrix

| # | Edge Case | Impact | Handling |
|---|-----------|--------|----------|
| 1 | Source video not found in S3 | Render impossible | HeadObject check before download. If missing, mark clip `failed`, log `render_source_missing`. Do NOT retry (source won't reappear). Notify user: "Исходное видео не найдено, загрузите заново". |
| 2 | Source video corrupted/truncated | FFmpeg exits non-zero | ffprobe validation before render: check duration > 0 and codec presence. If corrupt, mark clip `failed` with `reason: 'source_corrupted'`. Skip retries. |
| 3 | Very short clip (15 seconds) | Fast render, but all overlays still needed | No special handling required. Ensure CTA duration clamped to clip duration (see edge case #8). Subtitles, watermark, and thumbnail all apply normally. Target: <15s render time. |
| 4 | Very long clip (60s from 3-hour video) | Large source file download, seek time | Use `-ss` before `-i` (input seeking) for fast seek. Download only needed range if S3 supports Range GET. Timeout stays 5 min — sufficient for 60s clip even from large source. |
| 5 | No subtitles (empty segments array) | No ASS file to burn | Skip subtitle filter entirely. Filter chain: scale + (optional CTA drawtext) + (optional watermark drawtext). No temp ASS file created. |
| 6 | Subtitles with very long text (word wrap needed) | Text overflows frame width | ASS format `\q2` (smart wrap) + `WrapStyle: 2` in header. Set `PlayResX: 1080` for portrait/square, `PlayResX: 1920` for landscape. Max line width ~35 chars for portrait, ~50 for landscape. If single word exceeds width, ASS auto-wraps at glyph level. |
| 7 | Subtitles with special characters (quotes, backslashes) | FFmpeg filter escaping breaks | ASS file is written to disk (not inline filter), so FFmpeg filter escaping is not needed for subtitle text. However, the ASS file path in the `-vf` filter must escape colons and backslashes: `ass=path\\:to\\:file.ass`. On Linux, colons in `/tmp/clip-uuid.ass` are unlikely. Sanitize subtitle text for ASS: escape `{`, `}`, `\n` to ASS equivalents (`\{`, `\}`, `\N`). |
| 8 | CTA with 'end' position + 5s duration on 15s clip | 1/3 of clip is CTA overlay — acceptable but warn | Clamp CTA duration to `min(cta.duration, clipDuration * 0.5)` to never exceed 50% of clip. Log warning if clamped: `cta_duration_clamped`. For 15s clip with 5s CTA: renders as 5s (within 50% limit of 7.5s). |
| 9 | CTA with 'overlay' position | Persistent semi-transparent banner | drawtext filter with `enable='gte(t,0)'` (always visible). Position: bottom-center, above watermark. Background box with 60% opacity. Font size scaled to format resolution. |
| 10 | No CTA (null/undefined) | No CTA drawtext in filter chain | Skip CTA drawtext filter. Filter chain: scale + subtitles + (optional watermark). No error, no placeholder. |
| 11 | Watermark on dark vs light backgrounds | Watermark may be invisible | Use white text with black shadow (shadowx=2:shadowy=2) for visibility on any background. Semi-transparent (alpha=0.4). Position: bottom-right with 20px margin. Watermark text is always white regardless of content. |
| 12 | Concurrent renders of same video (different clips) | Multiple workers download same source | S3 source download cached in `/tmp/source-{videoId}.mp4`. Use file lock (flock) or check-before-download. Each clip output has unique path `/tmp/clip-{clipId}.mp4`. No conflict on output files. Clean up source after all clips for video are rendered (or let OS tmpdir rotation handle it). |
| 13 | FFmpeg timeout (5 min exceeded) | Process killed with SIGKILL | Already implemented: `setTimeout` + `proc.kill('SIGKILL')`. Mark clip `failed` with `reason: 'render_timeout'`. Do NOT retry (same input will likely timeout again). Log full stderr for diagnosis. Clean up partial output file. |
| 14 | Disk space exhaustion during render | FFmpeg write fails, ENOSPC | Check available disk space before render: `fs.statfs(os.tmpdir())`. Require `sourceFileSize * 1.5` free space minimum. If insufficient, delay job (BullMQ `moveToDelayed`), log `disk_space_low`. Add monitoring alert for `/tmp` usage > 80%. |
| 15 | S3 upload failure after successful render | Rendered file exists locally, not in S3 | Retry S3 upload 3 times with exponential backoff (independent of BullMQ job retry). If all upload retries fail, keep local file, mark clip `failed` with `reason: 'upload_failed'`. On BullMQ job retry, check if local file exists to skip re-render. |

## Testing Strategy

### Unit Tests (7 tests)

| Test | Module | Description |
|------|--------|-------------|
| `build-filter-chain.test.ts` | `apps/worker/lib/ffmpeg` | Verifies FFmpeg `-vf` filter string construction for all 3 formats (portrait/square/landscape) with combinations of subtitles, CTA, and watermark enabled/disabled. 6 sub-cases: all on, no subtitles, no CTA, no watermark, nothing, CTA overlay vs end. |
| `generate-ass.test.ts` | `apps/worker/lib/subtitles` | ASS file generation from `SubtitleSegment[]`. Validates header (PlayResX/Y, WrapStyle), dialogue lines with correct timestamps (h:mm:ss.cc format), bold white style, shadow, and special character escaping (`{`, `}`, `\N`). |
| `clamp-cta-duration.test.ts` | `apps/worker/lib/cta` | CTA duration clamping: 5s CTA on 15s clip (no clamp), 5s CTA on 8s clip (clamped to 4s), 0s CTA (skipped), null CTA (skipped). |
| `thumbnail-args.test.ts` | `apps/worker/lib/ffmpeg` | Thumbnail extraction FFmpeg args: correct `-ss` (midpoint), output dimensions match format, single frame (`-frames:v 1`), JPEG quality. |
| `scale-filter.test.ts` | `apps/worker/lib/ffmpeg` | `getScaleFilter()` returns correct resolution for each format: 1080x1920, 1080x1080, 1920x1080 with proper padding. |
| `s3-output-path.test.ts` | `apps/worker/lib/paths` | Output S3 key generation: `clips/{videoId}/{clipId}.mp4` for video, `clips/{videoId}/{clipId}_thumb.jpg` for thumbnail. Validates UUID format in path. |
| `disk-space-check.test.ts` | `apps/worker/lib/system` | Disk space check utility: returns true when sufficient, false when low. Mock `fs.statfs` with various free space values. |

### Integration Tests (5 tests, with real FFmpeg)

| Test | Scope | Description | Test Asset |
|------|-------|-------------|------------|
| `render-portrait.test.ts` | FFmpeg + ASS | Full render of 5s test video to portrait (1080x1920) with 2 subtitle segments and watermark. Verify output dimensions with ffprobe, file size > 0, duration ~5s. | `fixtures/test-5s.mp4` (5s, 720p, with audio) |
| `render-square-no-subs.test.ts` | FFmpeg | Render to square (1080x1080) with no subtitles, CTA overlay, watermark. Verify dimensions and CTA text presence (OCR not needed — just verify ffprobe metadata and no error). | `fixtures/test-5s.mp4` |
| `render-with-cta-end.test.ts` | FFmpeg + CTA | Render with CTA position 'end', duration 3s. Verify total output duration = clip duration (CTA is overlay, not appended). | `fixtures/test-5s.mp4` |
| `render-special-chars.test.ts` | FFmpeg + ASS | Subtitle text containing quotes (`"`), backslashes (`\`), curly braces (`{}`), and Cyrillic with special punctuation. Verify render completes without FFmpeg error. | `fixtures/test-5s.mp4` |
| `render-thumbnail.test.ts` | FFmpeg | Thumbnail extraction from rendered clip. Verify output is valid JPEG, dimensions match format. | `fixtures/test-5s.mp4` |

### E2E Tests (3 tests, full pipeline)

| Test | Description |
|------|-------------|
| `video-render-pipeline.test.ts` | Enqueue `VideoRenderJobData` with all options (subtitles, CTA end, watermark) into BullMQ. Wait for job completion. Verify: clip status changes `pending` -> `rendering` -> `ready`, `filePath` is set, file exists at S3 path (mocked S3 or local). |
| `render-failure-recovery.test.ts` | Enqueue render job with non-existent source file. Verify: clip status becomes `failed`, job marked as failed in BullMQ, error logged with `render_source_missing` event. No retry attempted. |
| `concurrent-renders.test.ts` | Enqueue 3 render jobs for different clips of the same video simultaneously. Verify: all 3 complete successfully, source file downloaded once (or each independently), no file conflicts, all clips have unique output paths. |

### BDD Scenarios (Gherkin)

```gherkin
Feature: Video Clip Rendering

  Scenario: Render portrait clip with subtitles and watermark
    Given a video "webinar-123" exists with status "generating_clips"
    And a clip "clip-001" exists with format "portrait" and status "pending"
    And the clip has 5 subtitle segments in Russian
    And the clip has watermark enabled
    When the video-render worker processes the clip
    Then the clip status should become "rendering"
    And FFmpeg should produce a 1080x1920 MP4 file
    And the file should contain burned-in subtitles
    And the file should contain "КлипМейкер.ру" watermark
    And the file should be uploaded to S3 at "clips/webinar-123/clip-001.mp4"
    And the clip status should become "ready"

  Scenario: Render clip with CTA overlay
    Given a clip with CTA text "Подписывайтесь!" at position "overlay"
    When the video-render worker processes the clip
    Then the rendered video should show CTA text throughout the clip
    And the CTA should appear as semi-transparent banner at bottom-center

  Scenario: Render clip with CTA at end
    Given a clip of 30 seconds with CTA "Запишись на курс!" at position "end" for 5 seconds
    When the video-render worker processes the clip
    Then the CTA should appear during the last 5 seconds of the clip
    And the total clip duration should remain 30 seconds

  Scenario: Handle missing source video gracefully
    Given a clip references a video file that does not exist in S3
    When the video-render worker processes the clip
    Then the clip status should become "failed"
    And the error reason should be "source_not_found"
    And the job should NOT be retried

  Scenario: Render very short clip (15 seconds)
    Given a clip with startTime 10 and endTime 25
    And 2 subtitle segments and watermark enabled
    When the video-render worker processes the clip
    Then a valid 15-second MP4 should be produced
    And all overlays should be present

  Scenario: Handle FFmpeg timeout
    Given a clip that would take more than 5 minutes to render
    When the video-render worker starts processing
    Then the FFmpeg process should be killed after 5 minutes
    And the clip status should become "failed"
    And the error reason should be "render_timeout"
    And temporary files should be cleaned up
```

## Performance Optimizations

| Area | Optimization | Expected Impact |
|------|-------------|-----------------|
| Input seeking | Use `-ss` before `-i` (demuxer-level seek) instead of after (decoder-level). Already implemented in current `renderClip`. | ~10x faster seek on large source files (3-hour webinars). Avoids decoding all frames before start time. |
| Encoding preset | `libx264 -preset fast -crf 23` balances speed and quality. For time-critical batches, consider `-preset veryfast -crf 25` as degraded mode. | `fast`: ~2x realtime for 1080p. `veryfast`: ~3x realtime. |
| Parallel renders | Worker concurrency = 3 (already configured). Each clip is independent. 3 concurrent FFmpeg processes. | ~3x throughput per worker instance. Limit to 3 to avoid CPU saturation on 4-core VPS. |
| Source file caching | Cache downloaded S3 source in `/tmp/source-{videoId}.mp4`. Reuse across clips from same video. | Avoid re-downloading 500MB+ source for each of 10 clips. Save ~30s per clip after first download. |
| Thumbnail at seek | Extract thumbnail with `-ss {midpoint} -frames:v 1` — single frame, no full decode. | <1s per thumbnail. |
| Hardware acceleration | Future: VAAPI/NVENC if VPS has GPU. Current: CPU-only with `libx264`. | 5-10x encoding speedup with GPU. Not available on most VPS plans. |
| tmpdir on SSD | Ensure `/tmp` is on SSD. Avoid NFS or slow block storage for temp files. | Significant I/O improvement for large renders. |
| Faststart | `-movflags +faststart` already enabled. Moves moov atom to file start for instant playback. | No render speed impact, but improves user experience on clip preview. |

## Security Hardening

| Area | Measure |
|------|---------|
| Path injection | Never construct FFmpeg paths from user input. All paths built from UUIDs: `/tmp/clip-{uuid}.mp4`. Validate UUID format with regex before use. |
| FFmpeg argument injection | All FFmpeg args passed as array to `spawn`/`execFile` (never string concatenation with shell). No user-controlled strings in FFmpeg arguments except subtitle text (in ASS file, not inline). |
| ASS file injection | Subtitle text written to ASS file on disk. Escape `{`, `}`, and `\` in text to prevent ASS override tags injection (e.g., `{\fs100}` could change font size). Sanitize before writing. |
| Temp file cleanup | Always delete temp files in `finally` block: source video (if not cached), ASS file, output MP4 (after S3 upload), thumbnail (after S3 upload). Prevent `/tmp` filling up. |
| Resource limits | FFmpeg timeout: 5 min. Max concurrent: 3. Memory: FFmpeg subprocess inherits container memory limits (Docker `--memory`). Monitor with `process.memoryUsage()`. |
| S3 upload scope | Upload only to `clips/{videoId}/{clipId}.*` prefix. Presigned PUT URL restricted to specific key. Never allow overwrite of source videos. |
| File size validation | After render, check output file size > 0 and < 500MB (reasonable upper bound for 60s 1080p clip). Reject anomalous files. |
| Container isolation | FFmpeg runs inside Docker container with no network access needed (source downloaded by worker, not FFmpeg). Drop capabilities: `--cap-drop=ALL`. |

## Technical Debt Items

| Item | Priority | Notes |
|------|----------|-------|
| Subtitle styling UI | Medium | Currently hardcoded bold white with shadow. Should allow user to choose font, color, size, position. Requires schema change for `SubtitleStyle`. |
| ASS template engine | Medium | Current ASS generation is string concatenation. Should use a template system for maintainability and style presets. |
| GPU encoding support | Low | Add VAAPI/NVENC detection and fallback. Would require Docker image with GPU drivers. |
| Render progress reporting | Medium | FFmpeg outputs progress to stderr. Parse `time=` field and report to BullMQ `job.updateProgress()`. Show progress bar in UI. |
| Resumable renders | Low | If FFmpeg crashes mid-render, start from scratch. Could use FFmpeg segment muxer for checkpointing, but complexity is high. |
| Render queue priority | Medium | Pro/Business users should get priority rendering. BullMQ supports job priority — not yet implemented for video-render queue. |
| Source file lifecycle | High | No explicit cleanup of cached source files in `/tmp`. Rely on OS tmpdir rotation. Should implement LRU cache with max size (e.g., 10GB). |
| Watermark customization | Low | Currently hardcoded "КлипМейкер.ру". Business plan should allow custom watermark or no watermark. |
| Multi-resolution output | Low | Currently renders single format per clip. Could render all 3 formats in one pass for multi-platform posting. |
| Output format validation | Medium | After render, validate output with ffprobe: check codec, dimensions, duration, audio presence. Currently only check file existence. |
