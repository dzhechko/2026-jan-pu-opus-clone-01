# Pseudocode: Video Render

## Data Structures

```typescript
// Job data received from BullMQ queue (defined in packages/types/src/queue.ts)
type VideoRenderJobData = {
  clipId: string;
  videoId: string;
  sourceFilePath: string;          // S3 key of the source video
  startTime: number;               // seconds, float
  endTime: number;                 // seconds, float
  format: 'portrait' | 'square' | 'landscape';
  subtitleSegments: SubtitleSegment[];
  cta?: CTA;
  watermark: boolean;
};

type SubtitleSegment = {
  start: number;   // seconds relative to clip start
  end: number;
  text: string;
};

type CTA = {
  text: string;
  position: 'end' | 'overlay';
  duration: number;   // seconds (3-5)
};

// Resolved context built after DB fetch and S3 download
type RenderContext = {
  clip: {
    id: string;
    videoId: string;
    userId: string;
    title: string;
    startTime: number;
    endTime: number;
    duration: number;
    format: ClipFormat;
  };
  video: {
    id: string;
    userId: string;
    filePath: string;         // S3 key of source
    durationSeconds: number;
  };
  user: {
    id: string;
    planId: PlanId;
  };
  paths: {
    tmpDir: string;           // mkdtemp result
    sourceLocal: string;      // tmpDir/source.mp4
    assFile: string;          // tmpDir/subtitles.ass
    renderedClip: string;     // tmpDir/clip-{clipId}.mp4
    thumbnail: string;        // tmpDir/thumb-{clipId}.jpg
  };
  s3Keys: {
    clip: string;             // clips/{userId}/{videoId}/{clipId}.mp4
    thumbnail: string;        // thumbnails/{userId}/{videoId}/{clipId}.jpg
  };
  subtitleSegments: SubtitleSegment[];
  cta: CTA | null;
  watermark: boolean;
};

// Format-to-resolution mapping
const FORMAT_DIMENSIONS: Record<ClipFormat, { width: number; height: number }> = {
  portrait:  { width: 1080, height: 1920 },
  square:    { width: 1080, height: 1080 },
  landscape: { width: 1920, height: 1080 },
};

// Note: The existing RenderOptions.format type ('9:16'|'1:1'|'16:9') will be updated
// to accept named formats ('portrait'|'square'|'landscape') matching VideoRenderJobData.
// The FORMAT_DIMENSIONS map above is used for resolution lookup.
```

## Zod Schema: Job Data Validation

```typescript
const SubtitleSegmentSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string().min(1).max(500),
}).refine(
  (s) => s.end > s.start,
  { message: 'Subtitle end must be after start' }
);

const CTASchema = z.object({
  text: z.string().min(1).max(50),
  position: z.enum(['end', 'overlay']),
  duration: z.number().int().min(3).max(5),
});

const VideoRenderJobSchema = z.object({
  clipId: z.string().uuid(),
  videoId: z.string().uuid(),
  sourceFilePath: z.string().min(1).max(1024),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  format: z.enum(['portrait', 'square', 'landscape']),
  subtitleSegments: z.array(SubtitleSegmentSchema).max(500),
  cta: CTASchema.optional(),
  watermark: z.boolean(),
}).refine(
  (d) => d.endTime > d.startTime,
  { message: 'endTime must be greater than startTime' }
).refine(
  (d) => d.endTime - d.startTime <= 180,
  { message: 'Clip duration must not exceed 180 seconds' }
);
```

## Algorithm: handleRenderJob(job)

