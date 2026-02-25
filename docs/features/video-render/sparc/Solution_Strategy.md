# Solution Strategy: Video Render

## Problem Decomposition (First Principles)

### Fundamental Truths

1. Video rendering is a CPU-bound transform: bytes in (source) -> bytes out (clip) via FFmpeg
2. FFmpeg can trim, scale, overlay subtitles, draw text, and extract thumbnails in a single pass (filter graph)
3. Subtitles must be baked into the video (not sidecar) because VK/Rutube/Dzen shorts players do not support external subtitle tracks
4. S3 is the single source of truth for all media -- workers read from and write to S3
5. Temp files on disk are transient and must be cleaned up unconditionally
6. The source video is a full webinar (30-120 min); we only need a 15-180 second segment
7. Node.js should not handle video data in-process -- FFmpeg runs as a subprocess for memory isolation

### Root Cause Analysis (5 Whys)

- **Why can't users download clips?** -- `Clip.filePath` is set to a local path pattern, not uploaded to S3
- **Why isn't it uploaded?** -- The worker has a TODO comment where the upload should be
- **Why are subtitles missing?** -- The worker ignores `subtitleSegments` from job data; no ASS file is generated
- **Why is there no thumbnail?** -- Thumbnail extraction was never implemented; `thumbnailPath` stays null
- **Why is this incomplete?** -- The worker was scaffolded as a skeleton during the moments-virality feature, deferring rendering details to a dedicated feature

### SCQA Framework

- **Situation:** The LLM analyze worker creates Clip records with timestamps, subtitle segments, CTAs, and virality scores, then enqueues render jobs to the `video-render` BullMQ queue
- **Complication:** The video-render worker is a 66-line skeleton that renders a basic trimmed video to `/tmp` but never uploads it to S3, never burns subtitles, never adds CTAs or watermarks, never generates thumbnails, and never cleans up temp files
- **Question:** How do we implement a complete, production-grade FFmpeg rendering pipeline that takes job data and produces a fully finished clip in S3?
- **Answer:** Extend the worker with a multi-stage pipeline: download source from S3 -> generate ASS subtitle file -> build a single-pass FFmpeg filter graph (scale + subtitles + CTA + watermark) -> render to temp MP4 -> extract thumbnail -> upload both to S3 -> update DB -> clean up temp files

## TRIZ Analysis

### Contradiction 1: Render Speed vs Output Quality

- **Improving parameter:** Render speed (must be < 120s for a 60s clip)
- **Worsening parameter:** Output quality (higher quality = slower encoding)
- **Resolution (Principle 35 -- Parameter Changes):** Use CRF-based encoding instead of target bitrate. CRF 23 with preset `fast` gives near-transparent quality at 2-3x realtime speed on modern CPUs. This is the existing configuration and is optimal for the use case. If speed becomes an issue, `fast` can be changed to `veryfast` (CRF 23 + veryfast = ~4x realtime) with minimal quality loss at web viewing sizes.

### Contradiction 2: File Size vs Visual Quality

- **Improving parameter:** Small file size (faster S3 upload, cheaper storage, faster platform upload)
- **Worsening parameter:** Visual quality (aggressive compression = artifacts)
- **Resolution (Principle 3 -- Local Quality):** Apply different quality to different parts of the frame. Subtitles and CTA overlays are sharp text on a background -- they compress excellently with H.264. The video content compresses adaptively via CRF. The `+faststart` flag enables progressive playback without compromising quality. CRF 23 at 1080p typically yields 1-2 Mbps for talking-head content, producing 8-15 MB for a 60s clip.

### Contradiction 3: Single-Pass Simplicity vs Multi-Feature Complexity

- **Improving parameter:** Implementation simplicity (one FFmpeg invocation)
- **Worsening parameter:** Feature richness (subtitles + CTA + watermark + scale = complex filter graph)
- **Resolution (Principle 5 -- Merging):** FFmpeg's filter graph mechanism is designed exactly for this. Chain all visual operations into one `-vf` / `-filter_complex` pipeline: `scale -> pad -> ass (subtitles) -> drawtext (watermark) -> drawtext (CTA overlay)`. This runs in a single pass, reading the input once. For CTA `end` mode, use `concat` filter to append a generated color frame. One process, one temp output, no intermediate files.

### Contradiction 4: Source File Size vs Worker Disk Space

- **Improving parameter:** Support large source files (up to 4 GB webinars)
- **Worsening parameter:** Worker disk usage (downloading 4 GB to /tmp)
- **Resolution (Principle 1 -- Segmentation):** Use FFmpeg's `-ss` (seek) before `-i` (input) to only decode the relevant segment. Even though the full file is downloaded from S3, FFmpeg will seek to `startTime` before processing. Future optimization: use S3 byte-range requests to download only the relevant portion (requires knowing the byte offset, which needs an index -- out of scope for MVP). For MVP, download full file but rely on the fact that multiple clips from the same video share the source download (workers can cache).

