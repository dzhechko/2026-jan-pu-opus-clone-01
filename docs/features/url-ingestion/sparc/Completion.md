# Completion: URL Ingestion

## Deployment Plan

### Pre-deployment Checklist
- [ ] All SPARC docs reviewed and validated (score >= 70)
- [ ] Implementation complete with all unit tests passing
- [ ] SSRF protection tested against all private IP ranges
- [ ] Integration test: URL -> download -> S3 -> STT pipeline
- [ ] Download worker registered in worker index
- [ ] Types exported from packages/types and packages/queue

### Deployment Sequence
1. Deploy packages/types (new VideoDownloadJobData type)
2. Deploy packages/queue (new QUEUE_NAMES.VIDEO_DOWNLOAD)
3. Deploy apps/worker (new download worker)
4. Deploy apps/web (wire createFromUrl TODO)

Since this is a monorepo with Docker Compose, all components deploy together. The sequence above is the logical dependency order.

### Rollback Plan
- If download worker crashes: Remove `import('./download')` from workers/index.ts, redeploy
- If SSRF issue found: Kill download worker, clear video-download queue, mark 'downloading' videos as 'failed'
- Queue jobs are durable in Redis -- no data loss on worker restart

## CI/CD Integration

### Build
No new build steps -- the download worker is compiled alongside existing workers by TypeScript.

### Test
```bash
# Unit tests for SSRF validator and download logic
npm run test -- --filter apps/worker

# Integration test (if test infra available)
npm run test -- --filter url-ingestion
```

### Docker
No Dockerfile changes needed -- the worker process already runs all workers from index.ts.

## Monitoring & Alerting

### Key Metrics
| Metric | Source | Alert Threshold |
|--------|--------|----------------|
| Download job duration | BullMQ job lifecycle | > 30 min |
| Download failure rate | BullMQ failed events | > 50% in 1 hour |
| SSRF blocks | Worker logs (event: 'download_ssrf_blocked') | Informational |
| Temp disk usage | OS monitoring | > 80% of /tmp |

### Log Events
- `download_start` -- job picked up
- `download_ssrf_blocked` -- SSRF check failed
- `download_http_error` -- non-200 response
- `download_content_type_invalid` -- bad content type
- `download_size_exceeded` -- file too large
- `download_magic_bytes_invalid` -- not a valid video
- `download_s3_upload_start` -- uploading to S3
- `download_complete` -- success
- `download_error` -- unhandled error
- `download_job_failed` -- all retries exhausted

## Handoff Checklists

### Developer Handoff
- [x] PRD with clear scope
- [x] Pseudocode for all algorithms
- [x] Architecture consistent with project patterns
- [x] Edge cases documented
- [x] BDD test scenarios defined

### QA Handoff
- [ ] Test SSRF with various private IP URLs
- [ ] Test with large files (>1GB)
- [ ] Test with invalid content types
- [ ] Test with network interruption (kill connection mid-download)
- [ ] Test redirect chains (301 -> 302 -> 200)
- [ ] Verify temp file cleanup after success and failure