```
WORKER: video-render
QUEUE: QUEUE_NAMES.VIDEO_RENDER
CONCURRENCY: 3
TIMEOUT: 5 minutes per job (FFMPEG_TIMEOUT = 5 * 60 * 1000)
RETRY: 3 attempts, exponential backoff (5s base)

HANDLER(job: Job<VideoRenderJobData>):
  jobData = job.data
  logger.info({ event: 'render_start', clipId: jobData.clipId, format: jobData.format,
                duration: jobData.endTime - jobData.startTime })

  // 1. VALIDATE JOB DATA
  parsed = VideoRenderJobSchema.safeParse(jobData)
  IF !parsed.success:
    logger.error({ event: 'render_validation_failed', clipId: jobData.clipId,
                   errors: parsed.error.issues })
    // Mark clip as failed — no retries for bad data
    await prisma.clip.update({
      where: { id: jobData.clipId },
      data: { status: 'failed' },
    })
    THROW new Error(`Invalid job data: ${parsed.error.message}`)

  data = parsed.data

  // 2. FETCH CLIP + VIDEO + USER FROM DB (single query with include)
  clip = await prisma.clip.findUnique({
    where: { id: data.clipId },
    include: {
      video: {
        include: { user: true },
      },
    },
  })

  IF !clip:
    THROW new Error(`Clip ${data.clipId} not found`)
  IF clip.status !== 'pending' AND clip.status !== 'failed':
    logger.warn({ event: 'render_skip', clipId: data.clipId, status: clip.status })
    RETURN  // Already rendering or ready — skip (idempotent)

  video = clip.video
  user = video.user

  // 3. TRANSITION STATUS: pending → rendering
  await prisma.clip.update({
    where: { id: data.clipId },
    data: { status: 'rendering' },
  })

  // 4. CREATE TEMP DIRECTORY
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clipmaker-render-'))

  TRY:
    // 5. BUILD RENDER CONTEXT
    clipDuration = data.endTime - data.startTime
    ctx: RenderContext = {
      clip: {
        id: clip.id,
        videoId: video.id,
        userId: user.id,
        title: clip.title,
        startTime: data.startTime,
        endTime: data.endTime,
        duration: clipDuration,
        format: data.format,
      },
      video: {
        id: video.id,
        userId: user.id,
        filePath: data.sourceFilePath,
        durationSeconds: video.durationSeconds ?? 0,
      },
      user: {
        id: user.id,
        planId: user.planId,
      },
      paths: {
        tmpDir,
        sourceLocal: path.join(tmpDir, 'source.mp4'),
        assFile: path.join(tmpDir, 'subtitles.ass'),
        renderedClip: path.join(tmpDir, `clip-${clip.id}.mp4`),
        thumbnail: path.join(tmpDir, `thumb-${clip.id}.jpg`),
      },
      s3Keys: {
        clip: clipPath(user.id, video.id, clip.id),
        thumbnail: thumbnailPath(user.id, video.id, clip.id),
      },
      subtitleSegments: data.subtitleSegments,
      cta: data.cta ?? null,
      watermark: data.watermark,
    }

    // 6. DOWNLOAD SOURCE VIDEO FROM S3
    await job.updateProgress(10)
    logger.info({ event: 's3_download_start', s3Key: ctx.video.filePath })
    await downloadFromS3(ctx.video.filePath, ctx.paths.sourceLocal)
    logger.info({ event: 's3_download_complete', localPath: ctx.paths.sourceLocal })

    // 7. GENERATE ASS SUBTITLE FILE (if segments exist)
    IF ctx.subtitleSegments.length > 0:
      assContent = generateSubtitleFile(ctx.subtitleSegments, ctx.clip.duration, ctx.clip.format)
      await fs.writeFile(ctx.paths.assFile, assContent, 'utf-8')
      logger.info({ event: 'ass_generated', segments: ctx.subtitleSegments.length })

    // 8. BUILD FFMPEG FILTER CHAIN
    filterChain = buildFilterChain(
      ctx.clip.format,
      ctx.subtitleSegments.length > 0 ? ctx.paths.assFile : null,
      ctx.cta,
      ctx.watermark,
      ctx.clip.duration,
    )

    // 9. EXECUTE FFMPEG — RENDER CLIP
    await job.updateProgress(30)
    ffmpegArgs = buildFFmpegArgs(ctx, filterChain)
    logger.info({ event: 'ffmpeg_start', clipId: ctx.clip.id, args: ffmpegArgs.slice(0, 8) })
    await execFFmpegSpawn(ffmpegArgs, FFMPEG_TIMEOUT)
    logger.info({ event: 'ffmpeg_complete', clipId: ctx.clip.id })

    // 9b. CTA END CARD (if cta.position === 'end', concat a black frame with CTA text)
    IF ctx.cta != null AND ctx.cta.position === 'end':
      ctaCardPath = path.join(tmpDir, `cta-${ctx.clip.id}.mp4`)
      finalPath = path.join(tmpDir, `final-${ctx.clip.id}.mp4`)
      await generateCtaEndCard(ctx.cta, FORMAT_DIMENSIONS[ctx.clip.format].width,
                               FORMAT_DIMENSIONS[ctx.clip.format].height, ctaCardPath)
      await concatClipAndCta(ctx.paths.renderedClip, ctaCardPath, finalPath)
      // Replace rendered clip path with the final concatenated version
      await fs.unlink(ctx.paths.renderedClip).catch(() => {})
      await fs.rename(finalPath, ctx.paths.renderedClip)
      await fs.unlink(ctaCardPath).catch(() => {})
      logger.info({ event: 'cta_end_card_appended', clipId: ctx.clip.id,
                    ctaDuration: ctx.cta.duration })

    // 10. GENERATE THUMBNAIL (non-fatal: if it fails, proceed without thumbnail)
    await job.updateProgress(70)
    thumbnailTimeOffset = ctx.clip.duration * 0.25
    thumbnailGenerated = false
    TRY:
      await generateThumbnail(ctx.paths.renderedClip, ctx.paths.thumbnail, thumbnailTimeOffset)
      thumbnailGenerated = true
      logger.info({ event: 'thumbnail_generated', clipId: ctx.clip.id })
    CATCH thumbnailError:
      logger.warn({ event: 'thumbnail_failed', clipId: ctx.clip.id,
                    error: thumbnailError.message })

    // 11. UPLOAD RENDERED MP4 + THUMBNAIL TO S3
    await job.updateProgress(80)
    clipBuffer = await fs.readFile(ctx.paths.renderedClip)
    await putObject(ctx.s3Keys.clip, clipBuffer, 'video/mp4')
    logger.info({ event: 's3_upload_clip', key: ctx.s3Keys.clip })

    IF thumbnailGenerated:
      thumbBuffer = await fs.readFile(ctx.paths.thumbnail)
      await putObject(ctx.s3Keys.thumbnail, thumbBuffer, 'image/jpeg')
      logger.info({ event: 's3_upload_thumbnail', key: ctx.s3Keys.thumbnail })

    // 12. UPDATE CLIP IN DB: filePath, thumbnailPath, status='ready'
    await job.updateProgress(95)
    await prisma.clip.update({
      where: { id: ctx.clip.id },
      data: {
        filePath: ctx.s3Keys.clip,
        thumbnailPath: thumbnailGenerated ? ctx.s3Keys.thumbnail : null,
        status: 'ready',
      },
    })

    // 13. CHECK IF ALL CLIPS FOR THIS VIDEO ARE READY
    await checkVideoCompletion(ctx.video.id)

    await job.updateProgress(100)
    logger.info({ event: 'render_complete', clipId: ctx.clip.id, s3Path: ctx.s3Keys.clip })

  CATCH error:
    logger.error({ event: 'render_error', clipId: data.clipId, error: error.message,
                   stack: error.stack })
    await prisma.clip.update({
      where: { id: data.clipId },
      data: { status: 'failed' },
    })
    THROW error  // Re-throw for BullMQ retry

  FINALLY:
    // 14. CLEANUP TEMP FILES
    TRY:
      await fs.rm(tmpDir, { recursive: true, force: true })
      logger.debug({ event: 'tmpdir_cleaned', path: tmpDir })
    CATCH cleanupError:
      // Log but do not throw — cleanup failure is non-fatal
      logger.warn({ event: 'tmpdir_cleanup_failed', path: tmpDir,
                    error: cleanupError.message })


ON_FAILED(job, error):
  // Called by BullMQ after ALL retries exhausted (max 3)
  clipId = job.data.clipId
  videoId = job.data.videoId
  logger.error({ event: 'render_job_exhausted', jobId: job.id, clipId, videoId,
                 error: error.message, attemptsMade: job.attemptsMade })

  // Ensure clip is marked failed
  await prisma.clip.update({
    where: { id: clipId },
    data: { status: 'failed' },
  }).catch(() => {})  // Best effort

  // Check if we should mark video as failed (all clips failed)
  await checkVideoFailure(videoId)
```

