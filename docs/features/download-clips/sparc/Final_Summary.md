# Download Clips — Final Summary

## Feature Overview

US-07 Download Clips completes the core user journey by enabling single MP4 downloads (via existing tRPC mutation + new UI) and batch ZIP downloads (via new streaming API route). Free-tier watermark indicators inform users before download.

## Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Single download method | Presigned S3 URL | Already built, no server bandwidth |
| Batch download method | Server-streamed ZIP | Must assemble archive server-side |
| ZIP library | `archiver` | Streaming support, mature, Node.js native |
| ZIP compression | Level 1 | Video already compressed, speed > size |
| Watermark detection | Derived from user plan | No schema change, plan already in session |
| Download trigger | Hidden anchor element | Works across browsers, supports filename |

## Scope Summary

| Component | Changes |
|-----------|---------|
| `clip-card.tsx` | Add download button, watermark badge |
| `clip-list.tsx` | Add "Download All" header button |
| `action-bar.tsx` | Add download button (editor) |
| `clip-editor.tsx` | Wire download handler |
| `use-clip-download.ts` | New: reusable download hook |
| `/api/videos/[videoId]/download-all/route.ts` | New: ZIP streaming endpoint |
| `package.json` | Add `archiver` + `@types/archiver` |

## Estimated Effort

- Backend: ~1 hour (API route + archiver setup)
- Frontend: ~2 hours (buttons, hook, states)
- Testing: ~1 hour
- Total: ~4 hours

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Large ZIP causes OOM | Low | High | Streaming (never buffer full archive) |
| S3 rate limiting | Low | Medium | Sequential S3 reads, not parallel |
| Presigned URL race condition | Very Low | Low | 1-hour expiry is generous |
| Browser download blocked | Low | Medium | Use anchor click, not window.open |
