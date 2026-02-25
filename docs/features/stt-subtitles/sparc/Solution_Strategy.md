# STT + Subtitles — Solution Strategy

## Problem Decomposition (First Principles)

### Fundamental truths:
1. Whisper API accepts audio files ≤25MB → long videos must be chunked
2. Video files contain audio+video streams → must extract audio before STT
3. Whisper returns timed segments → these become subtitle segments
4. Users want to correct STT errors → need inline editing
5. Downstream features (moment selection) need full transcript text + token count

### Core subproblems:
1. **Audio pipeline:** S3 download → FFmpeg extract → chunk → upload to Whisper
2. **Transcript assembly:** Merge chunked results → align timestamps → store
3. **Duration extraction:** FFmpeg probe → update Video record
4. **Usage accounting:** Track minutes consumed, debit from user quota
5. **API surface:** tRPC endpoints for transcript read/edit
6. **UI:** Transcript viewer + subtitle editor

## Architecture Decisions

### AD-01: Audio Extraction in Worker (not separate job)
**Decision:** Extract audio within the STT worker, not as a separate BullMQ job.
**Rationale:** FFmpeg extraction takes <10s even for 2h videos. Adding a separate job adds queue latency (~2-5s) and complexity with no benefit. Keep the pipeline simple: one job = one video = full STT.

### AD-02: Chunk at 10-minute intervals
**Decision:** Split audio into 10-minute WAV chunks (≈19.2MB, well under 25MB limit).
**Rationale:** 10 minutes keeps each chunk safely under 25MB. Smaller chunks (5 min) would increase API calls and reassembly complexity. Larger chunks (15 min) risk hitting the limit with some audio formats.

### AD-03: Parallel chunk processing (concurrency 3)
**Decision:** Process up to 3 chunks in parallel via Promise.all with concurrency limiter.
**Rationale:** Cloud.ru allows 15 req/sec. 3 parallel requests is conservative and reduces total time from O(n) to O(n/3) while staying well within rate limits.

### AD-04: Segment-level timestamps (not word-level)
**Decision:** Use segment-level timestamps from `verbose_json`. Do not request word-level.
**Rationale:** Segment-level (sentence-like, 2-15s each) is sufficient for subtitles. Word-level adds API latency, isn't confirmed on Cloud.ru, and complicates the subtitle rendering. Word-level can be added later for karaoke-style subtitles.

### AD-05: Token count via word-count heuristic
**Decision:** `tokenCount = Math.ceil(wordCount * 2.5)` for MVP.
**Rationale:** Only used for LLM Router tier selection (threshold: 100K tokens). The heuristic is conservative (overestimates slightly), which is safe — it routes to tier3 for genuinely long transcripts. Avoids adding tiktoken dependency.

### AD-06: Temporary files on disk (not streaming)
**Decision:** Write audio chunks to /tmp, clean up after processing.
**Rationale:** FFmpeg and Whisper API both work with files. Streaming adds complexity with no benefit for batch processing. /tmp is cleaned on container restart. Explicit cleanup after each job.

### AD-07: Minutes tracking — debit after successful STT
**Decision:** Debit `user.minutesUsed` only after successful transcription, not at upload time.
**Rationale:** If STT fails, user shouldn't lose minutes. Debit happens in a transaction with transcript creation and video status update.

## TRIZ Contradictions Resolved

### Contradiction 1: Large files vs. 25MB API limit
**Resolution (Segmentation):** Split audio into chunks. Each chunk processed independently, results reassembled with offset calculation.

### Contradiction 2: Speed vs. Rate limits
**Resolution (Parallelism with constraint):** Process 3 chunks concurrently — 3x speedup while staying within 15 req/sec limit.

### Contradiction 3: Accuracy vs. Real-time
**Resolution (Partial action):** Don't aim for 100% accuracy — provide ~95% base accuracy and let users fix the rest via subtitle editor. This is faster than using more expensive/slower models.

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| Cloud.ru Whisper doesn't support verbose_json | Fallback: parse `text` response, split into sentences with estimated timestamps based on word count |
| FFmpeg not installed in worker container | Dockerfile: `apt-get install -y ffmpeg` — verified in existing ffmpeg.ts |
| /tmp fills up with audio files | Cleanup in finally block + container tmpfs limit |
| Whisper returns empty segments for silence | Filter out segments with no_speech_prob > 0.8 |
| User runs out of minutes mid-processing | Check quota before starting; if insufficient, process only first N minutes |
