# Download Clips — Review Report

## Review Agents

| Agent | Scope | Focus |
|-------|-------|-------|
| code-quality | All new/modified source | Clean code, patterns, naming |
| architecture | Integration points | Consistency with project architecture |
| security | Download endpoints, user input | Vulnerabilities, input validation |
| performance | ZIP streaming, hook lifecycle | Bottlenecks, memory, complexity |
| edge-cases | Error paths, race conditions | Missing guards, boundary behavior |

## Issues Found: 8 (3 Critical, 5 Major)

### Critical Issues

| # | Issue | File | Resolution |
|---|-------|------|-----------|
| C1 | `response.blob()` buffers entire ZIP in browser heap (OOM on large downloads) | `use-clip-download.ts` | Replaced fetch+blob with direct anchor navigation — browser streams to disk natively |
| C2 | `writer.write()` ignores backpressure from archiver data handler (server OOM) | `route.ts` | Added `await writer.ready` before `await writer.write(chunk)` |
| C3 | `useClipDownload()` called inside every `ClipCard` — 50 tRPC mutation instances, breaks `memo` | `clip-card.tsx` | Lifted hook to `ClipList`, pass `onDownload`/`isDownloading`/`downloadError` as props |

### Major Issues

| # | Issue | File | Resolution |
|---|-------|------|-----------|
| M1 | No double-click guard in `useDownloadAll` | `use-clip-download.ts` | Added `busyRef` guard, 3s cooldown |
| M2 | archiver `warning` event unhandled — can crash process | `route.ts` | Added `archive.on('warning', ...)` handler |
| M3 | `Content-Disposition` no RFC 5987 encoding — Cyrillic filenames corrupted | `route.ts` | Added `rfc5987Encode()`, dual `filename`/`filename*` headers |
| M4 | `sanitizeFilename` allows semicolons — header injection vector | `route.ts` | Added `;` to stripped characters regex |
| M5 | Empty `videoId` not guarded in `useDownloadAll` | `use-clip-download.ts` | Added `if (!videoId)` early return |

### Minor Issues (not fixed — low risk)

| # | Issue | Reason for deferral |
|---|-------|-------------------|
| m1 | No AbortController for in-flight single downloads | Presigned URL downloads are fast; aborting mid-download has no UX benefit |
| m2 | `useCallback` identity changes on `clip.id`/`clip.title` change in ClipCard | Acceptable — props change only on data refresh, not on every render |

## Architecture Consistency

- ZIP endpoint uses existing `getObjectStream` from `@clipmaker/s3`
- Auth via `x-user-id` header (set by edge middleware) — consistent with other API routes
- Rate limiting via existing `checkRateLimit` utility
- Prisma queries filter by `userId` for ownership — consistent pattern
- Hook structure follows project conventions (useRef for stable refs, useCallback with minimal deps)

## Security Review

- UUID validation on videoId param
- Ownership verification (video.userId === userId)
- Rate limiting: 5 batch downloads per 60s per user
- Semicolons stripped from filenames (Content-Disposition injection)
- RFC 5987 encoding prevents header manipulation via Cyrillic characters
- No raw SQL — Prisma ORM only
- S3 presigned URLs for single downloads (time-limited)

## Performance Review

- ZIP level 1 (fast — video already compressed by FFmpeg)
- Streaming via TransformStream — no full buffering on server
- Backpressure respected with `await writer.ready`
- Single `useClipDownload` instance per ClipList (not per card)
- `memo` on ClipCard works correctly now (stable callback props)
- `take: 50` limit on clips query prevents unbounded ZIP generation

## Metrics

- Files reviewed: 6
- Issues found: 8 (3 critical, 5 major)
- Issues fixed: 8/8
- Issues deferred: 2 minor (low risk)
- TypeScript errors: 0 new (4 pre-existing in unrelated files)
