# STT + Subtitles — Pseudocode

## Data Structures

```typescript
// Already exists in Prisma schema — no changes needed
type Transcript = {
  id: UUID
  videoId: UUID
  language: string         // "ru" | "en"
  segments: TranscriptSegment[]  // JSON column
  fullText: string         // full concatenated text
  tokenCount: number       // for LLM Router tier decisions
  sttModel: string         // "whisper-large-v3" | "whisper-1"
  sttProvider: string      // "cloudru" | "openai"
  createdAt: DateTime
}

type TranscriptSegment = {
  start: number            // seconds (float)
  end: number              // seconds (float)
  text: string             // segment text
  confidence: number       // 0-1 from avg_logprob
}

// STT job data (already exists in @clipmaker/types)
type STTJobData = {
  videoId: string
  filePath: string         // S3 key
  strategy: 'ru' | 'global'
  language: string         // default "ru"
}

// New: segment edit payload
type SegmentEdit = {
  index: number            // segment array index
  text: string             // new text (non-empty)
}
```

## Algorithm: STT Worker Pipeline

```
INPUT: job: STTJobData
OUTPUT: Transcript record in DB, Video.status = "analyzing"

STEPS:

1. VALIDATE JOB:
   video = await prisma.video.findUnique({ where: { id: job.videoId } })
   IF !video OR video.status !== 'transcribing':
     THROW "Invalid video state"
   user = await prisma.user.findUnique({ where: { id: video.userId } })
   IF !user:
     THROW "User not found"

2. DOWNLOAD VIDEO FROM S3:
   tmpDir = mkdtemp('/tmp/stt-')
   videoPath = path.join(tmpDir, 'source' + path.extname(video.filePath))
   await downloadFromS3(video.filePath, videoPath)

3. PROBE DURATION:
   durationSeconds = await ffprobeGetDuration(videoPath)
   // ffprobe -v quiet -print_format json -show_format videoPath
   // parse result.format.duration as float, round to int

4. CHECK QUOTA:
   remainingMinutes = user.minutesLimit - user.minutesUsed
   videoDurationMinutes = Math.ceil(durationSeconds / 60)
   transcribeMinutes = Math.min(videoDurationMinutes, remainingMinutes)
   IF transcribeMinutes <= 0:
     await prisma.video.update({ where: { id: video.id }, data: { status: 'failed' } })
     THROW "No minutes remaining"
   transcribeDuration = transcribeMinutes * 60  // seconds to transcribe

5. EXTRACT AUDIO:
   audioPath = path.join(tmpDir, 'audio.wav')
   // Only extract up to transcribeDuration seconds
   await execFFmpeg([
     '-i', videoPath,
     '-vn', '-ac', '1', '-ar', '16000', '-acodec', 'pcm_s16le',
     '-t', String(transcribeDuration),
     audioPath
   ])
   // Timeout: 30s. WAV size ≈ 1.92 MB/min

6. CHUNK AUDIO (if needed):
   CHUNK_DURATION = 600  // 10 minutes = ~19.2MB per chunk
   chunks: { path: string, offsetSeconds: number }[] = []

   IF transcribeDuration <= CHUNK_DURATION:
     chunks = [{ path: audioPath, offsetSeconds: 0 }]
   ELSE:
     numChunks = Math.ceil(transcribeDuration / CHUNK_DURATION)
     FOR i = 0 TO numChunks - 1:
       chunkPath = path.join(tmpDir, `chunk_${i}.wav`)
       startSec = i * CHUNK_DURATION
       await execFFmpeg([
         '-i', audioPath,
         '-ss', String(startSec),
         '-t', String(CHUNK_DURATION),
         '-c', 'copy',
         chunkPath
       ])
       chunks.push({ path: chunkPath, offsetSeconds: startSec })

7. TRANSCRIBE CHUNKS (parallel, concurrency 3):
   sttConfig = LLM_PROVIDERS[job.strategy].stt
   client = getOpenAIClient(job.strategy, sttConfig.provider)

   allSegments: TranscriptSegment[] = []

   await pMap(chunks, async (chunk) => {
     file = fs.createReadStream(chunk.path)
     response = await client.audio.transcriptions.create({
       model: sttConfig.model,
       file: file,
       language: job.language,
       response_format: 'verbose_json',
     })

     // Extract segments with offset
     segments = (response.segments || []).map(seg => ({
       start: seg.start + chunk.offsetSeconds,
       end: seg.end + chunk.offsetSeconds,
       text: seg.text.trim(),
       confidence: seg.avg_logprob
         ? Math.min(1, Math.max(0, 1 + seg.avg_logprob))  // logprob is negative
         : 0.9  // default if not provided
     }))

     // Filter out silence/noise
     segments = segments.filter(s =>
       s.text.length > 0 && (seg.no_speech_prob ?? 0) < 0.8
     )

     allSegments.push(...segments)
   }, { concurrency: 3 })

   // Sort by start time (chunks may arrive out of order)
   allSegments.sort((a, b) => a.start - b.start)

8. BUILD FULL TEXT:
   fullText = allSegments.map(s => s.text).join(' ')
   wordCount = fullText.split(/\s+/).filter(Boolean).length
   tokenCount = Math.ceil(wordCount * 2.5)  // heuristic for T-Pro tokenizer

9. SAVE TRANSCRIPT + UPDATE VIDEO + TRACK USAGE (single transaction):
   sttCostKopecks = job.strategy === 'ru'
     ? Math.ceil(transcribeDuration * 0.005 * 100)  // 0.005₽/sec → kopecks
     : Math.ceil((transcribeDuration / 60) * 0.55 * 100)  // ~0.55₽/min → kopecks

   await prisma.$transaction([
     prisma.transcript.create({
       data: {
         videoId: video.id,
         language: job.language,
         segments: allSegments,  // JSON
         fullText,
         tokenCount,
         sttModel: sttConfig.model,
         sttProvider: job.strategy === 'ru' ? 'cloudru' : 'openai',
       }
     }),
     prisma.video.update({
       where: { id: video.id },
       data: {
         status: 'analyzing',
         durationSeconds: Math.round(durationSeconds),
         fileSize: video.fileSize,  // keep existing
       }
     }),
     prisma.user.update({
       where: { id: user.id },
       data: { minutesUsed: { increment: transcribeMinutes } }
     }),
     prisma.usageRecord.create({
       data: {
         userId: user.id,
         videoId: video.id,
         minutesConsumed: transcribeMinutes,
         sttCostKopecks,
         llmCostKopecks: 0,
         gpuCostKopecks: 0,
         providerStrategy: job.strategy === 'ru' ? 'ru' : 'global',
       }
     }),
   ])

10. CLEANUP:
    await rm(tmpDir, { recursive: true, force: true })
    // In finally block to ensure cleanup even on error

11. ENQUEUE NEXT STEP:
    // The next feature (moment selection) will pick up videos in "analyzing" status
    // For now, the pipeline stops here. The LLM analyze worker will be wired in the next feature.

ERROR HANDLING:
  - Whisper API error (transient): retry up to 2 times, exponential backoff (2s, 8s)
  - Whisper API error (4xx): fail immediately, mark video as "failed"
  - FFmpeg error: fail immediately, mark video as "failed"
  - S3 download error: fail immediately, mark video as "failed"
  - All errors: cleanup tmpDir in finally block
  - All errors: log with { videoId, step, error }
```

