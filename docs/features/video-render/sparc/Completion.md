# Completion: Video Render

## Deployment Checklist

### Prerequisites

- [ ] FFmpeg 7 installed in worker Docker image (`ffmpeg -version` returns 7.x)
- [ ] ffprobe available in worker Docker image (`ffprobe -version`)
- [ ] S3 bucket `clipmaker-storage` exists with write access for `clips/` prefix
- [ ] S3 credentials configured (same as s3-upload feature)
- [ ] Redis 7 running and accessible from worker container
- [ ] PostgreSQL 16 running with Clip model migrated
- [ ] Worker container has at least 4 CPU cores and 4GB RAM (for 3 concurrent renders)
- [ ] `/tmp` on worker container has at least 20GB free space (SSD preferred)
- [ ] Docker container memory limit set to 6GB+ (`--memory=6g`)

### Deployment Sequence

1. Build updated worker Docker image with FFmpeg 7 and new render code
2. Run `prisma migrate dev` if schema changes needed (check for `thumbnailPath` column)
3. Verify env vars set in `.env` and Docker Compose
4. Deploy updated worker container
5. Verify worker registers `video-render` queue handler (check startup logs)
6. Test render with a small clip (15s, portrait, subtitles + watermark)
7. Test render with all 3 formats
8. Test concurrent renders (3 clips simultaneously)
9. Monitor `/tmp` disk usage during test renders
10. Verify S3 upload of rendered clips and thumbnails

### Docker Image Requirements

```dockerfile
# Worker Dockerfile additions for video-render
FROM node:20-slim

# FFmpeg 7 (from official static builds or distro repo)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Verify FFmpeg version
RUN ffmpeg -version | head -1
# Expected: ffmpeg version 7.x
```

## Environment Variables

### New Variables

```bash
# Render-specific settings (add to .env)
RENDER_CONCURRENCY=3                  # Max concurrent FFmpeg processes
RENDER_TIMEOUT_MS=300000              # 5 min FFmpeg timeout
RENDER_TMP_DIR=/tmp                   # Temp directory for renders
RENDER_MIN_FREE_DISK_MB=2048          # Min free disk space (2GB) before accepting jobs
RENDER_MAX_OUTPUT_SIZE_MB=500         # Max rendered file size sanity check
```

### Existing Variables (already configured)

| Variable | Used By | Purpose |
|----------|---------|---------|
| `S3_ENDPOINT` | S3 upload of rendered clips | Upload to Yandex Object Storage |
| `S3_REGION` | S3 client | Region configuration |
| `S3_ACCESS_KEY_ID` | S3 client | Authentication |
| `S3_SECRET_ACCESS_KEY` | S3 client | Authentication |
| `S3_BUCKET_NAME` | S3 client | Target bucket |
| `REDIS_URL` | BullMQ connection | Queue for render jobs |
| `DATABASE_URL` | Prisma client | Clip status updates |

## Docker Compose Updates

```yaml
# docker-compose.yml — worker-video service
worker-video:
  build:
    context: .
    dockerfile: apps/worker/Dockerfile
  command: node apps/worker/workers/video-render.js
  environment:
    - DATABASE_URL
    - REDIS_URL
    - S3_ENDPOINT
    - S3_REGION
    - S3_ACCESS_KEY_ID
    - S3_SECRET_ACCESS_KEY
    - S3_BUCKET_NAME
    - RENDER_CONCURRENCY=3
    - RENDER_TIMEOUT_MS=300000
    - RENDER_TMP_DIR=/tmp
    - RENDER_MIN_FREE_DISK_MB=2048
    - RENDER_MAX_OUTPUT_SIZE_MB=500
  volumes:
    - render-tmp:/tmp   # Named volume for render temp files (SSD-backed)
  deploy:
    resources:
      limits:
        cpus: '4'
        memory: 6G
      reservations:
        cpus: '2'
        memory: 2G
  restart: unless-stopped
  depends_on:
    - redis
    - postgres

volumes:
  render-tmp:
    driver: local
```

## Monitoring & Alerting

### Key Metrics