### Contradiction 5: Temp File Safety vs Performance

- **Improving parameter:** Guaranteed cleanup (no orphaned files filling disk)
- **Worsening parameter:** Code complexity / performance (try/finally overhead)
- **Resolution (Principle 24 -- Intermediary):** Use a `TempFileManager` utility that tracks all created files and guarantees cleanup in a `finally` block. This centralizes cleanup logic, makes it impossible to forget a file, and adds negligible overhead. Pattern: create manager at job start, register every temp file, call `cleanupAll()` in finally.

## Key Design Decisions

### Decision 1: Subprocess FFmpeg via spawn (Not Node Bindings)

**Chosen:** `child_process.spawn('ffmpeg', args)`
**Rejected:** `fluent-ffmpeg`, `@ffmpeg/ffmpeg` (WASM)

**Rationale:**
- Subprocess isolates memory: a stuck/leaking FFmpeg process can be killed without affecting Node
- `spawn` with args array prevents shell injection (no string interpolation)
- Timeout via `setTimeout + proc.kill('SIGKILL')` -- clean, reliable
- stderr capture for error diagnostics
- The existing `renderClip()` already uses this pattern; consistency is important
- WASM FFmpeg is too slow for production and lacks full filter support
- `fluent-ffmpeg` is a wrapper that adds complexity without adding value for our specific filter graph needs

### Decision 2: ASS Subtitle Format (Not SRT, Not drawtext)

**Chosen:** Generate `.ass` file, render with FFmpeg `ass` filter
**Rejected:** SRT with `subtitles` filter, `drawtext` filter per segment

**Rationale:**
- ASS supports precise styling: font family, size, color, background, shadow, positioning
- ASS renders properly with Cyrillic characters and word-wrap
- Single filter in the chain (`ass=filename.ass`) -- cleaner than multiple `drawtext` filters
- SRT works but has limited styling control
- `drawtext` per segment would require generating a complex filter graph with enable expressions for each segment's time window -- fragile and verbose
- ASS is the industry standard for styled subtitles in FFmpeg pipelines

### Decision 3: Single-Pass Filter Graph (Not Multi-Pass)

**Chosen:** One FFmpeg invocation with a combined `-filter_complex`
**Rejected:** Multiple sequential FFmpeg calls (trim -> add subtitles -> add CTA -> add watermark)

**Rationale:**
- Single pass reads and decodes the source once (I/O bound operation)
- No intermediate files (saves disk, avoids generation loss from re-encoding)
- FFmpeg's filter graph is designed for compositing multiple operations
- Multi-pass would create 3-4 intermediate MP4 files (each re-encoded), tripling disk usage and encoding time
- Single pass means single timeout, single error handling path

### Decision 4: Temp Files with Deterministic Names (Not Random UUIDs)

**Chosen:** `clip-{clipId}.mp4`, `clip-{clipId}.ass`, `thumb-{clipId}.jpg`
**Rejected:** Random UUID temp names

**Rationale:**
- ClipId is already a UUID -- provides uniqueness guarantee
- Deterministic names make debugging easier (can find the file for a specific clip)
- If a previous failed render left an orphan, the next attempt overwrites it (`-y` flag)
- `os.tmpdir()` provides the platform-appropriate temp directory

### Decision 5: Thumbnail at 25% Duration (Not First Frame)

**Chosen:** Extract thumbnail at 25% of clip duration
**Rejected:** First frame, middle frame, "most interesting" frame

**Rationale:**
- First frame is often a transition or blank moment
- 25% is usually past the hook/intro and into the main content
- Middle frame (50%) can be mid-sentence with an awkward expression
- "Most interesting" frame would require scene detection (separate FFmpeg pass) -- overkill for MVP
- Single `ffmpeg -ss {time} -i {input} -vframes 1` command -- fast, simple

### Decision 6: Video Status Completion Check in Worker

**Chosen:** After each clip renders successfully, check if all clips for that video are now `ready` or `failed`; if so, update `Video.status = 'completed'`
**Rejected:** Separate completion checker job, webhook from BullMQ

**Rationale:**
- Atomic: the last clip to finish triggers the status update
- Uses `prisma.clip.count()` with status filter -- single query, no race condition with `UPDATE WHERE`
- No extra infrastructure (no additional queue, no cron job)
- BullMQ does not have a native "all jobs in group complete" callback

## Solution Architecture

### Pipeline Flow