## Algorithm: FFmpeg Probe Duration

```
INPUT: filePath: string (local path)
OUTPUT: durationSeconds: number

STEPS:
1. result = execSync('ffprobe -v quiet -print_format json -show_format ' + shellescape(filePath))
2. parsed = JSON.parse(result)
3. duration = parseFloat(parsed.format.duration)
4. IF isNaN(duration) OR duration <= 0:
     THROW "Could not determine video duration"
5. RETURN duration

SECURITY: Use execFile (not exec) to prevent shell injection. Pass filePath as argument, not in string.
```

## Algorithm: S3 Download to File

```
INPUT: s3Key: string, localPath: string
OUTPUT: void (file written to localPath)

STEPS:
1. s3 = getS3Client()
2. response = await s3.send(new GetObjectCommand({ Bucket: getBucket(), Key: s3Key }))
3. IF !response.Body: THROW "Empty S3 object"
4. writeStream = fs.createWriteStream(localPath)
5. await pipeline(response.Body as Readable, writeStream)
   // Use stream.pipeline for proper backpressure and error handling
```

## tRPC Procedures

### transcript.getSegments

```
INPUT: { videoId: string (uuid) }
OUTPUT: { segments: TranscriptSegment[], language: string, sttModel: string, sttProvider: string }

STEPS:
1. userId = ctx.session.user.id
2. video = await prisma.video.findFirst({ where: { id: videoId, userId } })
3. IF !video: THROW NOT_FOUND
4. transcript = await prisma.transcript.findUnique({ where: { videoId } })
5. IF !transcript: THROW NOT_FOUND "Транскрипт ещё не готов"
6. RETURN {
     segments: transcript.segments as TranscriptSegment[],
     language: transcript.language,
     sttModel: transcript.sttModel,
     sttProvider: transcript.sttProvider,
   }
```

