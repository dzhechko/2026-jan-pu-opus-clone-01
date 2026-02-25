# Download Clips — Architecture

## Component Diagram

```mermaid
graph TD
    subgraph "Client (Browser)"
        CC[ClipCard] -->|click Скачать| DH[downloadHandler]
        AB[ActionBar] -->|click Скачать MP4| DH
        DA[Download All Button] -->|click| BAH[batchDownloadHandler]
        DH -->|trpc mutation| TRPC_CLIENT[tRPC Client]
        BAH -->|fetch| API_ROUTE[/api/videos/.../download-all]
    end

    subgraph "Server (Next.js)"
        TRPC_CLIENT --> CLIP_ROUTER[clip.download mutation]
        API_ROUTE --> ZIP_HANDLER[ZIP Stream Handler]
        CLIP_ROUTER -->|generateDownloadUrl| S3_PRESIGN[S3 Presigner]
        ZIP_HANDLER -->|getObjectStream x N| S3_STREAM[S3 Stream]
        ZIP_HANDLER -->|pipe| ARCHIVER[archiver ZIP]
    end

    subgraph "Storage"
        S3_PRESIGN --> S3[(S3 / Yandex OS)]
        S3_STREAM --> S3
    end
```

## Integration Points

### Existing (No Changes Needed)
| Component | Location | Purpose |
|-----------|----------|---------|
| `clip.download` mutation | `apps/web/lib/trpc/routers/clip.ts` | Single clip presigned URL |
| `generateDownloadUrl()` | `packages/s3/src/presign.ts` | S3 URL generation |
| `getObjectStream()` | `packages/s3/src/operations.ts` | S3 streaming for ZIP |
| `checkRateLimit()` | `apps/web/lib/auth/rate-limit.ts` | Per-user rate limiting |
| Auth middleware | `apps/web/middleware.ts` | Sets x-user-id, x-user-plan headers |

### New Components
| Component | Location | Purpose |
|-----------|----------|---------|
| Download All API route | `apps/web/app/api/videos/[videoId]/download-all/route.ts` | ZIP streaming endpoint |
| Download button in ClipCard | `apps/web/components/clips/clip-card.tsx` | UI trigger |
| Download button in ActionBar | `apps/web/components/clip-editor/action-bar.tsx` | Editor download |
| Download All button | `apps/web/components/clips/clip-list.tsx` | Batch UI trigger |
| `useClipDownload` hook | `apps/web/lib/hooks/use-clip-download.ts` | Reusable download logic |

## Technology Choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Single download | Presigned URL (existing) | No server bandwidth, direct S3 |
| Batch download | `archiver` + streaming | Memory-efficient, no temp files |
| ZIP compression | Level 1 (fastest) | Video is already compressed (H.264) |
| Filename sanitization | Regex replace | Prevent path traversal, cross-OS compat |

## Security Considerations

- **Ownership check**: Both single and batch verify `userId` match
- **Rate limiting**: Single 30/60s, batch 5/60s
- **No filePath exposure**: Client never sees S3 keys
- **Presigned URL expiry**: 1 hour (existing)
- **ZIP bomb prevention**: Max 50 clips per ZIP, each clip max ~500MB
- **Filename sanitization**: Strip special chars to prevent injection

## Consistency with Project Architecture

- Uses existing auth middleware headers (x-user-id, x-user-plan)
- Follows Distributed Monolith pattern (no new services)
- Uses existing S3 package utilities
- tRPC for JSON responses, API route for streaming binary
- No new database schema changes needed
