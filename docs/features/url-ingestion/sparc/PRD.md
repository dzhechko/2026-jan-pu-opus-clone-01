# PRD: URL Ingestion (Video Download from URL)

## Product Context

**Product:** КлипМейкер -- AI SaaS for converting webinars to promo shorts
**Feature:** F01-URL -- Complete the partial URL ingestion flow in Video Upload (F01)
**Priority:** High (MVP gap -- createFromUrl creates DB record but never downloads)

## Problem Statement

The `createFromUrl` tRPC mutation creates a video record with `status: 'downloading'` but has a `// TODO: Add download job to queue`. No BullMQ worker exists to download the video from the provided URL, validate it, upload to S3, and trigger the STT pipeline. Users who paste a URL get a stuck record that never progresses.

## Target Users

- Online course creators (target persona) who have video hosted on external platforms (YouTube, Vimeo, direct links, cloud storage)
- Users who prefer pasting a URL over uploading a file from disk

## Core Value Proposition

Allow users to start the КлипМейкер pipeline from a URL instead of a file upload, reducing friction for users with videos already hosted online.

## Key Features (MVP Scope)

1. **Download Queue** -- BullMQ job type `video-download` enqueued by `createFromUrl`
2. **Download Worker** -- Streams video from HTTP/HTTPS URL to a temp file, validates content type and size
3. **SSRF Protection** -- Block private/internal IPs, localhost, metadata endpoints
4. **S3 Upload** -- Upload downloaded video to S3 using the same path convention as file uploads
5. **Pipeline Handoff** -- After S3 upload, enqueue STT job (identical to `confirmUpload` flow)
6. **Progress Tracking** -- Update video status through: `downloading` -> `transcribing` (or `failed`)

## Out of Scope (v1)

- YouTube/Vimeo API integration (yt-dlp) -- future enhancement
- Resume interrupted downloads
- Parallel chunk downloading
- URL preview/metadata extraction before download

## Success Criteria

- URL submitted via `createFromUrl` results in video being downloaded, uploaded to S3, and STT pipeline started within 10 minutes for a 1GB file
- Failed downloads (invalid URL, timeout, too large) mark video as `failed` with descriptive error
- SSRF attacks (private IPs, metadata endpoints) are blocked before any network request
- Download worker retries up to 3 times with exponential backoff on transient errors

## Technical Constraints

- Max file size: 4GB (consistent with file upload)
- Download timeout: 30 minutes (for large files on slow connections)
- Must validate video format via magic bytes after download (same as file upload)
- Must run on the worker process (apps/worker), not the web process
- Must use existing S3, queue, and Prisma packages
