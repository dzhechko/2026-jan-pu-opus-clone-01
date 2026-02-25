# Review Report: S3 Upload Feature

**Date:** 2026-02-25
**Phase:** 4 — REVIEW (brutal-honesty-review)
**Reviewers:** 3 parallel agents (Linus: packages/s3, Security: tRPC, Ramsay: VideoUploader)

---

## Summary

| Severity | packages/s3 | tRPC routers | VideoUploader | Total |
|----------|-------------|-------------|---------------|-------|
| CRITICAL | 2 | 3 | 5 | 10 |
| MAJOR | 7 | 6 | 6 | 19 |
| MINOR | 11 | 5 | 10 | 26 |

## Critical Issues (must fix)

| # | Component | Issue | Fix |
|---|-----------|-------|-----|
| C1 | paths.ts | No input sanitization — path traversal | Add regex validation for userId, videoId, ext |
| C2 | operations.ts | Unsafe `as` casts, wrong Body type from SDK | Use `transformToByteArray()`, proper type guards |
| C3 | video.ts | `cause: error` in TRPCError leaks S3 internals | Remove `cause`, log server-side |
| C4 | video-uploader | Race condition: double upload on rapid click | Add uploadStateRef guard |
| C5 | video-uploader | Mutation objects in deps = new callback every render | Use refs for mutations |
| C6 | video-uploader | XHR abort listeners leak (400 per upload) | Use `{ once: true }` or cleanup |
| C7 | video-uploader | handleCancel races with async catch | Only abort in handleCancel, let catch handle state |
| C8 | video-uploader | Simple upload cancel leaves orphaned DB record | Add cleanup for non-multipart cancel |

## Major Issues (should fix)

| # | Component | Issue | Fix |
|---|-----------|-------|-----|
| M1 | client.ts | Untestable singleton, no reset/destroy | Add resetS3Client(), use globalThis for Next.js |
| M2 | presign.ts | No validation of key/fileSize/contentType | Add defense-in-depth validation |
| M3 | multipart.ts | Sequential presigned URL generation (O(n)) | Use Promise.all |
| M4 | multipart.ts | No parts validation in complete | Sort + validate before S3 call |
| M5 | validation.ts | No buffer bounds check | Add minimum length check |
| M6 | video.ts | createFromUrl: no rate limit, no quota check | Add same checks as createFromUpload |
| M7 | video.ts | createFromUpload: 2 DB writes instead of 1 | Generate key before create |
| M8 | video-uploader | No redirect/link after successful upload | Add onSuccess navigation |
| M9 | video-uploader | Progress jumps backward on part retry | Reset partLoaded before retry |
| M10 | video-uploader | URL mutation: no success handler, no error clear | Add onSuccess + clear error |
| M11 | video-uploader | File input not reset, same file re-select broken | Reset e.target.value |
| M12 | video-uploader | No unmount cleanup | Add useEffect cleanup |

## Pre-existing Issues (not introduced by s3-upload, but flagged)

- Rate limiter TOCTOU (INCR+EXPIRE not atomic) — affects all rate-limited endpoints
- clip.update: subtitleEdits not wired, no published guard, negative duration
- clip.publish: allows duplicate publications per platform
- createFromUrl: SSRF risk (accepts arbitrary URLs)
- title fields: no DOMPurify sanitization

---

## Action Plan

Fix all CRITICAL and s3-upload MAJOR issues now. Pre-existing issues logged for separate fix.