| Metric | Source | Alert Threshold | Severity |
|--------|--------|-----------------|----------|
| Render success rate | Worker logs (`render_complete` / total) | < 99% over 1 hour | Critical |
| Render duration (p95) | Worker logs (`render_complete`, durationMs) | > 120s for 60s clip | Warning |
| Render duration (p99) | Worker logs (`render_complete`, durationMs) | > 180s for 60s clip | Critical |
| FFmpeg timeout rate | Worker logs (`render_timeout`) | > 1% of jobs | Critical |
| Queue depth (waiting) | BullMQ `video-render` queue `getWaitingCount()` | > 50 jobs | Warning |
| Queue depth (waiting) | BullMQ `video-render` queue `getWaitingCount()` | > 200 jobs | Critical |
| Active renders | BullMQ `video-render` queue `getActiveCount()` | Stuck at max for > 10 min | Warning |
| Failed jobs (no retry left) | BullMQ `video-render` queue `getFailedCount()` | > 10 per hour | Critical |
| Disk space `/tmp` | System metrics (`df /tmp`) | > 80% used | Warning |
| Disk space `/tmp` | System metrics (`df /tmp`) | > 95% used | Critical |
| S3 upload failures | Worker logs (`upload_failed`) | > 3 per hour | Warning |
| Worker memory usage | Docker stats / `process.memoryUsage()` | > 80% of container limit | Warning |

### Log Events

| Event | Level | Fields | Description |
|-------|-------|--------|-------------|
| `render_start` | info | clipId, videoId, format, duration, hasSubtitles, hasCta, hasWatermark | Job processing started |
| `render_source_download` | info | videoId, s3Key, fileSizeMb, durationMs | Source file downloaded from S3 |
| `render_source_cached` | info | videoId, localPath | Source file reused from cache |
| `render_source_missing` | error | videoId, s3Key | Source file not found in S3 |
| `render_ass_generated` | debug | clipId, segmentCount, filePath | ASS subtitle file written |
| `render_ffmpeg_start` | info | clipId, filterChain, outputPath | FFmpeg process spawned |
| `render_ffmpeg_progress` | debug | clipId, timeSeconds, percent | FFmpeg progress parsed from stderr |
| `render_complete` | info | clipId, outputSizeMb, durationMs, format | Render finished successfully |
| `render_timeout` | error | clipId, timeoutMs | FFmpeg killed after timeout |
| `render_error` | error | clipId, error, stderr (last 500 chars) | FFmpeg exited with non-zero code |
| `render_upload_start` | info | clipId, s3Key, fileSizeMb | S3 upload initiated |
| `render_upload_complete` | info | clipId, s3Key, durationMs | S3 upload successful |
| `render_upload_failed` | error | clipId, s3Key, error, attempt | S3 upload failed |
| `render_thumbnail_complete` | info | clipId, thumbnailKey | Thumbnail extracted and uploaded |
| `render_cleanup` | debug | clipId, filesDeleted | Temp files removed |
| `render_disk_space_low` | warn | freeMb, requiredMb | Insufficient disk space, job delayed |
| `render_cta_duration_clamped` | warn | clipId, originalDuration, clampedDuration | CTA duration exceeded 50% of clip |
| `render_job_failed` | error | jobId, clipId, error, attempt, maxAttempts | BullMQ job failed event |

### Dashboard Panels (Grafana/equivalent)

1. **Render Pipeline Overview**: Success/fail rate over time (line chart)
2. **Render Duration Distribution**: Histogram by format (portrait/square/landscape)
3. **Queue Health**: Waiting/active/failed counts (gauge + time series)
4. **Disk Usage**: `/tmp` free space over time (line chart with threshold lines)
5. **S3 Upload Latency**: p50/p95/p99 upload duration (line chart)
6. **Error Breakdown**: Top error reasons pie chart (timeout, source_missing, upload_failed, etc.)

## Rollback Plan

### Scenario 1: Renders produce corrupted output

1. Pause the `video-render` queue: `await queue.pause()`
2. Identify affected clips: query `clips WHERE status = 'ready' AND updated_at > {deploy_time}`
3. Verify corruption: run ffprobe on S3 files for affected clips
4. If confirmed: revert worker Docker image to previous version
5. Reset affected clips to `pending` status: `UPDATE clips SET status = 'pending', file_path = NULL WHERE id IN (...)`
6. Resume queue — clips will re-render with previous code

### Scenario 2: Performance degradation (renders too slow)

1. Check CPU usage on worker container (`docker stats`)
2. If CPU saturated: reduce `RENDER_CONCURRENCY` to 2 or 1
3. If still slow: check if `-preset fast` was accidentally changed
4. Fallback: revert to previous image, adjust concurrency

