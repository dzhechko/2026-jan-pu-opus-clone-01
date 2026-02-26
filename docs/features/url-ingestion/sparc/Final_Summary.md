# Final Summary: URL Ingestion

## Executive Summary

This feature completes the partial F01 (Video Upload) implementation by adding a BullMQ download worker that handles URL-based video ingestion. Currently, the `createFromUrl` tRPC mutation creates a database record but never downloads the video. This feature adds:

1. A new `video-download` queue and `VideoDownloadJobData` type
2. A download worker that streams video from HTTP/HTTPS URLs to S3
3. SSRF protection preventing access to internal network resources
4. Content validation (content-type, file size, magic bytes)
5. Pipeline handoff to the existing STT worker

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `apps/worker/lib/ssrf-validator.ts` | SSRF protection: DNS resolve + IP range checking |
| `apps/worker/workers/download.ts` | BullMQ worker for video-download queue |

### Modified Files
| File | Change |
|------|--------|
| `packages/types/src/queue.ts` | Add `'video-download'` to QueueName, add VideoDownloadJobData |
| `packages/queue/src/constants.ts` | Add `VIDEO_DOWNLOAD` to QUEUE_NAMES |
| `packages/queue/src/index.ts` | Re-export VideoDownloadJobData |
| `apps/web/lib/trpc/routers/video.ts` | Wire TODO: enqueue download job in createFromUrl |
| `apps/worker/workers/index.ts` | Register download worker |

## Estimated Effort

| Component | Estimate |
|-----------|----------|
| SSRF validator | 1 hour |
| Download worker | 2 hours |
| Type/queue plumbing | 30 min |
| createFromUrl wiring | 15 min |
| Testing | 2 hours |
| **Total** | **~6 hours** |

## Key Risks

1. **SSRF bypass** -- Mitigated by DNS resolution + IP validation + redirect re-checking
2. **Disk exhaustion** -- Mitigated by 4GB limit + cleanup in finally + concurrency=2
3. **Network abuse** -- Mitigated by rate limiting (10 uploads/hour) + 30-min timeout

## Dependencies

- Node.js 18+ (for native fetch with streaming support)
- Existing packages: @clipmaker/s3, @clipmaker/queue, @clipmaker/db, @clipmaker/types
- No new npm dependencies required
