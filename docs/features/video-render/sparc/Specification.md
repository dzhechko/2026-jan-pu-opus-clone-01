# Specification: Video Render

## Overview

The video-render worker takes clip metadata (timestamps, subtitles, CTA, watermark flag) from BullMQ and produces a finished MP4 file with burned-in Russian subtitles, optional CTA overlay, optional watermark, uploads the result to S3, generates a thumbnail, and updates the Clip record in the database.

## Dependencies

| Dependency | Source | Notes |
|-----------|--------|-------|
| `packages/types` — `VideoRenderJobData`, `SubtitleSegment`, `CTA`, `ClipFormat` | Existing | Job data contract, type definitions |
| `packages/queue` — `QUEUE_NAMES.VIDEO_RENDER`, `DEFAULT_JOB_OPTIONS` | Existing | BullMQ queue constants |
| `packages/db` — Prisma `Clip` model | Existing | Status transitions, filePath/thumbnailPath updates |
| `packages/s3` — `clipPath()`, `thumbnailPath()`, `putObject()` | Existing | S3 upload, path generation |
| `apps/worker/lib/ffmpeg.ts` — `renderClip()`, `execFFmpeg()` | Existing (extend) | Core FFmpeg subprocess; must add subtitle, CTA, watermark filters |
| FFmpeg 7 binary | System | Must be available on `$PATH` in worker container |

---

## User Stories

### US-VR-01: Render clip from source video

**As a** video-render worker,
**I want to** trim a source video to the specified time range and encode it in the requested format,
**So that** users receive a correctly sized, high-quality MP4 clip.

**Acceptance Criteria:**

- [ ] Input: `sourceFilePath` (local path, pre-downloaded from S3), `startTime`, `endTime`, `format`
- [ ] Output: H.264 (libx264), preset `fast`, CRF 23, AAC 128 kbps audio
- [ ] `+faststart` movflag for web-optimized streaming
- [ ] Portrait format renders as 1080x1920, square as 1080x1080, landscape as 1920x1080
- [ ] Source aspect ratio is preserved; letterboxing/pillarboxing applied via `pad` filter when source does not match target ratio
- [ ] Clip duration matches `endTime - startTime` within 0.5 second tolerance
- [ ] FFmpeg process is killed after 5-minute timeout
- [ ] Output file is written to `os.tmpdir()` with pattern `clip-{clipId}.mp4`
- [ ] If FFmpeg exits with non-zero code, the error is propagated for BullMQ retry

```gherkin
Feature: Render clip from source video

  Scenario: Portrait format render
    Given a source video at "/tmp/source-abc.mp4" with duration 3600 seconds
    And a VideoRenderJobData with startTime=120.5, endTime=180.5, format="portrait"
    When the video-render worker processes the job
    Then FFmpeg produces an MP4 at "/tmp/clip-{clipId}.mp4"
    And the output resolution is 1080x1920
    And the output codec is H.264 with AAC 128k audio
    And the movflags include "+faststart"
    And the output duration is 60.0 seconds (+/- 0.5s)

  Scenario: Square format render
    Given a source video with 16:9 aspect ratio
    And a VideoRenderJobData with format="square"
    When the video-render worker processes the job
    Then the output resolution is 1080x1080
    And the source video is center-cropped or padded to fill the square frame

  Scenario: Landscape format render
    Given a source video with 9:16 aspect ratio (vertical recording)
    And a VideoRenderJobData with format="landscape"
    When the video-render worker processes the job
    Then the output resolution is 1920x1080
    And the vertical source is center-padded with black bars on left and right

  Scenario: FFmpeg timeout exceeded
    Given a source video that would take longer than 5 minutes to process
    When the FFmpeg process exceeds the 5-minute timeout
    Then the FFmpeg process receives SIGKILL
    And the job throws an error "FFmpeg timeout exceeded"
    And BullMQ retries the job with exponential backoff (attempt 1 of 3)

  Scenario: FFmpeg exits with non-zero code
    Given a corrupt source file that causes FFmpeg to fail
    When FFmpeg exits with code 1
    Then the job throws an error containing the last 200 chars of stderr
    And the Clip status is set to "failed" on final retry exhaustion

  Scenario: Trim precision at boundary
    Given a source video of exactly 300 seconds
    And a VideoRenderJobData with startTime=298.0, endTime=300.0
    When the video-render worker processes the job
    Then the output duration is 2.0 seconds (+/- 0.5s)
    And no "past duration" warning is emitted by FFmpeg
```

