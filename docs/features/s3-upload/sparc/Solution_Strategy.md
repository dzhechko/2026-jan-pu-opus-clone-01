# Solution Strategy: S3 Upload

## First Principles Decomposition

### Fundamental Truths
1. Video files are 100MB–4GB — too large to proxy through API server
2. Browser can upload directly to S3 via presigned URLs (no server bottleneck)
3. Cloud.ru S3 is AWS SDK-compatible — use standard tooling
4. Server must control access (presigned URLs have time + size limits)
5. Workers need S3 access to read source videos and write rendered clips
6. All data stays in Russia (Cloud.ru) — 152-ФЗ compliance built-in

### Core Problem
**How to move large video files from user's browser to S3 storage with progress tracking, validation, and pipeline integration — without routing through the API server?**

## Solution: Presigned URL Upload Pattern

```
Browser                    API Server              Cloud.ru S3
  │                           │                        │
  ├──1. createFromUpload()──→│                        │
  │                           ├──2. Create Video DB──→│
  │                           ├──3. Generate presigned URL─→│
  │←──4. { uploadUrl, videoId }│                        │
  │                           │                        │
  ├──5. PUT file directly ──────────────────────────→│
  │    (with progress bar)    │                        │
  │                           │                        │
  ├──6. confirmUpload()─────→│                        │
  │                           ├──7. HeadObject (verify)──→│
  │                           ├──8. Magic bytes check ──→│
  │                           ├──9. Update video.status──→│
  │                           ├──10. Enqueue STT job ──→│
  │←──11. { status: 'transcribing' }                   │
```

## TRIZ Analysis

### Contradiction: Large files need server validation, but shouldn't pass through server
**Resolution (Principle: Taking Out):** Separate upload path from validation path. Upload goes direct to S3; validation reads first 16 bytes via S3 Range GET after upload.

### Contradiction: Progress tracking needs connection, but presigned upload is stateless
**Resolution (Principle: Feedback):** Use XMLHttpRequest `upload.onprogress` for single uploads. For multipart: track per-part completion via API callbacks.

## Design Decisions

### 1. Hybrid Upload Strategy
- **≤100MB:** Single presigned PUT URL — simple, one request
- **>100MB:** Server-initiated multipart upload — parallel parts, resumable
- **Rationale:** 90%+ of webinar recordings are >100MB, so multipart is the primary path. Small file path exists for demos/testing.

### 2. Package Architecture
- **`packages/s3`** — shared S3 client, used by both `apps/web` (API routes) and `apps/worker`
- **Rationale:** Single client configuration, consistent bucket/path conventions, reusable across monorepo

### 3. Upload Completion as Explicit Step
- User uploads directly to S3, then calls `confirmUpload` tRPC mutation
- Server verifies file exists (HeadObject), checks magic bytes (GetObject Range), updates DB, enqueues pipeline
- **Rationale:** Decouples upload from processing; handles browser crashes gracefully

### 4. File Path Convention
- `videos/{userId}/{videoId}/source.{ext}` — predictable, no collisions
- Extension extracted from original filename
- **Rationale:** Easy cleanup per user/video, workers can construct paths from IDs

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Cloud.ru S3 API differences | High | Test all operations against real endpoint; use `forcePathStyle: true` |
| Large file upload failure | Medium | Multipart with resume; 24h expiry for presigned URLs |
| CORS misconfiguration | Medium | Test in dev with localhost origin; document CORS setup |
| Presigned URL abuse | Low | Short expiry (1h upload, 1h download), Content-Length limit in presigned URL |
| S3 credentials leak | High | Server-side only env vars, never expose to client |
