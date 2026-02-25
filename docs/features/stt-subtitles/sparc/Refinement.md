# STT + Subtitles — Refinement

## Edge Cases

### Audio Edge Cases

| # | Edge Case | Expected Behavior |
|---|-----------|-------------------|
| E1 | Video has no audio stream | FFmpeg extraction fails → video.status = "failed", user sees "Видео не содержит аудио" |
| E2 | Audio is complete silence | Whisper returns empty/no segments → create transcript with empty segments, status = "analyzing" |
| E3 | Audio has music/background noise | Whisper returns low-confidence segments → filter `no_speech_prob > 0.8`, keep rest |
| E4 | Very short video (<10 sec) | Single chunk, normal processing. Minimum viable: 1 segment |
| E5 | Very long video (4h) | 24 chunks × 10 min, processed 3 at a time → ~2 min total STT time |
| E6 | Non-Russian speech in "ru" mode | Whisper still transcribes (may be lower quality), results stored as-is |
| E7 | Mixed languages (Russian + English terms) | Whisper handles code-switching; English technical terms may be transliterated |
| E8 | Corrupted audio stream | FFmpeg extraction may fail or produce short output → STT proceeds with what's available |

### Quota Edge Cases

| # | Edge Case | Expected Behavior |
|---|-----------|-------------------|
| Q1 | User has 0 minutes remaining | Video status → "failed", error: "Минуты исчерпаны" |
| Q2 | User has 5 min, video is 60 min | Transcribe first 5 minutes only, note partial transcript |
| Q3 | User's plan changes mid-processing | Use quota at time of job start (snapshot) |
| Q4 | Concurrent STT jobs deplete quota | Each job checks independently — possible slight overuse (acceptable for MVP) |

### Transcript Edit Edge Cases

| # | Edge Case | Expected Behavior |
|---|-----------|-------------------|
| T1 | Edit segment with index out of bounds | 400 BAD_REQUEST: "Индекс сегмента вне диапазона" |
| T2 | Edit with empty text | 400 BAD_REQUEST: Zod validation rejects empty string |
| T3 | Edit non-existent transcript | 404 NOT_FOUND: "Транскрипт ещё не готов" |
| T4 | Concurrent edits by same user | Last write wins (acceptable for single-user access) |
| T5 | Edit segment to very long text (>1000 chars) | Zod validation: max 1000 chars per segment |
| T6 | Edit with XSS payload | Text stored as-is in JSON, rendered with React (auto-escaped). No DOMPurify needed for React text nodes |

### Infrastructure Edge Cases

| # | Edge Case | Expected Behavior |
|---|-----------|-------------------|
| I1 | /tmp disk full | FFmpeg fails → STT job fails → retry via BullMQ (may succeed after /tmp cleanup) |
| I2 | S3 download timeout | Retry download up to 2 times (exponential backoff). On failure, video.status = "failed" |
| I3 | Cloud.ru Whisper 503 | Retry up to 2 times with exponential backoff (2s, 8s) |
| I4 | Worker crash mid-processing | BullMQ marks job as failed → retried (default 3 attempts). /tmp files orphaned → cleaned on container restart |
| I5 | Very large S3 file download (4GB) | Stream to disk, don't load into memory. ~60s download on 500 Mbps |
| I6 | FFmpeg not found in container | Worker startup health check verifies ffmpeg/ffprobe in PATH |

## Testing Strategy

### Unit Tests

| Test | Target | Framework |
|------|--------|-----------|
| ffprobeGetDuration() | Parse ffprobe JSON output | Vitest + mock execFile |
| extractAudio() | Verify FFmpeg args construction | Vitest + mock execFile |
| splitAudio() | Chunk calculation for various durations | Vitest (pure logic) |
| Segment merger: offset calculation | Correct timestamp offsets | Vitest (pure logic) |
| Segment merger: silence filtering | Filter no_speech_prob > 0.8 | Vitest (pure logic) |
| Token count heuristic | Word count × 2.5 | Vitest (pure logic) |
| Cost calculation | RU vs Global pricing | Vitest (pure logic) |
| Quota enforcement | Min(video duration, remaining minutes) | Vitest (pure logic) |

### Integration Tests

| Test | Target | Framework |
|------|--------|-----------|
| STT worker full pipeline | S3 mock + FFmpeg + Whisper mock → transcript in DB | Vitest + testcontainers (PG, Redis) + MSW |
| transcript.getSegments | Ownership check + JSON response | Vitest + tRPC caller |
| transcript.updateSegments | Edit persistence + fullText rebuild | Vitest + tRPC caller |
| Quota deduction | User.minutesUsed incremented correctly | Vitest + testcontainers |
| Usage record creation | Correct cost calculation in UsageRecord | Vitest + testcontainers |

### E2E Tests (Playwright)

| Test | Scope |
|------|-------|
| Video detail page shows transcript | Navigate → verify segments displayed |
| Edit subtitle inline | Click segment → type → save → verify persistence |
| Processing state UI | Upload video → see "Транскрибируем..." → eventually see transcript |

## Performance Optimizations

1. **Parallel chunk transcription** (3x speedup): Process 3 chunks concurrently instead of sequentially
2. **Stream S3 download**: Don't load entire video into memory, pipe directly to file
3. **Incremental cleanup**: Delete each chunk after transcription, don't wait for all to finish
4. **Skip audio extraction for audio-only files**: If input is mp3/wav/m4a, skip FFmpeg extraction step
5. **Optimistic UI updates**: Subtitle edits update React state immediately, API call in background

## Technical Debt

| Item | Priority | Description |
|------|----------|-------------|
| TD-01 | Medium | Add tiktoken for accurate token counting (currently heuristic) |
| TD-02 | Low | Support word-level timestamps for karaoke-style subtitles |
| TD-03 | Medium | Add Whisper fallback (Cloud.ru → OpenAI) if primary provider fails |
| TD-04 | Low | Post-processing: LLM-based punctuation restoration for Whisper output |
| TD-05 | Low | Transcript diff/version history for undo beyond session |
