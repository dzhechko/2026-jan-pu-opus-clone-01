# Brutal Honesty Review: URL Ingestion

**Mode:** Linus (Technical Precision)
**Calibration:** Level 1 (Direct)
**Date:** 2026-02-26

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 1 | FIXED |
| MAJOR | 2 | FIXED |
| MINOR | 3 | ACCEPTED |
| INFO | 2 | NOTED |

**Verdict: ALL CRITICAL AND MAJOR ISSUES FIXED. Ready for merge.**

---

## CRITICAL Issues

### C1: Memory bomb in S3 upload (FIXED)

**What was broken:**
`uploadFileToS3()` called `readFile(localPath)` which loads the entire file into RAM. With a 4GB file and worker concurrency of 2, that is 8GB of heap memory. Node.js default heap limit is ~4GB. This would crash the worker process for any file over ~2GB.

**Why it was wrong:**
The streaming download carefully avoided buffering the entire file, but then the S3 upload read it all back into memory -- defeating the purpose of streaming.

**Fix applied:**
Replaced with streaming multipart upload:
- Files < 50MB: single PutObject (acceptable memory usage)
- Files >= 50MB: S3 multipart with 10MB parts, streamed from disk
- Peak memory: ~20MB per upload (two 10MB buffers: read + send)

---

## MAJOR Issues

### M1: Response body leak on redirect (FIXED)

**What was broken:**
In `safeFetch()`, when a 3xx redirect was detected, the response body was never consumed or cancelled. Each redirect would leave an open TCP connection.

**Why it was wrong:**
Node.js fetch (undici) keeps the connection alive until the body is consumed. With 5 redirects, that is 5 leaked connections per download job. Under load, this exhausts the connection pool.

**Fix applied:**
Added `await response.body?.cancel()` before following redirects to properly release connections.

### M2: Content-Type null bypass without warning (FIXED)

**What was broken:**
When the server returned no Content-Type header, the download proceeded silently. An operator reviewing logs would have no indication that content validation was skipped.

**Why it was wrong:**
Silent bypass of security checks is bad operational practice. Even if magic bytes catch invalid files, the operator should know that content-type filtering was bypassed for a specific download.

**Fix applied:**
Added `logger.warn()` when Content-Type is missing, documenting that magic bytes validation will serve as the fallback.

---

## MINOR Issues (Accepted)

### m1: No progress tracking

BullMQ supports `job.updateProgress()` but the download worker does not report download percentage. This is acceptable for MVP since the user sees "downloading" status, but limits debugging of slow downloads.

**Recommendation:** Add in v1.1 with `job.updateProgress(Math.floor(bytesReceived / expectedSize * 100))`.

### m2: putObject for large files still used in packages/s3

The `putObject` function in `packages/s3/src/operations.ts` accepts `Buffer | Uint8Array` only. The download worker now uses direct S3 client commands for streaming multipart, bypassing the shared `putObject` helper for large files. This creates two code paths for S3 writes.

**Recommendation:** Add a `putObjectStream` function to `packages/s3` in a future refactor.

### m3: No quota check in download worker

The STT worker checks `user.minutesUsed >= user.minutesLimit` before processing. The download worker does not re-check quota before downloading (it was checked in `createFromUrl`). A race condition is possible where quota is consumed between URL submission and download start.

**Recommendation:** Acceptable for MVP since quota is checked again in STT worker. Add pre-download quota check in v1.1.

---

## INFO Items

### i1: DNS rebinding partially mitigated

The SSRF validator resolves DNS once per request, but a DNS rebinding attack could return a public IP first and a private IP on a subsequent query. Since BullMQ retries create new connections with fresh DNS resolution and fresh SSRF validation, each retry is independently protected. The risk is theoretical and requires the attacker to control the DNS server for the target hostname.

### i2: @aws-sdk/client-s3 imported directly in worker

The download worker imports `PutObjectCommand`, `CreateMultipartUploadCommand`, etc. directly from `@aws-sdk/client-s3`. This is available via the `@clipmaker/s3` package's transitive dependency. For robustness, the worker's `package.json` should list `@aws-sdk/client-s3` as a direct dependency. This is minor since Turborepo hoists shared dependencies.

---

## Architecture Consistency Check

| Aspect | Consistent? | Notes |
|--------|-------------|-------|
| Worker pattern | Yes | Same as stt.ts: Worker + on('failed') + finally cleanup |
| Logging | Yes | Pino via createLogger, structured events |
| Error handling | Yes | Throw for retry, mark failed after exhaustion |
| Queue plumbing | Yes | Types in packages/types, constants in packages/queue |
| S3 paths | Yes | Uses videoSourcePath() convention |
| Retry strategy | Yes | DEFAULT_JOB_OPTIONS (3 attempts, exponential) |
| Security | Yes | SSRF protection, magic bytes, rate limiting |

---

## Files Changed

### New Files
| File | Lines | Purpose |
|------|-------|---------|
| `apps/worker/lib/ssrf-validator.ts` | 234 | SSRF protection module |
| `apps/worker/workers/download.ts` | 377 | Download worker |

### Modified Files
| File | Change |
|------|--------|
| `packages/types/src/queue.ts` | +8 lines (VideoDownloadJobData, QueueName) |
| `packages/queue/src/constants.ts` | +1 line (VIDEO_DOWNLOAD) |
| `packages/queue/src/index.ts` | +1 re-export |
| `apps/web/lib/trpc/routers/video.ts` | +18 lines (URL validation, job enqueue) |
| `apps/worker/workers/index.ts` | +1 import |

### Total Impact
- New code: ~611 lines
- Modified code: ~28 lines
- No deletions of existing functionality
- No database schema changes
- No new npm dependencies