### transcript.updateSegments

```
INPUT: {
  videoId: string (uuid),
  edits: Array<{ index: number (int, non-negative), text: string (min 1, max 1000) }>
}
OUTPUT: { success: true }

STEPS:
1. userId = ctx.session.user.id
2. video = await prisma.video.findFirst({ where: { id: videoId, userId } })
3. IF !video: THROW NOT_FOUND

4. transcript = await prisma.transcript.findUnique({ where: { videoId } })
5. IF !transcript: THROW NOT_FOUND

6. segments = transcript.segments as TranscriptSegment[]
7. FOR each edit IN edits:
     IF edit.index < 0 OR edit.index >= segments.length:
       THROW BAD_REQUEST "Индекс сегмента вне диапазона"
     segments[edit.index].text = edit.text.trim()

8. fullText = segments.map(s => s.text).join(' ')
9. tokenCount = Math.ceil(fullText.split(/\s+/).filter(Boolean).length * 2.5)

10. await prisma.transcript.update({
      where: { videoId },
      data: { segments, fullText, tokenCount }
    })

11. RETURN { success: true }
```

### transcript.getFullText

```
INPUT: { videoId: string (uuid) }
OUTPUT: { fullText: string, tokenCount: number, language: string }

STEPS:
1. userId = ctx.session.user.id
2. video = await prisma.video.findFirst({ where: { id: videoId, userId } })
3. IF !video: THROW NOT_FOUND
4. transcript = await prisma.transcript.findUnique({ where: { videoId } })
5. IF !transcript: THROW NOT_FOUND
6. RETURN { fullText: transcript.fullText, tokenCount: transcript.tokenCount, language: transcript.language }
```

## State Transitions

```
Video.status flow for STT:
  "uploading" → (confirmUpload) → "transcribing" → (STT worker) → "analyzing"
                                                  ↘ (on error) → "failed"

  "transcribing" is set by confirmUpload (existing code in video.ts)
  "analyzing" is set by STT worker on success
  "failed" is set by STT worker on unrecoverable error
```

## Helper: execFFmpeg

```
INPUT: args: string[]
OUTPUT: void

STEPS:
1. result = await execFile('ffmpeg', args, { timeout: 30_000 })
2. IF result.exitCode !== 0:
     THROW new Error(`FFmpeg failed: ${result.stderr}`)

SECURITY: Use execFile (array args), NOT exec (string). Prevents shell injection.
TIMEOUT: 30 seconds default. Override for extraction of very long files.
```
