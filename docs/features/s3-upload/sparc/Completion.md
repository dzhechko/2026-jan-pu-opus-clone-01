# Completion: S3 Upload

## Deployment Plan

### Prerequisites
1. Cloud.ru S3 bucket created: `clipmaker-storage`
2. S3 access credentials generated (tenant_id:key_id format)
3. CORS configured on bucket (AllowedOrigins: production domain + localhost)
4. Bucket policy: deny public access

### Deployment Sequence
1. Add env vars to `.env` and Docker Compose services
2. Install `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
3. Deploy `packages/s3` package
4. Update tRPC routers (video, clip)
5. Deploy updated frontend (VideoUploader with progress)
6. Verify CORS works from production origin
7. Test upload + download flow end-to-end

### Rollback Plan
- S3 package is additive (new package, no breaking changes)
- tRPC changes are backwards-compatible (new procedures + updated return types)
- UI changes are self-contained in VideoUploader
- Rollback: revert to previous Docker image, uploads return to non-functional state (no data loss)

## Environment Variables

```bash
# .env (add to existing)
S3_ENDPOINT=https://s3.cloud.ru
S3_REGION=ru-central-1
S3_ACCESS_KEY_ID=tenant_id:key_id
S3_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET_NAME=clipmaker-storage
```

## Docker Compose Updates

```yaml
# Add to web, worker-stt, worker-llm, worker-video, worker-publish services:
environment:
  - S3_ENDPOINT
  - S3_REGION
  - S3_ACCESS_KEY_ID
  - S3_SECRET_ACCESS_KEY
  - S3_BUCKET_NAME
```

## Monitoring & Alerting

| Metric | Source | Alert Threshold |
|--------|--------|----------------|
| Upload success rate | Application logs | <95% over 1 hour |
| Upload latency (p95) | Application logs | N/A (depends on file size) |
| S3 error rate | S3 client errors | >5% in 5 minutes |
| Stale uploads count | DB query (uploading > 24h) | >10 (cleanup may be failing) |
| S3 storage usage | Cloud.ru dashboard | >80% of plan quota |

## Logging Strategy

```typescript
// All S3 operations logged with Pino
logger.info({ videoId, key, fileSize, method: 'presignUpload' }, 'Generated presigned upload URL');
logger.info({ videoId, key, method: 'confirmUpload' }, 'Upload confirmed, starting pipeline');
logger.warn({ videoId, key, method: 'confirmUpload', reason: 'invalid_magic_bytes' }, 'Upload rejected');
logger.error({ videoId, key, error, method: 'headObject' }, 'S3 operation failed');
```

## Handoff Checklists

### Dev Checklist
- [ ] `packages/s3` created with all exports
- [ ] tRPC video router updated (createFromUpload, completeMultipart, confirmUpload)
- [ ] tRPC clip router updated (download)
- [ ] VideoUploader component with progress bar
- [ ] Magic bytes validation (client + server)
- [ ] Rate limiting on upload (10/hr)
- [ ] Unit tests for packages/s3
- [ ] Integration tests for upload flow
- [ ] TypeScript compiles with 0 errors

### Ops Checklist
- [ ] S3 bucket created on Cloud.ru
- [ ] CORS configured on bucket
- [ ] Env vars set in deployment
- [ ] Docker Compose updated with S3 env vars
- [ ] Monitoring dashboard for S3 operations
- [ ] Stale upload cleanup cron configured