## Helper: buildFFmpegArgs(ctx, filterChain)

```
INPUT: ctx: RenderContext, filterChain: string
OUTPUT: string[] (FFmpeg argument array)

STEPS:
  args = [
    '-y',                                        // Overwrite output
    '-ss', String(ctx.clip.startTime),           // Seek to start (input seeking, fast)
    '-to', String(ctx.clip.endTime),             // End time
    '-i', ctx.paths.sourceLocal,                 // Input file
  ]

  // If ASS subtitle file exists, add as input for the ass filter
  IF ctx.subtitleSegments.length > 0:
    // No need for separate -i; ass filter references file path directly

  // Apply video filter chain (always -vf; single linear chain, no multiple inputs)
  args.push('-vf', filterChain)

  // Video codec settings
  args.push(
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-profile:v', 'high',
    '-level', '4.1',
  )

  // Audio codec settings
  args.push(
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',                                  // Stereo
  )

  // MP4 optimization
  args.push('-movflags', '+faststart')

  // Output path
  args.push(ctx.paths.renderedClip)

  RETURN args
```

## Helper: buildFilterChain(format, assFilePath, cta, watermark, clipDuration)

```
INPUT:
  format: ClipFormat            // 'portrait' | 'square' | 'landscape'
  assFilePath: string | null    // Path to .ass subtitle file, or null if no subtitles
  cta: CTA | null               // CTA overlay configuration
  watermark: boolean            // Whether to add watermark
  clipDuration: number          // Clip duration in seconds
OUTPUT: string                  // FFmpeg filter_complex or -vf string

STEPS:
  filters: string[] = []
  { width, height } = FORMAT_DIMENSIONS[format]

  // 1. SCALE + PAD — fit source into target dimensions with letterboxing
  scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
                `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`
  filters.push(scaleFilter)

  // 2. ASS SUBTITLES — burn in via the ass filter
  //    ass filter reads the .ass file directly (not a separate input stream)
  //    Note: Path must be escaped for FFmpeg (colons, backslashes)
  IF assFilePath != null:
    escapedPath = escapeFFmpegPath(assFilePath)
    filters.push(`ass='${escapedPath}'`)

  // 3. CTA OVERLAY (only for position='overlay'; 'end' is handled via concat post-render)
  IF cta != null AND cta.position === 'overlay':
    ctaFilter = buildCtaOverlayFilter(cta, clipDuration, width, height)
    filters.push(ctaFilter)

  // 4. WATERMARK — semi-transparent text bottom-right
  IF watermark:
    watermarkFilter = buildWatermarkDrawtext(width, height)
    filters.push(watermarkFilter)

  // All filters are in a single linear chain (no stream splitting).
  // The `ass` filter reads its file directly (not a separate input stream),
  // so we always use `-vf` with comma-separated filters.
  RETURN filters.join(',')


HELPER escapeFFmpegPath(filePath: string): string
  // FFmpeg filter path escaping:
  // 1. Backslashes must be quadrupled (\ → \\\\) for FFmpeg filter parser
  // 2. Colons must be escaped (\:) — colons are option separators in filters
  // 3. Single quotes must be escaped
  RETURN filePath
    .replace(/\\/g, '\\\\\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "'\\''")
```

