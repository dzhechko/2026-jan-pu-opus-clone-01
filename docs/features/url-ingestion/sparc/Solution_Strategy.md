# Solution Strategy: URL Ingestion

## First Principles Analysis

### Fundamental Truths
1. A URL points to a remote file -- we must download it before processing
2. Downloads can fail (network, auth, rate limits) -- we need retry logic
3. URLs can point to internal resources (SSRF) -- we must validate before connecting
4. The file at a URL may not be a valid video -- we must validate after download
5. The existing pipeline starts from an S3 key -- our job is to get the file into S3

### Core Decomposition
The problem reduces to: **URL -> validated local file -> S3 -> trigger existing pipeline**

## 5 Whys: Why is URL ingestion incomplete?

1. Why? The TODO was left in createFromUrl.
2. Why? File upload was the priority for MVP.
3. Why? File upload covers the primary use case.
4. Why? Most users have files locally during initial testing.
5. **Root cause:** URL download requires a background worker with network I/O, SSRF protection, and streaming -- more complex than the synchronous presigned-URL flow.

## SCQA Framework

- **Situation:** createFromUrl exists, creates DB record with `status: 'downloading'`
- **Complication:** No worker picks up the job. Video is stuck forever.
- **Question:** How do we complete the download pipeline securely and reliably?
- **Answer:** Add a `video-download` queue + worker that downloads, validates, uploads to S3, and hands off to STT.

## Solution: Download Worker Architecture

### Key Design Decisions

1. **Streaming download** -- Use Node.js `fetch()` with response body streaming to avoid loading entire file into memory. Write to temp file.

2. **SSRF protection** -- Before making any HTTP request:
   - Parse the URL and resolve DNS
   - Block private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, ::1, fd00::/8)
   - Block cloud metadata endpoints (169.254.169.254)
   - Block non-HTTP(S) schemes
   - Limit redirects (max 5) and re-validate each redirect target

3. **Validation pipeline** (mirrors file upload):
   - Content-Type header check (video/*)
   - Content-Length check (< 4GB)
   - Magic bytes validation after download
   - FFprobe duration check

4. **S3 upload** -- Use putObject for small files, multipart for large files. Reuse `videoSourcePath()` from packages/s3.

5. **Pipeline handoff** -- After successful S3 upload, enqueue STT job with same payload as `confirmUpload`.

### TRIZ: Contradiction Resolution

**Contradiction:** We need to validate file size before downloading (to avoid wasting bandwidth) but Content-Length header may be missing or wrong.

**Resolution (Partial Action principle):** Check Content-Length if present (reject > 4GB immediately), but also track bytes received during streaming and abort if threshold exceeded. This provides both fast-fail and guaranteed protection.

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| SSRF via DNS rebinding | Resolve DNS, validate IP, then connect to resolved IP |
| Slow downloads tie up workers | 30-min timeout, concurrency limit (2 concurrent downloads) |
| Disk space exhaustion | Cleanup temp files in finally block; /tmp is typically on separate partition |
| S3 upload failure after download | Retry S3 upload; on permanent failure, mark video as failed |
| Redirects to internal hosts | Re-validate each redirect target against SSRF rules |
