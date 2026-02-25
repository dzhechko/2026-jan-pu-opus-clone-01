# STT + Subtitles — Completion

## Environment Variables

No new env vars needed. Existing vars used:

| Variable | Used By | Purpose |
|----------|---------|---------|
| `CLOUDRU_API_KEY` | STT Worker | Cloud.ru Whisper API key |
| `OPENAI_API_KEY` | STT Worker | OpenAI Whisper API key (global strategy) |
| `S3_ENDPOINT` | STT Worker | S3-compatible storage endpoint |
| `S3_ACCESS_KEY` | STT Worker | S3 credentials |
| `S3_SECRET_KEY` | STT Worker | S3 credentials |
| `S3_BUCKET` | STT Worker | S3 bucket name |
| `S3_REGION` | STT Worker | S3 region |
| `DATABASE_URL` | STT Worker, Web | PostgreSQL connection |
| `REDIS_URL` | STT Worker | BullMQ queue connection |

## Dependencies

### New npm packages

| Package | Version | Purpose | Location |
|---------|---------|---------|----------|
| `p-map` | ^7.0.0 | Concurrency-limited Promise.all | apps/worker |

### Existing packages used (no changes)

- `@aws-sdk/client-s3` — S3 GetObject for download
- `openai` — Whisper API client (via LLMRouter)
- `bullmq` — STT queue worker
- `@prisma/client` — DB operations

## Docker Requirements

Worker container must have FFmpeg installed:

```dockerfile
# Already in worker Dockerfile
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
```

Verify: `ffmpeg -version` and `ffprobe -version` must succeed at worker startup.

## Database Migrations

**No schema changes needed.** The Transcript model and all required fields already exist in `packages/db/prisma/schema.prisma`.

## Existing Code Patches Required

- **`apps/web/lib/trpc/routers/video.ts`** (confirmUpload): Remove `userId` from STT job payload (not in STTJobData type), add `language: 'ru'`
- **`apps/worker/lib/llm-router.ts`**: Extract `createSTTClient()` helper from private `getClient()` method

## Deployment Checklist

- [ ] `CLOUDRU_API_KEY` set in production `.env`
- [ ] `OPENAI_API_KEY` set (for global strategy users)
- [ ] FFmpeg/FFprobe installed in worker container
- [ ] Worker has sufficient /tmp space (500MB per concurrent job × 2 concurrency = 1GB)
- [ ] Redis connection stable (BullMQ queue)
- [ ] S3 bucket accessible from worker
- [ ] Worker concurrency set to 2 (default)

## Monitoring

| Metric | Log Event | Alert Threshold |
|--------|-----------|-----------------|
| STT job duration | `stt_complete` (durationMs) | >120s for 60-min video |
| STT error rate | `stt_error` count | >5% of jobs |
| Whisper API latency | Per-chunk transcription time | >30s per 10-min chunk |
| /tmp usage | OS-level | >80% of tmpfs |
| Queue depth | BullMQ metrics | >10 waiting jobs |

## Rollback Plan

1. If STT worker produces bad transcripts: revert worker code, keep existing transcripts
2. If Cloud.ru Whisper is down: switch users to `global` strategy temporarily
3. If /tmp fills up: restart worker containers (tmpfs cleared)
4. No database rollback needed — new Transcript records only, no schema changes