## Helper: buildCtaOverlayFilter(cta, clipDuration, width, height)

```
INPUT:
  cta: CTA                     // { text, position: 'overlay', duration }
  clipDuration: number          // seconds
  width: number                 // target video width
  height: number                // target video height
OUTPUT: string                  // FFmpeg drawtext filter string for overlay CTA
NOTE: Only called when cta.position === 'overlay'. For 'end', see generateCtaEndCard().

STEPS:
  escapedText = escapeDrawtext(cta.text)

  fontSize = Math.round(width * 0.035)       // ~38px at 1080w
  fontColor = 'white'
  borderWidth = 2
  borderColor = 'black'
  shadowColor = 'black@0.6'
  boxColor = 'black@0.5'
  boxBorderW = 16

  xPos = '(w-text_w)/2'
  yPos = Math.round(height * 0.85)           // Bottom 15% of frame

  // Show CTA during the last N seconds of the clip
  enableStart = clipDuration - cta.duration
  enableExpr = `enable='between(t,${enableStart},${clipDuration})'`

  RETURN `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}:` +
         `borderw=${borderWidth}:bordercolor=${borderColor}:` +
         `shadowcolor=${shadowColor}:shadowx=2:shadowy=2:` +
         `box=1:boxcolor=${boxColor}:boxborderw=${boxBorderW}:` +
         `x=${xPos}:y=${yPos}:${enableExpr}`
```

## Helper: generateCtaEndCard(cta, width, height, outputPath)

