# INS-007: S3 presigned URL fails — SignatureDoesNotMatch

**Status:** 🟢 Active | **Hits:** 1 | **Created:** 2026-02-26

## Error Signatures
- `SignatureDoesNotMatch`
- `The request signature we calculated does not match`
- `Ошибка сети. Проверьте подключение` (frontend message)

## Root Cause
Two compounding issues:

### 1. AWS SDK v3 auto-checksum (CRC32)
AWS SDK v3 adds `x-amz-checksum-crc32` and `x-amz-sdk-checksum-algorithm` to presigned URLs by default. Browser XHR doesn't send these headers → signature mismatch.

### 2. Codespace proxy breaks signatures
Even after fixing checksums, the Codespace port forwarding proxy modifies HTTP requests (headers, connection handling) in ways that break S3 signature verification. The `host` header seen by MinIO doesn't match what was signed.

## Solution
**Server-side upload proxy** instead of browser-to-S3 presigned URLs:

```
Browser PUT /api/upload → Next.js API route → S3 (localhost:9000)
```

1. Created `/api/upload` route that accepts file body + `x-upload-key` header
2. Route verifies auth (x-user-id from middleware) and key ownership
3. Uploads directly to S3 server-side (no signature issues)
4. Modified `video-uploader.tsx` to PUT to `/api/upload` instead of presigned URL

Also applied defensive fixes to S3 client:
```typescript
// packages/s3/src/client.ts
requestChecksumCalculation: 'WHEN_REQUIRED',
responseChecksumValidation: 'WHEN_REQUIRED',
```

## Files Changed
- `apps/web/app/api/upload/route.ts` (new)
- `apps/web/components/upload/video-uploader.tsx`
- `packages/s3/src/client.ts`
- `packages/s3/src/presign.ts`
