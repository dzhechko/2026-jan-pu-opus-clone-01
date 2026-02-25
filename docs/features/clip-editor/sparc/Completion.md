# Completion: Clip Editor

## 1. Deployment Plan

### Build & Deploy
- Standard Next.js 15 build process — no new build steps required
- Clip editor is a new page route: `apps/web/app/clips/[id]/edit/page.tsx`
- All components are client-side React 19 with `'use client'` directive
- No new services to deploy: reuses existing FFmpeg worker (`apps/worker`) and S3 storage
- No new Docker containers or infrastructure changes
- Deploy via existing CI/CD pipeline: `docker compose build && docker compose up -d`

### Dependencies (all existing)
- FFmpeg worker: already handles clip rendering, re-render jobs use same queue
- S3 storage: clip source videos and rendered outputs already stored there
- PostgreSQL: Clip model already contains all required fields
- Redis/BullMQ: existing `clip-render` queue handles re-render jobs
- tRPC router: new mutation added to existing `clipRouter`

## 2. Feature Flag

### Configuration
```env
# .env (optional — editor is enabled by default)
CLIP_EDITOR_ENABLED=true
```

### Implementation
- Feature flag is optional; the editor can launch without it
- If flag is `false`, the "Edit" button on clip cards is hidden and the `/clips/[id]/edit` route returns 404
- Flag checked at two levels:
  1. **UI level:** `ClipCard` component conditionally renders the edit button
  2. **Route level:** `page.tsx` reads env var via server component and redirects if disabled
- No flag needed for the tRPC mutation — it is safe to expose regardless (requires auth + clip ownership)
- Flag can be removed entirely once the feature is stable (target: 2 weeks post-launch)

## 3. Monitoring

### Key Metrics

| Metric | Source | Alert Threshold |
|--------|--------|----------------|
| Render queue length | BullMQ `clip-render` queue size | > 50 jobs (warning), > 200 jobs (critical) |
| Clip save latency | tRPC `clip.updateFull` mutation duration | p95 > 500ms |
| Render failure rate | BullMQ failed job count / total | > 5% over 1 hour |
| Editor page load time | Next.js server timing | p95 > 3s |
| Client-side errors | `window.onerror` + error boundary | > 10 errors/hour per user |

### Dashboard
- Add clip editor metrics to existing Grafana dashboard (or application monitoring)
- BullMQ dashboard (`/admin/queues`) already shows queue health
- No new monitoring infrastructure needed

### Health Checks
- Existing health check endpoint (`/api/health`) already covers PostgreSQL, Redis, S3
- FFmpeg worker health is monitored via BullMQ worker heartbeat (existing)

## 4. Logging

### Structured Logs for `clip.updateFull`

Every call to the `clip.updateFull` tRPC mutation logs a structured entry:

```json
{
  "level": "info",
  "msg": "clip.updateFull",
  "userId": "usr_abc123",
  "clipId": "clip_xyz789",
  "changedFields": ["subtitles", "trimStart", "trimEnd"],
  "reRenderQueued": true,
  "duration": 45,
  "timestamp": "2026-02-25T12:00:00.000Z"
}
```

### Log Fields

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | Authenticated user ID from JWT |
| `clipId` | string | Clip being edited |
| `changedFields` | string[] | Which fields were modified (for debugging and analytics) |
| `reRenderQueued` | boolean | Whether a re-render job was enqueued (true if trim/format changed) |
| `duration` | number | Mutation execution time in milliseconds |

### Additional Log Points
- `clip.edit.pageLoad` — when a user opens the editor (clipId, userId)
- `clip.edit.renderComplete` — when FFmpeg re-render finishes (clipId, renderTime, outputSize)
- `clip.edit.renderFailed` — when FFmpeg re-render fails (clipId, error, attempt)
- Logger: Pino (consistent with existing worker logging)

## 5. Rollback Plan

### Safety Assessment: LOW RISK
- **No database schema changes** — the Clip model already has all required fields (`trimStart`, `trimEnd`, `subtitles`, `format`, `ctaText`, `ctaUrl`)
- **No data migrations** — existing clips are fully compatible
- **No API breaking changes** — new mutation added, no existing mutations modified
- **No infrastructure changes** — same Docker Compose configuration

### Rollback Steps
1. Revert the deployment to previous container image: `docker compose up -d --force-recreate`
2. The `/clips/[id]/edit` route disappears — users see 404 if they have bookmarked the URL
3. Existing clips are unaffected — no data was modified by the editor feature code itself
4. Any in-flight re-render jobs complete normally (FFmpeg worker is unchanged)
5. The "Edit" button disappears from clip cards

### Rollback Time
- Estimated: under 2 minutes (single container restart)
- No database rollback needed
- No cache invalidation needed

## 6. Migration

### Database Migration: NONE REQUIRED

All fields used by the clip editor already exist in the Prisma schema:

| Field | Type | Status |
|-------|------|--------|
| `trimStart` | Float | Exists |
| `trimEnd` | Float | Exists |
| `subtitles` | Json | Exists |
| `format` | String | Exists |
| `ctaText` | String? | Exists |
| `ctaUrl` | String? | Exists |
| `status` | Enum | Exists |
| `renderJobId` | String? | Exists |

No `npx prisma migrate dev` needed. No schema changes. The editor reads and writes to existing columns using the existing Prisma client.