```
INPUT:
  cta: CTA                     // { text, position: 'end', duration }
  width: number                 // target video width (e.g. 1080)
  height: number                // target video height (e.g. 1920)
  outputPath: string            // temp file path for the CTA card video
OUTPUT: void (writes MP4 to outputPath)
NOTE: Generates a short video (black background + centered CTA text) for concat.

STEPS:
  escapedText = escapeDrawtext(cta.text)
  fontSize = Math.round(width * 0.045)       // ~49px at 1080w — larger on end card
  fontColor = 'white'
  boxColor = 'black@0.5'
  boxBorderW = 20

  args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=black:s=${width}x${height}:d=${cta.duration}:r=30`,
    '-f', 'lavfi',
    '-i', `anullsrc=channel_layout=stereo:sample_rate=44100`,
    '-t', String(cta.duration),
    '-vf', `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}:` +
           `box=1:boxcolor=${boxColor}:boxborderw=${boxBorderW}:` +
           `x=(w-text_w)/2:y=(h-text_h)/2`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ]

  await execFFmpeg(args, 30_000)   // 30s timeout for short card generation


HELPER escapeDrawtext(text: string): string
  // Escape FFmpeg drawtext special characters
  RETURN text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\''")
    .replace(/:/g, '\\:')
```

## Helper: concatClipAndCta(clipPath, ctaPath, outputPath)

```
INPUT:
  clipPath: string              // Path to rendered main clip MP4
  ctaPath: string               // Path to CTA end card MP4
  outputPath: string            // Path for the final concatenated MP4
OUTPUT: void (writes final MP4 to outputPath)

STEPS:
  // 1. Write concat list file
  concatListPath = clipPath.replace('.mp4', '-concat.txt')
  concatContent = `file '${clipPath}'\nfile '${ctaPath}'\n`
  await fs.writeFile(concatListPath, concatContent, 'utf-8')

  // 2. Concatenate using concat demuxer (stream copy, no re-encoding)
  args = [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-c', 'copy',                  // Stream copy — no re-encoding
    '-movflags', '+faststart',
    outputPath,
  ]

  await execFFmpeg(args, 30_000)   // 30s timeout for concat

  // 3. Cleanup intermediate files
  await fs.unlink(concatListPath).catch(() => {})

NOTES:
  - Uses stream copy (`-c copy`) — no quality loss, near-instant
  - CTA end card must have matching codec settings (libx264, AAC) for concat to work
  - The `anullsrc` in generateCtaEndCard ensures audio stream is present for concat
```

## Helper: buildWatermarkDrawtext(width, height)

```
INPUT:
  width: number                 // target video width
  height: number                // target video height
OUTPUT: string                  // FFmpeg drawtext filter string for watermark

STEPS:
  text = 'КлипМейкер.ру'
  escapedText = text.replace(/:/g, '\\:')

  fontSize = Math.round(width * 0.022)        // ~24px at 1080w — subtle
  fontColor = 'white@0.4'                     // Semi-transparent
  shadowColor = 'black@0.3'

  // Position: bottom-right with padding
  xPadding = Math.round(width * 0.02)         // ~22px
  yPadding = Math.round(height * 0.02)        // ~38px (portrait) or ~22px (landscape)
  xPos = `w-text_w-${xPadding}`
  yPos = `h-text_h-${yPadding}`

  RETURN `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}:` +
         `shadowcolor=${shadowColor}:shadowx=1:shadowy=1:` +
         `x=${xPos}:y=${yPos}`
```

## Helper: generateSubtitleFile(segments, clipDuration, format)

```
INPUT:
  segments: SubtitleSegment[]   // [{ start, end, text }] — times relative to clip start
  clipDuration: number          // seconds
  format: ClipFormat            // 'portrait' | 'square' | 'landscape'
OUTPUT: string                  // ASS file content

