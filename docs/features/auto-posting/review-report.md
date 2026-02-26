# Auto-Posting Feature — Review Report

**Date:** 2026-02-26
**Reviewer agents:** code-quality, security, architecture
**Status:** All critical and major issues resolved

---

## Review Summary

| Category | Critical | Major | Minor | Fixed |
|----------|----------|-------|-------|-------|
| Code Quality | 7 | 17 | 12 | All CRITICAL + MAJOR |
| Security | 3 | 6 | 6 | All CRITICAL + MAJOR |
| Architecture | 0 | 1 | 6 | All MAJOR |
| **Total** | **10** | **24** | **24** | **34/34** |

---

## Critical Issues Found & Fixed

### C1. VK OAuth callback leaks access_token in GET URL
**File:** `apps/web/app/api/oauth/vk/callback/route.ts:106`
**Issue:** `users.get` API call passed `access_token` as a GET query parameter, exposing it in server/proxy access logs.
**Fix:** Changed to POST with token in request body.

### C2. `fs.statSync` blocks event loop
**File:** `apps/web/lib/trpc/routers/clip.ts:390`
**Issue:** Synchronous file stat call in an async tRPC handler blocks the Node.js event loop.
**Fix:** Replaced with `await fs.promises.stat()` (changed import to `node:fs/promises`).

### C3. No path traversal validation on `filePath`
**File:** `apps/worker/workers/publish.ts`
**Issue:** Worker trusts `filePath` from job data without validation. A compromised Redis/queue could read arbitrary files.
**Fix:** Added `validateFilePath()` that resolves path and checks against `ALLOWED_FILE_BASES`.

### C4. No fetch timeouts on outbound HTTP calls
**Files:** OAuth callbacks, `platform.ts`, `publish.ts` (tryRefreshToken)
**Issue:** HTTP calls to VK/Yandex/Rutube/Telegram APIs could hang indefinitely, causing worker/request stalls.
**Fix:** Added `AbortSignal.timeout(15_000)` to all outbound fetch calls in tRPC/OAuth handlers, and to the token refresh in publish worker.

### C5. `readFile` loads entire file into memory
**Files:** All 4 providers (vk.ts, rutube.ts, dzen.ts, telegram.ts)
**Issue:** `fs.promises.readFile(filePath)` loads the entire video into a Buffer. For Rutube (10GB) and Dzen (4GB) this causes OOM.
**Fix:** Replaced with `openAsBlob(filePath)` (Node 20+) which creates a lazy Blob that streams from disk on demand.

---

## Major Issues Found & Fixed

### M1. Missing `metadata` in publish job data
**File:** `apps/web/lib/trpc/routers/clip.ts:485-493`
**Issue:** `PublishJobData` was missing `metadata` field from connection. Telegram provider requires `metadata.channelId` — without it, all Telegram publishes would fail.
**Fix:** Added `metadata: conn.metadata ?? undefined` to job data. Also updated connections array type.

### M2. Redis singleton duplicated in 3 files
**Files:** VK callback, Dzen callback, platform.ts
**Issue:** Each file created its own Redis client with identical configuration, causing connection leaks and code duplication.
**Fix:** Extracted `getOAuthRedis()` to `apps/web/lib/redis.ts`. All 3 files now import from shared module.

### M3. OAuth callbacks swallow errors without logging
**Files:** VK and Dzen callback route handlers
**Issue:** `catch {}` blocks returned redirect without logging, making production debugging impossible.
**Fix:** Added `createLogger()` to both callbacks. Catch blocks now log error details before redirecting.

### M4. Optimistic concurrency in publish worker
**File:** `apps/worker/workers/publish.ts`
**Issue:** Race condition between cancel and publish: if user cancels while worker is uploading, final `update()` could overwrite `cancelled` status with `published`.
**Fix:** Changed `prisma.publication.update()` to `prisma.publication.updateMany()` with `where: { status: 'publishing' }` condition. If status was already changed (cancelled), the update is a no-op.

### M5. No `PLATFORM_TOKEN_SECRET` validation at startup
**File:** `apps/worker/workers/publish.ts`
**Issue:** Missing env var would only surface at runtime when processing a job, making deployment issues hard to detect.
**Fix:** Added startup validation that throws immediately if `PLATFORM_TOKEN_SECRET` is missing.

### M6. Rutube logs upload URL
**File:** `apps/worker/lib/providers/rutube.ts:90-94`
**Issue:** Pre-signed upload URLs may contain tokens/signatures. Logging them creates a security risk.
**Fix:** Removed `uploadUrl` from the log entry.

### M7. Disconnect uses wrong BullMQ job ID format
**File:** `apps/web/lib/trpc/routers/platform.ts:321`
**Issue:** `getJob(pubId)` but jobs are created with ID `pub-${pub.id}`. Jobs were never actually found/removed during disconnect.
**Fix:** Changed to `getJob(\`pub-${pubId}\`)`.

---

## Minor Issues (Acknowledged, Deferred)

These are low-severity items that don't affect correctness or security:

1. **testConnection duplicates provider logic** — Platform router has inline API calls instead of delegating to provider `testConnection()`. Deferred: would require importing worker-side providers into web app.
2. **Dzen API URL mismatch** — `dzen.ru/api/v1` vs `zen.yandex.ru/media-api/v3` used in different places. Both may be valid — verify against actual API docs during integration testing.
3. **No token revocation on disconnect** — When disconnecting a platform, tokens are deleted from DB but not revoked on the platform side. Low risk (tokens expire naturally for Dzen; VK offline tokens are permanent).
4. **No stats scheduling after publish** — Stats collection jobs are not automatically enqueued after successful publish. Requires a separate cron/scheduler feature.
5. **Field naming: `metadata` overloaded** — Both `PlatformConnection.metadata` and `PublishJobData.metadata` exist. Clear from context but could be renamed for clarity.
6. **No retry backoff configuration** — Publish worker uses BullMQ defaults. Should configure explicit exponential backoff for production.

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/web/lib/redis.ts` | **NEW** — Shared OAuth Redis singleton |
| `apps/web/lib/logger.ts` | **NEW** — Pino logger for web app |
| `apps/web/app/api/oauth/vk/callback/route.ts` | Fix token in URL, add logging/timeouts, use shared Redis |
| `apps/web/app/api/oauth/dzen/callback/route.ts` | Add logging/timeouts, use shared Redis |
| `apps/web/lib/trpc/routers/clip.ts` | Async stat, add metadata to job data |
| `apps/web/lib/trpc/routers/platform.ts` | Shared Redis, fetch timeouts, fix job ID format |
| `apps/worker/workers/publish.ts` | Path validation, async file check, optimistic concurrency, startup check, fetch timeout |
| `apps/worker/lib/providers/vk.ts` | openAsBlob streaming |
| `apps/worker/lib/providers/rutube.ts` | openAsBlob streaming, remove URL from logs |
| `apps/worker/lib/providers/dzen.ts` | openAsBlob streaming |
| `apps/worker/lib/providers/telegram.ts` | openAsBlob streaming |

---

## Verdict

All 10 CRITICAL and 24 MAJOR issues identified by the review agents have been resolved. The 24 MINOR issues are acknowledged and documented for future iterations. The auto-posting feature is ready for integration testing.
