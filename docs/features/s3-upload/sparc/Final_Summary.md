# Final Summary: S3 Upload

## Feature Overview

S3 Object Storage integration for КлипМейкер, enabling browser-direct video upload to Cloud.ru S3 via presigned URLs, server-side file validation, and presigned download URLs for rendered clips.

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Upload pattern | Presigned URLs (browser-direct) | No API server bottleneck for 4GB files |
| Upload threshold | ≤100MB simple, >100MB multipart | Balances simplicity and reliability |
| S3 SDK | AWS SDK v3 for JS | Cloud.ru compatible, official, well-maintained |
| File validation | Magic bytes (not MIME) | Prevents format spoofing |
| Package location | `packages/s3` | Reusable by web + workers |
| Upload confirmation | Explicit `confirmUpload` step | Decouples upload from pipeline; handles crashes |

## Implementation Scope

### New
- `packages/s3/` — S3 client, presigned URLs, multipart, validation, path builders
- `tRPC: video.completeMultipart` — complete multipart upload
- `tRPC: video.confirmUpload` — validate + trigger pipeline
- `tRPC: clip.download` — presigned download URL
- Upload progress bar in VideoUploader

### Modified
- `tRPC: video.createFromUpload` — return real presigned URL instead of empty string
- `VideoUploader` component — execute actual upload with progress
- `docker-compose.yml` — S3 env vars for all services
- `.env.example` — S3 configuration

### Unchanged
- Prisma schema (existing fields sufficient)
- Auth middleware (unchanged)
- BullMQ queue definitions (unchanged)

## Risk Mitigation

| Risk | Mitigation | Status |
|------|-----------|--------|
| Cloud.ru compatibility | `forcePathStyle: true`, test all operations | To verify |
| Large file reliability | Multipart upload with parallel parts | Designed |
| Invalid file uploads | Client + server magic bytes validation | Designed |
| Orphaned S3 objects | Stale upload cleanup (>24h) | Designed |
| Presigned URL abuse | 1h expiry, Content-Length constraint | Designed |

## Dependencies

- Cloud.ru S3 account with credentials
- npm packages: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`
- CORS configuration on S3 bucket

## Estimated Modules

| Module | Complexity |
|--------|-----------|
| `packages/s3` (6 files) | Medium |
| tRPC router updates (3 procedures) | Medium |
| VideoUploader rewrite | Medium-High |
| Tests | Medium |
| Docker/env updates | Low |
