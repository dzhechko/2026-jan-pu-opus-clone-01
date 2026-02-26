# Completion: Auto-Posting

## Deployment Plan

### Pre-deployment Checklist
- [ ] VK App created with `video` + `wall` scopes approved
- [ ] Yandex App created with `zen:write` scope
- [ ] `PLATFORM_TOKEN_SECRET` generated (32-byte random hex)
- [ ] `VK_PUBLISH_CLIENT_ID` / `VK_PUBLISH_CLIENT_SECRET` set
- [ ] `YANDEX_CLIENT_ID` / `YANDEX_CLIENT_SECRET` set
- [ ] OAuth callback URLs registered with VK and Yandex
- [ ] Redis connection available for OAuth state storage
- [ ] Publish worker registered in worker index
- [ ] Database migration applied (Publication.errorMessage field if new)

### Deployment Sequence
1. Apply database migration (if needed)
2. Set environment variables on VPS
3. Deploy worker with updated publish/stats workers
4. Deploy web with new platform router + OAuth callbacks
5. Verify OAuth flows manually (VK, Дзен)
6. Verify token-based flows (Rutube, Telegram)
7. Test publish flow end-to-end

### Rollback Plan
- Feature is additive (new routes, new worker logic)
- Rollback = deploy previous version
- Publications created during deployment will have status `publishing` → will be retried by worker on redeploy
- PlatformConnections are persistent → no data loss

## Environment Variables

```env
# Platform OAuth (publishing)
VK_PUBLISH_CLIENT_ID=
VK_PUBLISH_CLIENT_SECRET=
VK_PUBLISH_REDIRECT_URI=https://app.clipmaker.ru/api/oauth/vk/callback

YANDEX_CLIENT_ID=
YANDEX_CLIENT_SECRET=
YANDEX_REDIRECT_URI=https://app.clipmaker.ru/api/oauth/dzen/callback

# Token encryption
PLATFORM_TOKEN_SECRET=<32-byte-hex>
```

## Monitoring

### Key Metrics
- Publication success rate per platform
- Average publish latency (enqueue → published)
- Token refresh failure rate
- Queue depth for publish queue
- Stats collection success rate

### Alerts
- Publication success rate < 90% → warn
- Publication success rate < 80% → critical
- Queue depth > 100 → warn (backlog)
- Token refresh failures > 5/hour → warn

### Logging Events
- `publish_job_start` — Job picked up by worker
- `publish_job_success` — Published successfully
- `publish_job_failed` — Failed (with error details)
- `publish_job_retry` — Retrying after failure
- `token_refresh_success` — Token refreshed
- `token_refresh_failed` — Refresh failed, connection expired
- `platform_connected` — New platform connection
- `platform_disconnected` — Platform disconnected
- `stats_sync_complete` — Stats collected for publication

## Handoff Checklist

### Dev
- [ ] All 4 platform providers implemented (VK, Rutube, Дзен, Telegram)
- [ ] Token encryption module created (packages/crypto or shared lib)
- [ ] OAuth flows tested with real credentials (VK, Дзен)
- [ ] Token-based flows tested (Rutube, Telegram)
- [ ] Publish worker handles all error cases (401, timeout, file not found)
- [ ] Token refresh logic for Дзен (only platform with refresh_token)
- [ ] Stats collector scheduled and working (skips Telegram)
- [ ] Cancel and retry publication mutations working
- [ ] Disconnect cancels pending publications
- [ ] DB migration: 'cancelled' added to PublicationStatus enum

### QA
- [ ] Connect each platform type
- [ ] Publish to each platform
- [ ] Schedule and cancel publication
- [ ] Verify retry on API failure (mock)
- [ ] Verify stats collection
- [ ] Disconnect platform → publications cancelled
- [ ] Free plan → no publish access
- [ ] Start plan → VK only

### Ops
- [ ] Environment variables configured
- [ ] OAuth apps registered with platforms
- [ ] Monitoring dashboards created
- [ ] Alert rules configured
- [ ] Log aggregation includes worker logs
