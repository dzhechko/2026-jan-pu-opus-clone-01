# STT + Subtitles — Research Findings

## 1. Cloud.ru Whisper Large-v3 API

- **Model:** `whisper-large-v3` via OpenAI-compatible endpoint
- **Endpoint:** `POST {baseUrl}/audio/transcriptions` (multipart/form-data)
- **Cost:** 0.005₽/sec = 0.30₽/min (cheaper than OpenAI at ~0.55₽/min)
- **Rate limit:** 15 req/sec per API key
- **File size limit:** 25MB (inherited from OpenAI-compatible spec)
- **Audio formats:** mp3, mp4, mpeg, mpga, m4a, wav, webm
- **Response format:** `verbose_json` with segment-level timestamps (start, end, text)
- **Data residency:** RU (152-ФЗ compliant)

### Limitation
`verbose_json` support with `timestamp_granularities` is unconfirmed for Cloud.ru. Implementation must handle fallback to segment-level timestamps if word-level is unavailable.

## 2. OpenAI Whisper API (Global Strategy)

- **Model:** `whisper-1`
- **Endpoint:** `POST https://api.openai.com/v1/audio/transcriptions`
- **Cost:** $0.006/min ≈ 0.55₽/min
- **File size limit:** 25MB hard limit
- **Audio formats:** mp3, mp4, mpeg, mpga, m4a, wav, webm
- **Response formats:** json, text, srt, verbose_json, vtt
- **verbose_json structure:**
  - `segments[]`: `{ id, start, end, text, avg_logprob, no_speech_prob }`
  - `words[]`: available with `timestamp_granularities=["word"]` (adds latency)
- **Key constraint:** `timestamp_granularities` only works with `response_format="verbose_json"`

## 3. FFmpeg Audio Extraction

### Optimal Command
```bash
ffmpeg -i input.mp4 -vn -ac 1 -ar 16000 -acodec pcm_s16le output.wav
```

| Flag | Purpose |
|------|---------|
| `-vn` | Strip video stream |
| `-ac 1` | Downmix to mono (Whisper's internal format) |
| `-ar 16000` | 16kHz sample rate (Whisper's native — higher rates add no quality) |
| `-acodec pcm_s16le` | Uncompressed WAV (no compression artifacts) |

### File Size Calculation
- 16kHz mono 16-bit WAV = ~1.92 MB/min
- 25MB limit ≈ 13 minutes of audio per chunk
- **Strategy:** Split into 10-minute chunks for files >13 min

### Duration Probe
```bash
ffprobe -v quiet -print_format json -show_format input.mp4
```
Returns `format.duration` as string (seconds with decimal).

## 4. Whisper Accuracy for Russian

| Benchmark | WER |
|-----------|-----|
| Common Voice 17.0 (clean read speech) | 9.84% |
| Fine-tuned whisper-large-v3-russian | 6.39% |
| Real-world webinar (single speaker, decent mic) | 15-25% est. |
| Poor audio / multiple speakers | 30-50%+ |

### Practical Implications for КлипМейкер
- **Target accuracy ≥95%** is achievable for clean single-speaker webinars (WER <5% after post-processing)
- **Post-processing essential:** LLM-based punctuation restoration, filler word removal
- **Subtitle editing UI** compensates for remaining errors — users fix critical mistakes inline
- **Confidence score** from `avg_logprob` helps flag low-confidence segments for user review

## 5. Chunking Strategy for Long Videos

The 25MB file size limit requires chunking for videos >13 minutes.

### Approach: FFmpeg Segment Splitter
```bash
ffmpeg -i input.wav -f segment -segment_time 600 -c copy chunk_%03d.wav
```

### Reassembly
- Each chunk returns segments with timestamps relative to chunk start
- Add chunk offset (chunk_index × 600 seconds) to each segment's start/end
- Merge last segment of chunk N with first segment of chunk N+1 if they're within 0.5s

### Concurrency
- Process up to 3 chunks in parallel (Cloud.ru rate limit: 15 req/sec allows this)
- Total time for 2h video: ~6 chunks × 15s/chunk ÷ 3 parallel ≈ 30s (vs 90s sequential)

## 6. Token Count Estimation

For LLM Router routing decisions, we need `tokenCount` on the transcript.

- **T-Pro tokenizer:** ~2.38 tokens/word for Russian
- **Standard tokenizer:** ~3.12 tokens/word for Russian
- **Quick estimate:** `Math.ceil(fullText.split(/\s+/).length * 2.5)` (conservative)
- **Accurate:** Use `tiktoken` library with `cl100k_base` encoding (GPT-4 compatible)

Decision: Use word-count heuristic for MVP (sufficient for tier routing), add tiktoken later if needed.
