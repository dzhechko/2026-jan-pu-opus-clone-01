# INS-009: Upload truncated — Next.js 10 MB body size limit

**Status:** 🟢 Active | **Hits:** 1 | **Created:** 2026-02-26

## Error Signatures
- Upload appears to succeed but file is incomplete in S3
- `confirmUpload` fails — HeadObject returns wrong size or file not found
- Video stuck in `uploading` status forever
- `Request body exceeded 10 MB` (warning in Next.js server logs)
- `Ошибка сети. Проверьте подключение` (frontend, after timeout)

## Root Cause
Next.js clones and buffers request body for middleware + route handler reuse. Default buffer limit: **10 MB** (`DEFAULT_BODY_CLONE_SIZE_LIMIT` in `next/dist/server/body-streams.js`).

When a file exceeds 10 MB:
1. Next.js buffers only the first 10 MB
2. `request.arrayBuffer()` or `request.body.getReader()` returns truncated data
3. Truncated file uploaded to S3 — `confirmUpload` fails or produces corrupt video
4. No error returned to client — request completes with 200 OK but partial data

This is **silent truncation** — no 413 error, just a warning in server logs.

## Solution
Add `middlewareClientMaxBodySize` to `next.config.ts`:

```typescript
const nextConfig: NextConfig = {
  experimental: {
    middlewareClientMaxBodySize: '4gb',
  },
};
```

In Next.js 15.x the config key is `middlewareClientMaxBodySize`.
In Next.js 16.x+ it was renamed to `proxyClientMaxBodySize`.

Check which version is installed:
```bash
node -e "console.log(require('next/package.json').version)"
grep -n "middlewareClientMaxBodySize\|proxyClientMaxBodySize" node_modules/next/dist/server/config-shared.js
```

## Key Insight
The truncation is **silent** — no HTTP error, no exception. The route handler receives a 200-able partial body. The only evidence is a `console.warn()` in server logs that's easy to miss. Always test uploads with files > 10 MB when using Next.js API route proxies.

## Files Changed
- `apps/web/next.config.ts` — added `experimental.middlewareClientMaxBodySize: '4gb'`
- `apps/web/app/api/upload/route.ts` — updated comment documenting the limit