STEPS:
  // 1. RESOLVE FORMAT-DEPENDENT VALUES
  { width, height } = FORMAT_DIMENSIONS[format]
  fontSize = format === 'portrait' ? 48 : 36
  maxCharsPerLine = format === 'portrait' ? 35 : 50

  // 2. ASS HEADER
  header = `[Script Info]
Title: КлипМейкер Subtitles
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Montserrat,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1.5,2,30,30,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`

  // Style breakdown:
  //   Fontname: Montserrat (clean modern font, full Cyrillic, OFL license)
  //   Fontsize: 48 (portrait) or 36 (square/landscape) — mobile-readable
  //   PrimaryColour: &H00FFFFFF (white, AABBGGRR format)
  //   OutlineColour: &H00000000 (black outline)
  //   BackColour: &H80000000 (semi-transparent black shadow)
  //   Bold: -1 (true — bold text)
  //   BorderStyle: 1 (outline + shadow)
  //   Outline: 3 (3px outline thickness)
  //   Shadow: 1.5 (1.5px shadow distance)
  //   Alignment: 2 (bottom center — SSA numpad: 2=bottom-center)
  //   MarginV: 60 (vertical margin from bottom in pixels)
  //   WrapStyle: 0 (smart word wrap at PlayResX boundary)

  // 2. DIALOGUE EVENTS
  events: string[] = []
  FOR each segment IN segments:
    // Clamp to clip duration
    start = Math.max(0, segment.start)
    end = Math.min(clipDuration, segment.end)

    IF end <= start: CONTINUE  // Skip zero/negative-duration segments

    startTimecode = formatASSTimecode(start)
    endTimecode = formatASSTimecode(end)

    // Sanitize text: strip newlines, escape ASS special chars
    cleanText = segment.text
      .replace(/\r?\n/g, '\\N')        // ASS line break
      .replace(/\{/g, '\\{')           // Escape ASS override blocks
      .replace(/\}/g, '\\}')

    // Word wrap: insert \N at maxCharsPerLine boundary for mobile readability
    cleanText = wrapSubtitleText(cleanText, maxCharsPerLine)

    events.push(`Dialogue: 0,${startTimecode},${endTimecode},Default,,0,0,0,,${cleanText}`)

  // 3. COMBINE
  RETURN header + '\n' + events.join('\n') + '\n'


HELPER formatASSTimecode(seconds: number): string
  // ASS format: H:MM:SS.CC (centiseconds)
  h = Math.floor(seconds / 3600)
  m = Math.floor((seconds % 3600) / 60)
  s = Math.floor(seconds % 60)
  cs = Math.round((seconds % 1) * 100)
  IF cs >= 100: cs = 99  // Clamp rounding overflow
  RETURN `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`


HELPER wrapSubtitleText(text: string, maxChars: number): string
  // Insert ASS line break (\N) at word boundaries near maxChars
  words = text.split(' ')
  lines: string[] = []
  currentLine = ''

  FOR each word IN words:
    IF currentLine.length + word.length + 1 > maxChars AND currentLine.length > 0:
      lines.push(currentLine)
      currentLine = word
    ELSE:
      currentLine = currentLine.length > 0 ? currentLine + ' ' + word : word

  IF currentLine.length > 0:
    lines.push(currentLine)

  RETURN lines.join('\\N')
```

## Helper: generateThumbnail(videoPath, outputPath, timeOffset)

```
INPUT:
  videoPath: string       // Path to the rendered clip (local)
  outputPath: string      // Path for the output thumbnail JPEG
  timeOffset: number      // Seconds into the clip (typically 25% of duration)
OUTPUT: void

STEPS:
  args = [
    '-y',
    '-ss', String(timeOffset),
    '-i', videoPath,
    '-vframes', '1',                     // Extract single frame
    '-vf', 'scale=360:-1',              // 360px wide, maintain aspect ratio
    '-q:v', '3',                        // JPEG quality (2=best, 31=worst; 3 is high quality)
    outputPath,
  ]

  await execFFmpeg(args, 15_000)   // 15 second timeout for single frame extraction

NOTES:
  - timeOffset = clipDuration * 0.25 — captures an early but meaningful frame
  - scale=360:-1 — FFmpeg auto-calculates height to maintain aspect ratio
  - Output format is inferred from .jpg extension
  - If the source clip is very short (<1s), timeOffset may be 0
```

## Helper: execFFmpegSpawn(args, timeoutMs)

```
INPUT:
  args: string[]          // FFmpeg arguments (without 'ffmpeg' itself)
  timeoutMs: number       // Timeout in milliseconds
OUTPUT: void
THROWS: Error on non-zero exit code or timeout

