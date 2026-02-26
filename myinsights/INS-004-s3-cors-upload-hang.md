# INS-004: Upload hangs — S3 CORS blocks browser PUT

**Status:** 🟢 Active | **Hits:** 1 | **Created:** 2026-02-26

## Error Signatures
- Upload form hangs after file selection
- No error shown to user
- S3 presigned URL returns 403 on OPTIONS preflight
- `CORS`, `upload hangs`

## Root Cause
Video upload flow:
1. Browser calls tRPC `createFromUpload` → gets presigned S3 URL
2. Browser PUTs file directly to S3 presigned URL
3. Browser sends CORS preflight (OPTIONS) first → S3 returns 403

Cloud.ru S3 bucket had no CORS policy configured for the Codespace domain.

## Solution
Use **MinIO** for local dev instead of Cloud.ru S3:
1. Added `minio` + `minio-init` services to `docker-compose.yml`
2. `minio-init` creates `clipmaker` bucket automatically
3. Made port 9000 public: `gh codespace ports visibility 9000:public`
4. Set `S3_ENDPOINT` to Codespace proxy URL for MinIO

```env
# Dev (MinIO via Codespace proxy)
S3_ENDPOINT=https://<codespace-name>-9000.app.github.dev
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_TENANT_ID=
```

MinIO has permissive CORS by default — no extra config needed.

## Key Insight
Presigned URLs contain the S3 endpoint hostname. If `S3_ENDPOINT=http://localhost:9000`, the browser can't reach it. Must use the Codespace public proxy URL.

## Files Changed
- `docker-compose.yml` — added minio, minio-init
- `.env` — S3_ENDPOINT → MinIO