```
VideoRenderJobData arrives from BullMQ
    |
    v
[1] Validate job data (Zod schema)
    |
    v
[2] Set Clip.status = 'rendering'
    |
    v
[3] Download source video from S3 to temp file
    |   downloadFromS3(sourceFilePath, /tmp/source-{clipId}.mp4)
    |
    v
[4] Generate ASS subtitle file (if subtitleSegments.length > 0)
    |   writeAssFile(subtitleSegments, format) -> /tmp/clip-{clipId}.ass
    |
    v
[5] Build FFmpeg filter graph
    |   scale + pad
    |   + ass (subtitles)          [if subtitle file exists]
    |   + drawtext (watermark)     [if watermark: true]
    |   + drawtext (CTA overlay)   [if cta.position === 'overlay']
    |
    v
[6] Render clip via FFmpeg spawn
    |   Input: source video (seeked to startTime)
    |   Output: /tmp/clip-{clipId}.mp4
    |   Timeout: 5 minutes
    |
    v
[7] If CTA position === 'end':
    |   Generate CTA frame + concat with rendered clip
    |   (second FFmpeg call: generate color frame with text,
    |    then concat demuxer to append)
    |
    v
[8] Extract thumbnail
    |   ffmpeg -ss {25% duration} -i clip.mp4 -vframes 1 thumb.jpg
    |
    v
[9] Upload clip MP4 to S3
    |   putObject(clipPath(userId, videoId, clipId), buffer, 'video/mp4')
    |
    v
[10] Upload thumbnail to S3
    |   putObject(thumbnailPath(userId, videoId, clipId), buffer, 'image/jpeg')
    |
    v
[11] Update Clip record
    |   filePath = S3 key, thumbnailPath = S3 key, status = 'ready'
    |
    v
[12] Check video completion
    |   If all clips for this video are ready/failed -> Video.status = 'completed'
    |
    v
[13] Cleanup temp files (always, via finally block)
```

### FFmpeg Filter Graph Construction

For a portrait clip with subtitles, watermark, and overlay CTA:

```
-filter_complex "
  [0:v] scale=1080:1920:force_original_aspect_ratio=decrease,
        pad=1080:1920:(ow-iw)/2:(oh-ih)/2 [scaled];
  [scaled] ass='/tmp/clip-{clipId}.ass' [subbed];
  [subbed] drawtext=text='КлипМейкер.ру':fontsize=28:fontcolor=white@0.5:
           x=w-tw-20:y=20:fontfile=/usr/share/fonts/NotoSans.ttf [watermarked];
  [watermarked] drawtext=text='{cta_text}':fontsize=40:fontcolor=white:
           x=(w-tw)/2:y=h-120:
           enable='between(t,{clip_dur-cta_dur},{clip_dur})':
           box=1:boxcolor=black@0.6:boxborderw=10:
           fontfile=/usr/share/fonts/NotoSans.ttf [out]
"
-map "[out]" -map 0:a
```

Filters are conditionally added based on job data. If no subtitles, the `ass` filter is omitted. If no watermark, `drawtext` for watermark is omitted. The filter graph is built programmatically as an array of filter stages.

### ASS Subtitle File Generation

```
[Script Info]
Title: Clip Subtitles
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, BackColour, Bold, Italic,
        BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV
Style: Default,Noto Sans,48,&H00FFFFFF,&H80000000,0,0,3,0,0,2,20,20,60

[Events]
Format: Layer, Start, End, Style, Name, Text
Dialogue: 0,0:00:02.50,0:00:05.30,Default,,Привет! Сегодня поговорим о...
Dialogue: 0,0:00:05.30,0:00:08.10,Default,,важных вещах для вашего курса
```

- `PlayResX`/`PlayResY` match the output resolution (format-dependent)
- Font size adapts: 48px for portrait (1920px height), 36px for square/landscape
- `Alignment: 2` = bottom-center
- `MarginV: 60` = offset from bottom edge to avoid being clipped
- `BackColour: &H80000000` = semi-transparent black background
- Timestamps converted from seconds to ASS format (`H:MM:SS.cc`)

### CTA End-Frame Strategy

For `cta.position === 'end'`, append a static branded frame:

1. Generate a color frame video (black background) with CTA text centered:
   ```
   ffmpeg -f lavfi -i color=c=black:s=1080x1920:d={cta.duration}:r=30
          -vf "drawtext=text='{cta.text}':fontsize=56:fontcolor=white:
               x=(w-tw)/2:y=(h-th)/2:fontfile=NotoSans.ttf"
          -c:v libx264 -pix_fmt yuv420p
          /tmp/cta-{clipId}.mp4
   ```

2. Concatenate with the rendered clip using concat demuxer:
   ```
   # concat.txt
   file '/tmp/clip-{clipId}.mp4'
   file '/tmp/cta-{clipId}.mp4'

   ffmpeg -f concat -safe 0 -i concat.txt -c copy /tmp/final-{clipId}.mp4
   ```