---

### US-VR-02: Burn-in Russian subtitles

**As a** video-render worker,
**I want to** overlay styled Russian subtitle text onto the rendered clip,
**So that** viewers can read the dialogue without sound.

**Acceptance Criteria:**

- [ ] Input: `subtitleSegments` array of `{ start, end, text }` (times relative to clip start, i.e., `0` = first frame of clip)
- [ ] Subtitles rendered using FFmpeg `drawtext` filter (no external ASS/SRT file generation needed for MVP; ASS path is acceptable alternative)
- [ ] Default style: bold white text (#FFFFFF), black shadow (shadowcolor=black, shadowx=2, shadowy=2), font size auto-scaled to ~5% of frame height
- [ ] Text positioned in the bottom third of the frame (y = h*0.75 - text_h/2)
- [ ] Long text (>40 chars) is word-wrapped to fit within 90% of frame width
- [ ] Cyrillic characters render correctly (font: DejaVu Sans or Noto Sans with Cyrillic support, bundled in Docker image)
- [ ] Subtitle timing is accurate: text appears at `segment.start` and disappears at `segment.end` relative to clip start
- [ ] Empty `subtitleSegments` array (length 0) results in no subtitle overlay (render proceeds without drawtext)
- [ ] Segments with empty `text` field are skipped silently

```gherkin
Feature: Burn-in Russian subtitles

  Scenario: Subtitles rendered with correct styling
    Given a VideoRenderJobData with subtitleSegments:
      | start | end  | text                          |
      | 0.0   | 3.5  | "Привет, добро пожаловать!"   |
      | 4.0   | 8.2  | "Сегодня мы разберём тему..." |
    When the video-render worker processes the job
    Then the output video contains white bold text with black shadow
    And at frame t=2.0s the text "Привет, добро пожаловать!" is visible in the bottom third
    And at frame t=3.6s no subtitle text is visible (gap between segments)
    And at frame t=5.0s the text "Сегодня мы разберём тему..." is visible

  Scenario: Long subtitle text wraps within frame
    Given a subtitleSegment with text "Это очень длинный текст субтитров который должен переноситься на следующую строку чтобы не выходить за пределы кадра"
    When the video-render worker processes the job
    Then the text is wrapped to fit within 90% of frame width
    And no text is clipped or extends beyond the visible frame

  Scenario: Cyrillic characters render correctly
    Given a subtitleSegment with text "Щёлкните кнопку — сделайте это сейчас!"
    When the video-render worker processes the job
    Then all Cyrillic characters including "Щ", "ё", and em-dash render without replacement glyphs (tofu)

  Scenario: Empty subtitleSegments array
    Given a VideoRenderJobData with subtitleSegments = []
    When the video-render worker processes the job
    Then the output video has no text overlay
    And the render completes successfully

  Scenario: Segment with empty text is skipped
    Given subtitleSegments:
      | start | end | text                     |
      | 0.0   | 2.0 | ""                       |
      | 3.0   | 5.0 | "Реальный текст"         |
    When the video-render worker processes the job
    Then only "Реальный текст" appears in the output
    And no error is thrown for the empty segment

  Scenario: Subtitle timing precision
    Given a subtitleSegment with start=10.0, end=10.5 (0.5 second flash)
    When the video-render worker processes the job
    Then the text is visible for approximately 0.5 seconds
    And at frame t=9.9s no text is visible
    And at frame t=10.6s no text is visible
```

---

### US-VR-03: CTA overlay

**As a** video-render worker,
**I want to** add a call-to-action text overlay at the specified position and timing,
**So that** viewers are prompted to take action (e.g., enroll in a course).

**Acceptance Criteria:**

- [ ] Input: optional `cta` field `{ text, position, duration }` where `position` is `"end"` or `"overlay"`
- [ ] `position: "end"` — CTA appears as a full-screen card after the main clip content; total output duration = clip duration + CTA duration
- [ ] `position: "overlay"` — CTA appears as a semi-transparent banner overlaid on the last `duration` seconds of the clip; total output duration = clip duration (unchanged)
- [ ] CTA text rendered with semi-transparent dark background (rgba 0,0,0,0.6), white text, centered horizontally
- [ ] For `"end"` position: black background frame with centered CTA text, duration = `cta.duration` seconds
- [ ] For `"overlay"` position: banner at bottom 15% of frame, text centered within banner
- [ ] CTA text max 50 characters; longer text is truncated with "..." (enforced upstream, but defensive handling here)
- [ ] If `cta` is `undefined` or `null`, no CTA overlay is added
- [ ] CTA duration is 3, 4, or 5 seconds (validated by Zod upstream)

```gherkin
Feature: CTA overlay

  Scenario: CTA at end of clip
    Given a VideoRenderJobData with:
      | startTime | endTime | cta.text              | cta.position | cta.duration |
      | 0.0       | 30.0    | "Записаться на курс"  | end          | 5            |
    When the video-render worker processes the job
    Then the output video duration is 35.0 seconds (+/- 0.5s)
    And at t=30.5s a black frame with white text "Записаться на курс" is visible
    And the CTA text is horizontally centered

  Scenario: CTA as overlay on clip
    Given a VideoRenderJobData with:
      | startTime | endTime | cta.text            | cta.position | cta.duration |
      | 0.0       | 30.0    | "Подробнее по ссылке" | overlay      | 4            |
    When the video-render worker processes the job
    Then the output video duration is 30.0 seconds (+/- 0.5s)
    And from t=26.0s to t=30.0s a semi-transparent banner is visible at the bottom of the frame
    And the banner contains text "Подробнее по ссылке"
    And at t=25.0s no CTA banner is visible

  Scenario: No CTA field
    Given a VideoRenderJobData where cta is undefined
    When the video-render worker processes the job
    Then no CTA overlay is added
    And the output duration equals endTime - startTime (+/- 0.5s)

  Scenario: CTA with Cyrillic text on end card
    Given a CTA with text "Бесплатный вебинар: регистрация" and position "end"
    When the video-render worker processes the job
    Then the end card renders all Cyrillic characters correctly
    And the text has a semi-transparent dark background behind it

  Scenario: CTA overlay does not obscure subtitles
    Given a VideoRenderJobData with both subtitleSegments (last segment ends at t=29.0) and cta (overlay, duration=4, starts at t=26.0)
    When the video-render worker processes the job
    Then from t=26.0 to t=29.0 both subtitle text and CTA banner are visible
    And the CTA banner is positioned below the subtitle text (or above, avoiding overlap)
```

---

### US-VR-04: Watermark for free plan

**As a** video-render worker,
**I want to** add a semi-transparent watermark to clips rendered for free-plan users,
**So that** the product gets attribution and paid plans have a clear upgrade incentive.

**Acceptance Criteria:**

- [ ] Input: `watermark: boolean` in `VideoRenderJobData`
- [ ] When `watermark=true`, overlay text "КлипМейкер.ру" on the video
- [ ] Watermark positioned in the bottom-right corner with padding (10px from edges)
- [ ] Semi-transparent white text (opacity ~30-40%) so content beneath remains visible
- [ ] Font size: ~2.5% of frame height (small but legible)
- [ ] Watermark visible throughout the entire clip duration (including CTA end card if present)
- [ ] When `watermark=false`, no watermark is added
- [ ] Watermark does not interfere with subtitle readability (subtitles are bottom-center, watermark is bottom-right)

```gherkin
Feature: Watermark for free plan

  Scenario: Watermark applied for free plan user
    Given a VideoRenderJobData with watermark=true
    When the video-render worker processes the job
    Then the output video contains semi-transparent text "КлипМейкер.ру" in the bottom-right corner
    And the watermark is visible at t=0s, t=midpoint, and t=last frame
    And the watermark opacity is approximately 30-40%

  Scenario: No watermark for paid plan user
    Given a VideoRenderJobData with watermark=false
    When the video-render worker processes the job
    Then the output video contains no watermark text
    And no "КлипМейкер.ру" overlay filter is applied

  Scenario: Watermark does not obscure subtitles
    Given a VideoRenderJobData with watermark=true and subtitleSegments present
    When the video-render worker processes the job
    Then the watermark is positioned in the bottom-right corner
    And the subtitle text is positioned in the bottom-center
    And the two elements do not overlap

  Scenario: Watermark on CTA end card
    Given a VideoRenderJobData with watermark=true and cta with position="end"
    When the video-render worker processes the job
    Then the watermark is visible on both the main clip portion and the CTA end card

  Scenario: Watermark Cyrillic rendering
    Given a VideoRenderJobData with watermark=true
    When the video-render worker processes the job
    Then the text "КлипМейкер.ру" renders correctly without glyph substitution
    And the ".ру" TLD is clearly readable
```

---

### US-VR-05: Upload to S3 and update database

**As a** video-render worker,
**I want to** upload the rendered MP4 and generated thumbnail to S3 and atomically update the Clip record,
**So that** the clip is available for download and publishing immediately after render completion.

**Acceptance Criteria:**

- [ ] After successful FFmpeg render, upload the MP4 to S3 at path `clipPath(userId, videoId, clipId)`
- [ ] Generate a thumbnail (JPEG, quality 80) from the frame at 25% of clip duration via `ffmpeg -ss {time} -i {file} -vframes 1 -q:v 2`
- [ ] Upload thumbnail to S3 at path `thumbnailPath(userId, videoId, clipId)`
- [ ] Update Clip record atomically: `filePath = clipS3Key`, `thumbnailPath = thumbnailS3Key`, `status = "ready"`
- [ ] If S3 upload fails, Clip status remains "rendering" and the job is retried by BullMQ
- [ ] If DB update fails after S3 upload, the S3 objects are orphaned (acceptable; lifecycle policy cleans up in v1.1)
- [ ] Temporary local files (`/tmp/clip-*.mp4`, `/tmp/thumb-*.jpg`) are deleted in a `finally` block regardless of success/failure
- [ ] Temp file cleanup failure is logged at WARN level but does not cause job failure
- [ ] `userId` is fetched from the Clip record (joined via `clip.userId`) for path generation
- [ ] S3 upload uses `putObject()` from `@clipmaker/s3` with retry (built into `operations.ts`)
- [ ] After all clips for a video are rendered (`status = "ready"` for all), the Video status is set to `"completed"`

```gherkin
Feature: Upload to S3 and update database

  Scenario: Successful render, upload, and DB update
    Given a VideoRenderJobData for clipId="clip-001", videoId="vid-001"
    And the Clip record has userId="user-001"
    When the video-render worker completes FFmpeg rendering
    Then the MP4 is uploaded to S3 at "clips/user-001/vid-001/clip-001.mp4"
    And a thumbnail is generated from the frame at 25% of clip duration
    And the thumbnail is uploaded to S3 at "thumbnails/user-001/vid-001/clip-001.jpg"
    And the Clip record is updated with filePath="clips/user-001/vid-001/clip-001.mp4"
    And the Clip record is updated with thumbnailPath="thumbnails/user-001/vid-001/clip-001.jpg"
    And the Clip record status transitions from "rendering" to "ready"

  Scenario: Temp files cleaned up after success
    Given a successful render and S3 upload
    When the job completes
    Then "/tmp/clip-{clipId}.mp4" no longer exists on the filesystem
    And "/tmp/thumb-{clipId}.jpg" no longer exists on the filesystem

  Scenario: Temp files cleaned up after failure
    Given FFmpeg rendering fails mid-process
    When the job error handler runs
    Then any partial "/tmp/clip-{clipId}.mp4" file is deleted
    And any partial "/tmp/thumb-{clipId}.jpg" file is deleted
    And cleanup errors are logged at WARN level but do not mask the original error

  Scenario: S3 upload fails with transient error
    Given FFmpeg rendering completes successfully
    And the S3 putObject call fails with a ServiceUnavailable error
    When the S3 retry logic (2 retries with exponential backoff) is exhausted
    Then the job throws an error
    And the Clip status remains "rendering"
    And BullMQ retries the entire job (attempt 2 of 3)

  Scenario: Thumbnail generation
    Given a rendered clip at "/tmp/clip-001.mp4" with duration 40 seconds
    When the thumbnail generation step runs
    Then FFmpeg extracts a single frame at t=10.0s (25% of 40s)
    And the frame is saved as JPEG at "/tmp/thumb-clip-001.jpg"
    And the JPEG quality parameter is set to 2 (high quality, ~80% equivalent)

  Scenario: All clips rendered triggers video completion
    Given videoId="vid-001" has 5 clips total
    And 4 clips already have status "ready"
    When the 5th clip finishes rendering and is updated to "ready"
    Then the Video record for "vid-001" is updated to status "completed"

  Scenario: Partial clip failure does not block other clips
    Given videoId="vid-001" has 5 clips
    And clip-003 fails rendering (status="failed")
    When clip-005 finishes rendering successfully
    Then clip-005 status is "ready"
    And the Video status is NOT set to "completed" (because clip-003 is "failed")
    And the video remains in "generating_clips" status

  Scenario: Atomic DB update integrity
    Given a successful S3 upload of both clip MP4 and thumbnail
    When the Prisma update runs
    Then filePath, thumbnailPath, and status are updated in a single database call
    And if the DB call fails, the error is propagated and the job is retried
```

---

## Data Contracts

### VideoRenderJobData (input — existing in `packages/types/src/queue.ts`)

```typescript
type VideoRenderJobData = {
  clipId: string;
  videoId: string;
  sourceFilePath: string;       // local path (pre-downloaded from S3 by pipeline orchestrator)
  startTime: number;            // seconds (float)
  endTime: number;              // seconds (float)
  format: 'portrait' | 'square' | 'landscape';
  subtitleSegments: Array<{ start: number; end: number; text: string }>;
  cta?: { text: string; position: 'end' | 'overlay'; duration: number };
  watermark: boolean;
};
```

### RenderOptions (internal — extended in `apps/worker/lib/ffmpeg.ts`)

```typescript
type RenderOptions = {
  inputPath: string;
  outputPath: string;
  startTime: number;
  endTime: number;
  format: '9:16' | '1:1' | '16:9';
  subtitleSegments?: Array<{ start: number; end: number; text: string }>;
  cta?: { text: string; position: 'end' | 'overlay'; duration: number };
  watermark?: boolean;
  watermarkText?: string;
};
```

### Clip DB Record (relevant fields)

```
Clip {
  id:            UUID
  videoId:       UUID
  userId:        UUID
  filePath:      string | null    // S3 key after render
  thumbnailPath: string | null    // S3 key after render
  status:        pending | rendering | ready | published | failed
}
```

### S3 Path Patterns

| Asset | Path Template | Example |
|-------|--------------|---------|
| Rendered clip | `clips/{userId}/{videoId}/{clipId}.mp4` | `clips/abc-123/vid-456/clip-789.mp4` |
| Thumbnail | `thumbnails/{userId}/{videoId}/{clipId}.jpg` | `thumbnails/abc-123/vid-456/clip-789.jpg` |

---

## State Machine: Clip Status

```
pending ──[job dequeued]──> rendering ──[success]──> ready ──[published]──> published
                                │
                                └──[FFmpeg error / S3 error]──> failed
                                        │
                                        └──[BullMQ retry, attempts < 3]──> rendering
```

- `pending` -> `rendering`: Set when the worker picks up the job (before FFmpeg starts)
- `rendering` -> `ready`: Set after S3 upload and DB update succeed
- `rendering` -> `failed`: Set on final retry exhaustion (attempt 3 of 3 fails)
- On retries (attempts 1-2), status stays `rendering` while BullMQ re-executes the job

---

## FFmpeg Filter Graph Design

The following filter chains are constructed dynamically based on job data:

### Base (US-VR-01 only, no overlays)

```
-vf "scale=W:H:force_original_aspect_ratio=decrease,pad=W:H:(ow-iw)/2:(oh-ih)/2"
```

### With subtitles (US-VR-02)

Each `subtitleSegment` adds a `drawtext` filter chained with `enable='between(t,start,end)'`:

```
-vf "scale=...,pad=...,
     drawtext=text='Привет':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:
       fontsize=h*0.05:fontcolor=white:shadowcolor=black:shadowx=2:shadowy=2:
       x=(w-text_w)/2:y=h*0.75-text_h/2:enable='between(t,0.0,3.5)',
     drawtext=text='Второй':fontfile=...:...:enable='between(t,4.0,8.2)'"
```

### With CTA overlay (US-VR-03, position=overlay)

Adds a `drawbox` + `drawtext` filter for the CTA banner:

```
drawbox=x=0:y=h*0.85:w=iw:h=h*0.15:color=black@0.6:t=fill:enable='between(t,T1,T2)',
drawtext=text='CTA text':...:x=(w-text_w)/2:y=h*0.90-text_h/2:enable='between(t,T1,T2)'
```

### With CTA end card (US-VR-03, position=end)

Two-pass approach:
1. Render main clip to temp file
2. Generate CTA card frame (black background + centered text) as a short video
3. Concatenate using FFmpeg concat demuxer

### With watermark (US-VR-04)

Adds a persistent `drawtext` filter (no `enable` — always visible):

```
drawtext=text='КлипМейкер.ру':fontfile=...:fontsize=h*0.025:
  fontcolor=white@0.35:x=w-text_w-10:y=h-text_h-10
```

### Combined filter order

```
scale → pad → [subtitles drawtext...] → [CTA overlay drawbox+drawtext] → [watermark drawtext]
```

---

## Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|------------|--------|-------|
| NFR-VR-01 | Render time for a 60-second clip (portrait, with subtitles + watermark) | < 45 seconds | On 4-core VPS with `preset=fast`, CRF 23 |
| NFR-VR-02 | Render time for a 60-second clip (with CTA end card, concat) | < 60 seconds | Concat adds ~5-10s overhead |
| NFR-VR-03 | FFmpeg process timeout | 5 minutes | SIGKILL on timeout; prevents zombie processes |
| NFR-VR-04 | BullMQ concurrency | 3 workers | Matches current `concurrency: 3` setting |
| NFR-VR-05 | BullMQ retry policy | 3 attempts, exponential backoff (5s, 10s, 20s) | Matches `DEFAULT_JOB_OPTIONS` |
| NFR-VR-06 | Temp file disk usage per clip | < 500 MB | Worst case: 4GB source + rendered clip; cleaned in `finally` |
| NFR-VR-07 | S3 upload throughput | > 20 MB/s | LAN between VPS and Yandex Object Storage |
| NFR-VR-08 | Thumbnail generation time | < 3 seconds | Single frame extraction |
| NFR-VR-09 | Output file size (60s portrait) | < 30 MB | H.264, CRF 23, 1080p, fast preset |
| NFR-VR-10 | Memory usage per FFmpeg process | < 512 MB RSS | Monitored; alert if exceeded |
| NFR-VR-11 | Temp file cleanup guarantee | 100% in `finally` | Even on SIGKILL: orphan cleanup cron (v1.1) |
| NFR-VR-12 | Font availability | DejaVu Sans Bold with Cyrillic | Installed in Docker image via `fonts-dejavu-core` |
| NFR-VR-13 | No shell injection | All FFmpeg args passed as array to `spawn()`/`execFile()` | Never use `exec()` with string interpolation |
| NFR-VR-14 | Path traversal prevention | All S3 paths generated via `clipPath()`/`thumbnailPath()` with `assertSafeSegment()` | UUIDs only |
| NFR-VR-15 | Idempotent re-render | Re-processing same clipId overwrites S3 objects and updates DB | Safe for BullMQ retries |

---

## Error Handling Matrix

| Error | Detection | Recovery | User Impact |
|-------|-----------|----------|-------------|
| FFmpeg exit code != 0 | Process `close` event | BullMQ retry (3 attempts) | Clip stays "rendering" until retry exhaustion, then "failed" |
| FFmpeg timeout (>5 min) | `setTimeout` + SIGKILL | BullMQ retry | Same as above |
| Source file not found | FFmpeg stderr "No such file" | Job fails immediately (no retry — source is missing) | Clip marked "failed"; user sees error |
| S3 upload transient error | `isTransientError()` in `operations.ts` | S3-level retry (2x) + BullMQ-level retry (3x) | Transparent to user |
| S3 upload permanent error (auth) | Non-transient S3 error | Job fails; alert ops | Clip marked "failed"; requires manual intervention |
| DB update failure | Prisma exception | BullMQ retry; S3 objects orphaned | Clip stays "rendering"; retry will re-upload and update |
| Temp file cleanup failure | `fs.unlink` error in `finally` | Log WARN; do not re-throw | No user impact; disk space reclaimed by OS/cron |
| Out of disk space | FFmpeg write error or `ENOSPC` | BullMQ retry after backoff (hope disk freed) | Clip stays "rendering" |
| Corrupt subtitle text (special chars) | FFmpeg drawtext error | Escape special chars (`'`, `\`, `:`) before passing to filter | Transparent to user |

---

## Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Command injection via filenames | FFmpeg invoked via `spawn('ffmpeg', argsArray)` — no shell interpolation. All paths validated by `assertSafeSegment()` |
| Path traversal via clipId/videoId | `clipPath()` and `thumbnailPath()` enforce alphanumeric+dash+underscore only |
| Subtitle text injection into FFmpeg filter | Special characters (`'`, `\`, `:`, `[`, `]`) escaped before embedding in drawtext filter string |
| Temp file access by other processes | Files created in `os.tmpdir()` with unique clipId; no sensitive data in filenames |
| S3 object overwrite | Idempotent by design; same clipId always maps to same S3 key |
| DoS via large video rendering | FFmpeg timeout (5 min) + BullMQ concurrency limit (3) + rate limiting (10 uploads/hour upstream) |

---

## Feature Matrix

| Capability | MVP | v1.1 | v2 |
|-----------|-----|------|-----|
| Trim + scale + encode (H.264/AAC) | X | | |
| Subtitle overlay (drawtext) | X | | |
| CTA overlay (end card + banner) | X | | |
| Watermark for free plan | X | | |
| S3 upload (clip + thumbnail) | X | | |
| DB status update (atomic) | X | | |
| Temp file cleanup | X | | |
| ASS subtitle file (advanced styling) | | X | |
| Custom fonts per user | | X | |
| GPU-accelerated encoding (NVENC) | | X | |
| Animated CTA transitions | | | X |
| Custom watermark image/logo | | | X |
| Multi-audio track (background music) | | | X |
| Orphaned S3 object cleanup (lifecycle) | | X | |
| Progress reporting via BullMQ job.progress() | | X | |

---

## Open Questions

| # | Question | Impact | Proposed Resolution |
|---|----------|--------|-------------------|
| 1 | Should the source file be pre-downloaded to local disk before the render job, or should the worker download it? | Worker design | Current assumption: source file is already local (downloaded by pipeline orchestrator). If not, the worker must call `downloadFromS3()` first. Resolve during implementation. |
| 2 | Should CTA end card use concat demuxer or `tpad` filter? | Implementation complexity | `tpad` is simpler (single FFmpeg pass) but less flexible. Concat is more reliable for adding a distinct visual card. Recommend concat for MVP. |
| 3 | What happens when all clips for a video are a mix of "ready" and "failed"? | UX | Propose: Video status = "completed" only if all clips are "ready". If any clip is "failed", video stays "generating_clips" and user can retry failed clips individually. |
| 4 | Should subtitle text escaping be done in the worker or in a shared utility? | Code organization | Propose: shared utility `escapeDrawtext(text: string): string` in `apps/worker/lib/ffmpeg.ts` for reuse. |
