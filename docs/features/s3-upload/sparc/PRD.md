# PRD: S3 Object Storage + Video Upload

## Executive Summary

Integrate Cloud.ru S3-compatible Object Storage into КлипМейкер to enable direct browser-to-S3 video upload via presigned URLs, structured file management for videos/clips/thumbnails, and presigned download URLs. This is the foundational infrastructure that unblocks the entire video processing pipeline.

## Problem Statement

Currently, the video upload flow creates a database record but returns an empty `uploadUrl`. Files cannot be stored, workers cannot read source videos, rendered clips have nowhere to be saved, and users cannot download results. The product is non-functional without object storage.

## Target Users

- Online course authors uploading webinar recordings (100MB–4GB, MP4/WebM)
- КлипМейкер workers (STT, Video Render) reading/writing files from S3

## Core Value Proposition

Browser-direct presigned upload eliminates API server as bottleneck for large files, enables the full video processing pipeline, and keeps all data on Russian infrastructure (152-ФЗ compliance via Cloud.ru).

## Key Features (MVP)

1. **S3 Client Package** (`packages/s3`) — shared AWS SDK v3 client configured for Cloud.ru
2. **Presigned Upload URLs** — tRPC endpoint returns presigned PUT URL, browser uploads directly
3. **Multipart Upload** — for files >100MB, with progress tracking
4. **Presigned Download URLs** — for video/clip downloads with 1-hour expiry
5. **Upload Completion Flow** — confirm upload, trigger video processing pipeline
6. **File Validation** — magic bytes check on upload completion (not just MIME type)
7. **Upload Progress UI** — progress bar, speed, ETA in VideoUploader component

## Technical Context

- **Platform:** Cloud.ru S3 (endpoint `s3.cloud.ru`, region `ru-central-1`)
- **Auth:** AWS SigV4, access key format `<tenant_id>:<key_id>`
- **SDK:** `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
- **Max file size:** 4GB (nginx + client-side validation)
- **Integration:** tRPC routers, BullMQ workers, FFmpeg subprocess

## Success Criteria

- Upload 4GB video file to Cloud.ru S3 via presigned URL with progress bar
- Workers can read video files from S3 and write rendered clips back
- Download clips via presigned URLs
- All operations work with Cloud.ru endpoint (not AWS)
- TypeScript compiles with 0 errors
- Upload rate limit: 10 uploads/hour per user

## Out of Scope (this feature)

- CDN integration (future optimization)
- Lifecycle policies (free tier 3-day retention — separate feature)
- Thumbnail generation (part of video processing pipeline feature)
- URL-based video import (download worker — separate feature)

## Dependencies

- Cloud.ru account with S3 credentials (env vars)
- Existing: Prisma schema (Video model), tRPC video router, VideoUploader component
