# Download Clips — Research Findings

## Existing Infrastructure

### Backend (Already Built)
- `clip.download` tRPC mutation: validates ownership, status=ready, filePath exists → returns presigned S3 URL (1hr expiry)
- `generateDownloadUrl(key)` in `@clipmaker/s3`: AWS SDK v3, GetObjectCommand + getSignedUrl
- Rate limiting: 30 calls per 60 seconds per user
- S3 operations: `getObjectStream(key)` available for server-side streaming

### Frontend (Missing)
- `ClipCard` component has no download button
- `ActionBar` in clip editor has no download button
- No batch download UI exists
- No watermark indicator in UI

## ZIP Archive Options

| Library | Size | Streaming | Server/Client |
|---------|------|-----------|---------------|
| `archiver` | 1.2MB | Yes | Server (Node) |
| `jszip` | 180KB | Limited | Both |
| `adm-zip` | 120KB | No | Server |

**Decision:** Use `archiver` — supports streaming (pipe to response), handles large files, Node.js native. Generate ZIP server-side by streaming S3 objects directly into archive (no temp files).

## S3 Download Patterns

### Pattern A: Presigned URL Redirect
- Client calls mutation → gets URL → `window.location.href = url`
- Pros: No server bandwidth, S3 handles transfer
- Cons: URL in browser history, CORS headers needed for programmatic access

### Pattern B: Server Proxy Stream
- Client hits API route → server streams from S3 → pipes to response
- Pros: No URL exposure, custom headers (Content-Disposition), bandwidth control
- Cons: Server bandwidth cost

**Decision for single download:** Pattern A (presigned URL) — already implemented, efficient.
**Decision for batch download:** Pattern B (server stream) — necessary for ZIP assembly.

## Watermark Detection

- Watermark flag is set during render job (see `apps/worker/lib/ffmpeg.ts`)
- Prisma `Clip` model does NOT store a `hasWatermark` field
- User's plan determines watermark: Free → always, Start/Pro → never
- **Approach:** Derive from user plan at display time (no schema change needed)

## Content-Disposition Headers

For triggering browser download dialog:
```
Content-Disposition: attachment; filename="clip-title.mp4"
Content-Type: video/mp4
```

For ZIP:
```
Content-Disposition: attachment; filename="clips-video-title.zip"
Content-Type: application/zip
```

## Rate Limiting for Batch

- Single: existing 30/60s is fine
- Batch: should be more restrictive — suggest 5 batch downloads per 60s
- ZIP generation is CPU/bandwidth intensive
