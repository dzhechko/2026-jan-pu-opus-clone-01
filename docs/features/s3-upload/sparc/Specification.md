# Specification: S3 Upload

## User Stories

### US-S3-01: Upload Video via Presigned URL
**As a** course author,
**I want to** upload a video file directly from my browser to cloud storage,
**So that** the file is securely stored without passing through the API server.

**Acceptance Criteria:**
- [ ] Browser uploads file directly to Cloud.ru S3 via presigned PUT URL
- [ ] Files ≤100MB use single PUT request
- [ ] Files >100MB use multipart upload with parallel parts
- [ ] Upload progress bar shows percentage, speed (MB/s), and ETA
- [ ] Upload can be cancelled mid-flight
- [ ] Maximum file size: 4GB (validated client-side and via presigned URL constraint)
- [ ] Supported formats: MP4, WebM, MOV, AVI (validated by magic bytes)
- [ ] Rate limit: 10 uploads per hour per user

### US-S3-02: Confirm Upload and Start Processing
**As a** course author,
**I want to** see my uploaded video start processing automatically,
**So that** I don't have to manually trigger each step.

**Acceptance Criteria:**
- [ ] After upload completes, client calls `confirmUpload` mutation
- [ ] Server verifies file exists in S3 via HeadObject
- [ ] Server validates file format via magic bytes (first 16 bytes via Range GET)
- [ ] Server extracts file size from HeadObject `Content-Length`
- [ ] Video status transitions: `uploading` → `transcribing`
- [ ] STT job is enqueued in BullMQ after successful validation
- [ ] Invalid files are rejected with descriptive error message

### US-S3-03: Download Rendered Clips
**As a** course author,
**I want to** download my rendered clips,
**So that** I can use them on platforms not yet integrated.

**Acceptance Criteria:**
- [ ] Download endpoint returns presigned GET URL (1-hour expiry)
- [ ] Only clip owner can generate download URL
- [ ] Clip must be in `ready` status to download
- [ ] Returns presigned GET URL as JSON `{ downloadUrl }` (client handles via `window.location.href`)

### US-S3-04: S3 Client Package
**As a** developer,
**I want to** a shared S3 client package in the monorepo,
**So that** both web API and workers use consistent S3 configuration.

**Acceptance Criteria:**
- [ ] `packages/s3` exports configured S3Client for Cloud.ru
- [ ] Exports helper functions: `generateUploadUrl`, `generateDownloadUrl`, `getObjectHead`, `getObjectBytes`, `putObject`, `deleteObject`
- [ ] Exports path builders: `videoSourcePath`, `clipPath`, `thumbnailPath`
- [ ] Configuration via env vars: `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `S3_REGION`
- [ ] Works in both Next.js API routes (Edge/Node runtime) and standalone Node.js workers (BullMQ)

## Feature Matrix

| Feature | MVP | v1.1 | v2 |
|---------|-----|------|-----|
| Presigned single upload | Yes | | |
| Presigned multipart upload | Yes | | |
| Upload progress bar | Yes | | |
| Magic bytes validation | Yes | | |
| Presigned download URLs | Yes | | |
| S3 client package | Yes | | |
| Upload completion + STT trigger | Yes | | |
| Lifecycle policies (auto-delete) | | Yes | |
| CDN for clip downloads | | Yes | |
| Resumable uploads (page refresh) | | | Yes |

## Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Upload speed | Limited only by user's bandwidth (direct-to-S3) |
| Presigned URL expiry (upload) | 1 hour |
| Presigned URL expiry (download) | 1 hour |
| Max concurrent uploads per user | 3 |
| S3 client initialization | <100ms |
| Magic bytes validation | <500ms |
| File path deterministic | From userId + videoId + extension |
