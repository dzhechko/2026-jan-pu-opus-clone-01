# INS-013: S3 Presigned URLs Fail in Codespace — Use Proxy

**Status:** 🟢 Active
**Hits:** 1
**Created:** 2026-02-26

## Error Signatures
- `localhost:9000` unreachable from browser
- `TypeError: Cannot convert argument to a ByteString` (Russian chars in Content-Disposition)
- Thumbnail/download returns 404 or network error

## Context
Clips rendered and stored in MinIO (S3) at `localhost:9000`. Presigned URLs contain `localhost:9000` as hostname. Browser in Codespace cannot access this URL.

## Root Cause
1. MinIO runs in Docker on `localhost:9000` — accessible from server, NOT from browser
2. Presigned URLs embed the S3 endpoint hostname
3. Codespace port forwarding only covers the app port (3000), not MinIO (9000)
4. Bonus: Russian filenames in `Content-Disposition` header cause `ByteString` error — need `encodeURIComponent`

## Solution
Created proxy API routes that stream S3 content through Next.js:
- `/api/clips/[clipId]/thumbnail` — streams thumbnail JPEG
- `/api/clips/[clipId]/file` — streams clip MP4

Added `NEXT_PUBLIC_USE_S3_PROXY` env switch:
- `true` (dev/Codespace) → proxy routes
- `false` (prod) → presigned S3 URLs (zero server load)

Also required: add `/api/clips/`, `/api/videos/`, `/api/upload` to middleware `SOFT_AUTH_PREFIXES` — otherwise middleware redirects API calls to `/login` instead of returning 401.

## Prevention
On prod (VPS), S3 endpoint is public (`https://s3.cloud.ru`) — presigned URLs work directly. Only use proxy in dev environments where S3 is not publicly accessible.