This avoids re-encoding the main clip (uses stream copy for concatenation).

### Temp File Management

```typescript
class TempFileManager {
  private files: string[] = [];

  register(path: string): string {
    this.files.push(path);
    return path;
  }

  async cleanupAll(): Promise<void> {
    for (const file of this.files) {
      try { await fs.unlink(file); } catch { /* already deleted or never created */ }
    }
    this.files = [];
  }
}
```

Used in the worker:
```typescript
const tmp = new TempFileManager();
try {
  const sourcePath = tmp.register(path.join(os.tmpdir(), `source-${clipId}.mp4`));
  const assPath = tmp.register(path.join(os.tmpdir(), `clip-${clipId}.ass`));
  const outputPath = tmp.register(path.join(os.tmpdir(), `clip-${clipId}.mp4`));
  const thumbPath = tmp.register(path.join(os.tmpdir(), `thumb-${clipId}.jpg`));
  // ... render pipeline ...
} finally {
  await tmp.cleanupAll();
}
```

## Modification Plan for Existing Code

### `apps/worker/lib/ffmpeg.ts`

1. **Update `RenderOptions` type:** Add `subtitleFile`, `ctaText`, `ctaPosition`, `ctaDuration`, `watermarkText` fields
2. **Update `renderClip()`:** Build filter graph dynamically based on which options are provided
3. **Add `generateAssFile()` function:** Converts subtitle segments to ASS format string, writes to file
4. **Add `extractThumbnail()` function:** Single-frame extraction at a given timestamp
5. **Add `generateCtaFrame()` function:** Creates a short video with text on a solid color background
6. **Add `concatVideos()` function:** Uses concat demuxer to join clip + CTA frame

### `apps/worker/workers/video-render.ts`

1. **Add S3 download:** Download source video from S3 before rendering
2. **Add ASS generation:** Generate subtitle file from `subtitleSegments`
3. **Add thumbnail extraction:** After render, extract a frame and upload
4. **Add S3 upload:** Upload rendered MP4 and thumbnail to S3
5. **Add video completion check:** After each clip, check if all video clips are done
6. **Add temp file cleanup:** Wrap everything in try/finally with TempFileManager
7. **Fetch userId:** Query Clip with Video relation to get userId for S3 paths

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| ASS filter fails on special characters in subtitles | Render fails | Medium | Escape ASS special chars (`\N`, `{`, `}`) in subtitle text; integration test with edge cases |
| Concurrent renders exhaust disk space | All renders fail | Low | Concurrency limited to 3; each render uses ~100 MB; monitor `/tmp` usage |
| Source video download from S3 is slow | Timeout exceeded | Medium | `-ss` before `-i` enables fast seek; 5-min timeout is generous for 3-min clips |
| Font not installed in Docker image | Subtitles render with fallback font | Medium | Add Noto Sans to Dockerfile; fallback to DejaVu Sans (bundled in most Linux images) |
| CTA concat introduces audio gap | Audible pop/silence at join point | Low | Generate CTA frame with silent audio track (`-f lavfi -i anullsrc`); test playback |
| Multiple workers render same clip (duplicate job) | Wasted compute, potential S3 conflict | Low | BullMQ deduplication by jobId; `WHERE status = 'pending'` guard before rendering |

## Performance Estimates

| Clip Duration | Estimated Render Time | Output Size | Temp Disk Usage |
|--------------|----------------------|-------------|-----------------|
| 15s (portrait) | ~15-25s | 2-4 MB | ~50 MB |
| 30s (portrait) | ~25-40s | 4-8 MB | ~80 MB |
| 60s (portrait) | ~45-75s | 8-15 MB | ~120 MB |
| 120s (portrait) | ~80-120s | 15-30 MB | ~200 MB |
| 180s (landscape) | ~100-150s | 20-40 MB | ~250 MB |

Estimates assume a 4-core VPS CPU with libx264 preset `fast`, CRF 23. Source file download time from S3 adds 5-30s depending on file size and network.

## Testing Strategy

1. **Unit tests:** ASS file generation (timestamp formatting, Cyrillic text escaping, style parameters)
2. **Unit tests:** Filter graph construction (verify correct filter chain for each combination of features)
3. **Integration tests:** Full render pipeline with a sample 10s test video (stored in test fixtures)
4. **Integration tests:** S3 upload/download roundtrip (using testcontainers with MinIO)
5. **Edge cases:** Empty subtitle segments, very long CTA text, clip at video boundaries (start=0, end=duration)
6. **Performance test:** Render 10 clips in parallel, verify completion within 5 minutes