### Scenario 3: Disk space filling up

1. Immediate: clear `/tmp/clip-*.mp4` and `/tmp/source-*.mp4` files older than 1 hour
2. Check for orphaned temp files (renders that failed without cleanup)
3. Reduce `RENDER_CONCURRENCY` to 1 to limit concurrent temp file usage
4. Long-term: increase volume size or add cleanup cron

### Scenario 4: S3 upload failures spike

1. Check S3 credentials validity and bucket accessibility
2. Check network connectivity from worker to S3 endpoint
3. If S3 is down: pause queue, rendered files remain in `/tmp`
4. When S3 recovers: resume queue, BullMQ retries will re-upload
5. For clips that exhausted retries: reset status to `pending` for re-render

### Scenario 5: Complete rollback needed

1. `docker-compose stop worker-video`
2. `docker-compose up -d worker-video` with previous image tag
3. Clips in `rendering` status during rollback: will be picked up again after restart (BullMQ stalled job recovery)
4. No data loss: source videos untouched, only clip outputs affected
5. User impact: clips show "Рендеринг..." until new worker processes them

## Handoff Checklists

### For Development

- [ ] `apps/worker/lib/ffmpeg.ts` — `renderClip()` updated with subtitle, CTA, watermark filter chain
- [ ] `apps/worker/lib/subtitles.ts` — ASS file generation from `SubtitleSegment[]`
- [ ] `apps/worker/lib/cta.ts` — CTA drawtext filter builder with position/duration logic
- [ ] `apps/worker/lib/paths.ts` — S3 key builders for clips and thumbnails
- [ ] `apps/worker/lib/system.ts` — Disk space check utility
- [ ] `apps/worker/workers/video-render.ts` — Full pipeline: download source, render, upload, thumbnail, cleanup
- [ ] S3 download (source) and upload (output + thumbnail) integrated
- [ ] Temp file cleanup in `finally` block (source cache excluded)
- [ ] All 7 unit tests passing
- [ ] All 5 integration tests passing (with test video fixture)
- [ ] All 3 E2E tests passing
- [ ] TypeScript compiles with 0 errors (`npm run typecheck`)
- [ ] ESLint passes (`npm run lint`)

### For QA

- [ ] Test render with portrait format — verify 1080x1920 output
- [ ] Test render with square format — verify 1080x1080 output
- [ ] Test render with landscape format — verify 1920x1080 output
- [ ] Test render with Russian subtitles — verify text is readable and properly wrapped
- [ ] Test render with long subtitle text — verify word wrap works
- [ ] Test render with special characters in subtitles (quotes, backslashes)
- [ ] Test render with CTA 'end' position — verify CTA appears at end of clip
- [ ] Test render with CTA 'overlay' position — verify CTA visible throughout
- [ ] Test render without CTA — verify no CTA artifacts
- [ ] Test render with watermark — verify "КлипМейкер.ру" visible bottom-right
- [ ] Test render without watermark (business plan) — verify no watermark
- [ ] Test very short clip (15s) — verify all overlays present
- [ ] Test very long clip (60s) — verify completes within 120s
- [ ] Test 3 concurrent renders — verify all succeed
- [ ] Verify clip status transitions: pending -> rendering -> ready
- [ ] Verify failed render shows error to user in UI

### For Operations

- [ ] FFmpeg 7 verified in worker Docker image
- [ ] Worker container has 4+ CPU cores and 6GB+ RAM
- [ ] `/tmp` volume has 20GB+ free space on SSD
- [ ] `RENDER_CONCURRENCY` set to 3 (or adjusted based on VPS specs)
- [ ] Monitoring dashboard created with render metrics
- [ ] Alerts configured for render failure rate > 1%
- [ ] Alerts configured for queue depth > 50
- [ ] Alerts configured for disk usage > 80%
- [ ] Log aggregation captures all `render_*` events
- [ ] Cleanup cron for orphaned temp files (older than 2 hours in `/tmp/clip-*` and `/tmp/source-*`)
- [ ] S3 lifecycle policy: no auto-delete on `clips/` prefix (clips are permanent until user deletes)
- [ ] Backup strategy: rendered clips are reproducible from source video + clip metadata (no special backup needed)
