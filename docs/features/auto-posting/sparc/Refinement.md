# Refinement: Auto-Posting

## Edge Cases

### Token Expiration During Publish
- **Scenario:** Token expires between job enqueue and job execution
- **Handling:** On 401 error, attempt token refresh via refresh_token. If refresh fails, mark publication as failed with message "Токен истёк, переподключите платформу". Flag PlatformConnection with `expiresAt = now()`.

### Duplicate Publish Attempts
- **Scenario:** User double-clicks publish, or job retries after partial success
- **Handling:** Check for existing `publishing`/`scheduled` publication for same clip+platform before creating. Worker checks `publication.status === 'published'` before processing (idempotent).

### File Not Found on Disk
- **Scenario:** Clip file deleted from S3 between render and publish
- **Handling:** Worker validates file exists before upload. Fail immediately (no retry) with message "Файл клипа не найден".

### Platform API Downtime
- **Scenario:** VK/Rutube/etc. returns 500 errors
- **Handling:** BullMQ retry (3 attempts, 5min/15min/60min). After 3 failures, mark as failed. User can manually retry later.

### Scheduled Publication Cancelled
- **Scenario:** User disconnects platform after scheduling publication
- **Handling:** On platform disconnect, cancel all `scheduled` publications for that platform. BullMQ job will be removed from delayed queue.

### Large File Upload Timeout
- **Scenario:** 500MB file takes >5 minutes to upload
- **Handling:** Set per-platform timeout: VK 10min, Rutube 15min (resumable), Telegram 5min (50MB limit). Worker uses streaming upload to avoid memory issues.

### VK Clips vs VK Video
- **Scenario:** Some users want regular VK Video, not VK Clips
- **Handling:** MVP always publishes as VK Clips via `is_short=1` parameter in `video.save()`. Future: add option to choose between clip and video.

### Telegram Stats Unavailable
- **Scenario:** User expects views/likes stats for Telegram publications
- **Handling:** Telegram Bot API does not provide post-level stats. UI shows "Статистика недоступна" for Telegram publications. Stats sync cron skips Telegram entirely.

### Per-Platform File Size Limits
- **Scenario:** Clip is too large for a specific platform (e.g. 100MB clip → Telegram 50MB limit)
- **Handling:** Validate file size per-platform BEFORE creating Publication records. Show specific error: "Файл слишком большой для Telegram (максимум 50 МБ)". User can still publish to other platforms with higher limits.

### Rate Limit Hit
- **Scenario:** Multiple users publishing to VK simultaneously
- **Handling:** BullMQ rate limiter configured per-platform. If platform returns 429, extract `retry-after` header and re-delay the job.

### User Disconnects Mid-Upload
- **Scenario:** User navigates away while upload is in progress
- **Handling:** Upload runs in background worker (not browser). User action is only the publish button. Navigation doesn't affect the upload.

## Testing Strategy

### Unit Tests
- Token encryption/decryption round-trip
- Platform provider factory returns correct provider
- OAuth state generation and validation
- Plan-based platform access logic
- Publication status transitions

### Integration Tests (testcontainers: PG + Redis)
- Complete publish flow: mutation → queue → worker → DB update
- OAuth callback: code exchange → PlatformConnection creation
- Stats collection: worker → Publication stats update
- Platform disconnect → pending publications cancelled
- Retry logic: simulated API failure → 3 retries → final failure

### E2E Tests (Playwright)
- Connect VK account (mocked OAuth)
- Publish clip → see status update in UI
- Schedule and cancel publication
- Disconnect platform → confirm dialog

### Platform API Mocks (MSW)
- VK: video.save, upload, video.get
- Rutube: video upload, status, stats
- Telegram: sendVideo, getChat, getMe
- Дзен: OAuth token exchange, upload, publish

## Performance Optimizations

- **Streaming uploads:** Use `fs.createReadStream()` + piping to HTTP request (no full file in memory)
- **Parallel platform publishing:** Each platform is a separate BullMQ job (already parallel)
- **Stats batching:** Collect stats in batches, not per-publication
- **Connection caching:** Cache platform connections in Redis (5min TTL) to avoid DB lookups per job

## Security Hardening

- Rate limit `platform.connect`: 5/hour per user (prevent token harvesting)
- Rate limit `clip.publish`: 20/min per user (already configured)
- Validate OAuth `state` parameter strictly (CSRF protection)
- Never log tokens or partial tokens
- Rotate `PLATFORM_TOKEN_SECRET` via env var (re-encrypt on rotation)
- Validate file path in worker (prevent path traversal)

## Technical Debt

- VK API v5.199 → track deprecation schedule
- Rutube API is undocumented → may break with changes
- Дзен API access requires manual publisher verification
- Telegram Bot API 50MB limit → consider local Bot API server for larger files
- Token refresh logic not standardized across platforms
