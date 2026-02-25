# Download Clips — Solution Strategy

## First Principles Decomposition

**Core need:** Get rendered video file from S3 to user's device.

**Fundamental truths:**
1. Files are in S3-compatible storage with presigned URL support
2. Single file: browser can download via URL navigation
3. Multiple files: must be assembled server-side (ZIP)
4. Users need clear indication of what they're downloading (watermark status)

## Problem Analysis (5 Whys)

1. Why can't users download? → No UI button exists
2. Why no button? → Feature wasn't implemented yet (backend first approach)
3. Why batch? → Users generate 3-10 clips per video, want all at once
4. Why watermark indicator? → Free users should know before downloading
5. Why not just link? → Need proper Content-Disposition for mobile/browser download UX

## SCQA

- **Situation:** Backend download mutation exists, clips render successfully
- **Complication:** No UI to trigger downloads, no batch capability
- **Question:** How to add download UI with minimal complexity?
- **Answer:** Add buttons to existing components (ClipCard, ActionBar), new API route for ZIP streaming

## Solution Architecture

### Single Download Flow
```
ClipCard "Скачать" button
  → trpc.clip.download.mutate({ id })
  → Server validates + returns presigned URL
  → Client: window.open(url, '_blank') or anchor click
  → Browser downloads MP4
```

### Batch Download Flow
```
VideoDetailPage "Скачать все" button
  → Next.js API route: /api/videos/[videoId]/download-all
  → Server: query all ready clips for video
  → Stream S3 objects into archiver ZIP
  → Pipe ZIP to HTTP response with Content-Disposition
  → Browser downloads ZIP
```

### Why API Route for ZIP (not tRPC)?
- tRPC mutations return JSON; can't stream binary
- Next.js API route supports `ReadableStream` responses
- Can set proper Content-Type and Content-Disposition headers

## TRIZ: Contradiction Resolution

**Contradiction:** Want batch download (convenient) but don't want server memory pressure (efficient).

**Resolution (Segmentation + Dynamics):** Stream ZIP — never hold entire archive in memory. Read S3 objects as streams, pipe into archiver, pipe archiver output to HTTP response. Memory usage stays constant regardless of total file size.