STEPS:
  logger.debug({ event: 'ffmpeg_exec', args: args.slice(0, 8) })

  proc = spawn('ffmpeg', args, { stdio: 'pipe' })

  // Set up timeout kill switch
  timeoutHandle = setTimeout(() => {
    proc.kill('SIGKILL')
  }, timeoutMs)

  // Capture stderr for error diagnostics (bounded buffer)
  stderr = ''
  STDERR_MAX = 65536   // 64KB
  proc.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
    IF stderr.length > STDERR_MAX:
      stderr = stderr.slice(-STDERR_MAX)
  })

  // Wait for process exit
  RETURN new Promise((resolve, reject) => {
    proc.on('close', (code) => {
      clearTimeout(timeoutHandle)
      IF code === 0:
        resolve()
      ELSE:
        logger.error({ event: 'ffmpeg_error', code, stderr: stderr.slice(-500) })
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-200)}`))
    })

    proc.on('error', (err) => {
      clearTimeout(timeoutHandle)
      reject(err)
    })
  })

NOTES:
  - Uses spawn (not exec) to avoid shell injection — args are passed as array
  - stderr is bounded to prevent memory exhaustion on long FFmpeg runs
  - SIGKILL is used on timeout because SIGTERM may be ignored by FFmpeg during encoding
```

## Helper: checkVideoCompletion(videoId)

```
INPUT: videoId: string
OUTPUT: void (side effect: may update video.status)

STEPS:
  // Count clip statuses for this video
  clips = await prisma.clip.findMany({
    where: { videoId },
    select: { status: true },
  })

  IF clips.length === 0:
    RETURN  // No clips — nothing to check

  allReady = clips.every(c => c.status === 'ready')
  IF allReady:
    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'completed' },
    })
    logger.info({ event: 'video_completed', videoId, clipCount: clips.length })

NOTES:
  - This is called after each clip render completes
  - The last clip to finish triggers the video status transition
  - Race condition: two clips finishing simultaneously could both query and both update
    This is safe because the update is idempotent (completed → completed is a no-op)
```

## Helper: checkVideoFailure(videoId)

```
INPUT: videoId: string
OUTPUT: void (side effect: may update video.status)

STEPS:
  clips = await prisma.clip.findMany({
    where: { videoId },
    select: { status: true },
  })

  IF clips.length === 0:
    RETURN

  allFailed = clips.every(c => c.status === 'failed')
  IF allFailed:
    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'failed' },
    })
    logger.error({ event: 'video_all_clips_failed', videoId, clipCount: clips.length })

NOTES:
  - Only marks video as failed if ALL clips failed
  - If some clips succeed and some fail, video remains 'generating_clips'
  - User can see partial results and retry failed clips
```

## State Transitions

```
Clip.status flow:
  pending ──────────────────────► rendering ──────────────────► ready
    │ (handleRenderJob start)        │ (FFmpeg + S3 upload)      │
    │                                │                            │
    │                                ▼                            │
    │                              failed ◄───── (on error) ──────┘
    │                                │                       (never happens;
    │                                │                        shown for clarity)
    │                                ▼
    │                        [BullMQ retry 1-3]
    │                                │
    │                                ├──► rendering → ready  (retry succeeds)
    │                                └──► failed             (all retries exhausted)
    ▼
  failed  (validation error — no retries)


Video.status flow (render phase):
  generating_clips ────► completed     (all clips.status === 'ready')
         │
         ├──────────────► failed       (all clips.status === 'failed')
         │
         └──────────────► generating_clips  (partial: some ready, some failed/pending)


Trigger conditions:
  - pending → rendering:   Worker picks up job, sets status before processing
  - rendering → ready:     FFmpeg succeeds, S3 upload succeeds, DB updated
  - rendering → failed:    Any unrecoverable error in the render pipeline
  - failed → rendering:    BullMQ retry — worker re-enters handler, re-sets status
                           (job.data still has same clipId; handler accepts 'failed' status)
  - generating_clips → completed:  checkVideoCompletion() — last clip finishes
  - generating_clips → failed:     checkVideoFailure() — all clips exhausted retries
```

## Error Handling Strategy

```
ERROR HIERARCHY (from most specific to most general):

1. VALIDATION ERRORS (Zod parse failure)
   - Mark clip.status = 'failed' immediately
   - Do NOT retry (bad data will not improve on retry)
   - Log with full Zod error issues for debugging

2. DB ERRORS (Prisma)
   - clip/video not found → THROW (BullMQ retries — may be timing issue)
   - clip.status not in ['pending', 'failed'] → RETURN (idempotent skip)
   - Status update failure → THROW (retry will re-attempt)

3. S3 DOWNLOAD ERRORS
   - Transient (500, 502, 503) → S3 client retries internally (withRetry in operations.ts)
   - Permanent (404 NotFound, 403 AccessDenied) → THROW → clip.status = 'failed'
   - Timeout → THROW → BullMQ retry

4. FFMPEG ERRORS
   - Non-zero exit code → THROW → clip.status = 'failed' → BullMQ retry
   - Timeout (5 min) → SIGKILL → THROW → BullMQ retry
   - spawn ENOENT (ffmpeg not installed) → THROW → all retries will fail → fatal
   - Common diagnosable codes:
     - Exit 1: Generic error (check stderr for details)
     - "No such filter": ASS filter not compiled in FFmpeg build
     - "Invalid data found": Corrupt source file — no retry will help

5. S3 UPLOAD ERRORS
   - Transient → S3 client retries internally
   - Permanent → THROW → clip.status = 'failed'

6. THUMBNAIL ERRORS
   - Non-critical: if thumbnail generation fails, proceed without it
   - Set thumbnailPath = null in DB update
   - Log warning, do not fail the entire render

CLEANUP GUARANTEE:
  - tmpDir is ALWAYS cleaned in the finally block
  - If cleanup fails, log warning but do not throw
  - OS tmpdir will eventually reclaim space
  - Stale temp detection: files in /tmp/clipmaker-render-* older than 1 hour can be purged

IDEMPOTENCY:
  - Handler accepts clips in 'pending' or 'failed' status
  - Re-running the same job produces the same S3 objects (overwrite is safe)
  - checkVideoCompletion/checkVideoFailure are idempotent
  - Progress updates are best-effort (no side effects if Redis is temporarily unavailable)
```

## S3 Path Conventions

```
Rendered clips:   clips/{userId}/{videoId}/{clipId}.mp4
Thumbnails:       thumbnails/{userId}/{videoId}/{clipId}.jpg
Source videos:    videos/{userId}/{videoId}/source.{ext}

Path functions from packages/s3/src/paths.ts:
  clipPath(userId, videoId, clipId)       → 'clips/{userId}/{videoId}/{clipId}.mp4'
  thumbnailPath(userId, videoId, clipId)  → 'thumbnails/{userId}/{videoId}/{clipId}.jpg'

All path segments are validated via assertSafeSegment() — alphanumeric + dash + underscore only.
```

## Worker Registration

```
// apps/worker/workers/video-render.ts

const FFMPEG_TIMEOUT = 5 * 60 * 1000  // 5 minutes

const worker = new Worker<VideoRenderJobData>(
  QUEUE_NAMES.VIDEO_RENDER,
  handleRenderJob,
  {
    connection: getRedisConnection(),
    concurrency: 3,
    limiter: {
      max: 5,           // Max 5 jobs per duration window
      duration: 60_000, // Per minute — prevents CPU saturation
    },
  },
)

worker.on('failed', async (job, err) => {
  IF job:
    await onFailed(job, err)
})

worker.on('error', (err) => {
  logger.error({ event: 'worker_error', error: err.message })
})
```

## Performance Considerations

```
1. INPUT SEEKING (-ss before -i)
   - Placing -ss before -i enables input seeking (fast keyframe seek)
   - vs. output seeking (-ss after -i): avoids decoding entire file
   - Trade-off: may start from nearest keyframe, not exact timestamp
   - For shorts (15-60s clips), keyframe imprecision is acceptable

2. PRESET SELECTION
   - 'fast' preset: good balance of encoding speed vs. compression
   - For 60s clip at 1080p: ~10-20s encode time on modern CPU
   - 'ultrafast' would be 2x faster but ~40% larger file
   - 'slow' would be 20% smaller but 5x slower — not worth it for UGC clips

3. PARALLEL CLIP RENDERING
   - concurrency: 3 — allows 3 FFmpeg processes simultaneously
   - Each FFmpeg process uses ~1-2 CPU cores
   - Suitable for 4-8 core VPS instances
   - Rate limiter prevents burst overload (5 jobs/min)

4. MEMORY USAGE
   - Source video downloaded to tmpDir (not kept in memory)
   - Rendered clip read to Buffer for S3 upload — max ~500MB for 60s 1080p
   - Thumbnail is small (<100KB)
   - Consider streaming upload (createReadStream → putObject) for large clips

5. S3 DOWNLOAD OPTIMIZATION
   - Full source video downloaded even though only a segment is needed
   - Optimization (future): use S3 byte-range requests + FFmpeg pipe
   - Current approach is simpler and compatible with all FFmpeg versions
```
