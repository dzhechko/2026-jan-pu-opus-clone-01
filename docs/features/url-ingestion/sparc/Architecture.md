# Architecture: URL Ingestion

## Architecture Overview

This feature adds a new BullMQ worker to the existing distributed monolith architecture. It follows the established pattern of queue-based async processing used by STT, LLM, video-render, and publish workers.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Next.js App │     │   Redis 7    │     │  Worker Process  │
│  (tRPC API)  │────>│  (BullMQ)    │────>│  download worker  │
│              │     │              │     │                  │
│ createFromUrl│     │video-download│     │ 1. SSRF validate │
│  mutation    │     │   queue      │     │ 2. HTTP download │
└──────────────┘     └──────────────┘     │ 3. Magic bytes   │
                                          │ 4. S3 upload     │
                                          │ 5. Enqueue STT   │
                                          └──────────────────┘
                                                  │
                                          ┌───────┴────────┐
                                          │  PostgreSQL 16  │
                                          │  (video record) │
                                          └────────────────┘
                                                  │
                                          ┌───────┴────────┐
                                          │  S3 (Yandex)   │
                                          │  Object Storage│
                                          └────────────────┘
```

## Component Breakdown

### 1. Type Definition (`packages/types/src/queue.ts`)
- Add `'video-download'` to `QueueName` union
- Add `VideoDownloadJobData` type

### 2. Queue Constants (`packages/queue/src/constants.ts`)
- Add `VIDEO_DOWNLOAD: 'video-download'` to `QUEUE_NAMES`

### 3. Queue Package Exports (`packages/queue/src/index.ts`)
- Re-export `VideoDownloadJobData`

### 4. Download Worker (`apps/worker/workers/download.ts`)
- New BullMQ Worker consuming `video-download` queue
- Concurrency: 2 (network I/O bound, not CPU)
- Uses existing patterns: Pino logger, Prisma, S3 ops, retry logic

### 5. SSRF Validator (`apps/worker/lib/ssrf-validator.ts`)
- Standalone module for URL safety validation
- DNS resolution + IP range checking
- Reusable across any future URL-accepting feature

### 6. tRPC Mutation Update (`apps/web/lib/trpc/routers/video.ts`)
- Wire the TODO: enqueue `video-download` job after DB insert

### 7. Worker Registration (`apps/worker/workers/index.ts`)
- Add `import('./download')` to worker startup

## Technology Choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| HTTP client | Node.js native `fetch()` | Built-in, supports streaming, AbortController |
| DNS resolution | `dns.promises.resolve4/resolve6` | Native, no dependency |
| Temp file I/O | `fs.createWriteStream` + `stream.pipeline` | Streaming, backpressure-safe |
| S3 upload | `putObject` (small) / multipart (large) | Reuse existing packages/s3 |
| IP validation | Custom `isPrivateIP()` | No dependency, explicit control |

## Data Architecture

### New Queue Job
```
Queue: video-download
Job name: video-download
Payload: VideoDownloadJobData { videoId, url, userId, strategy }
Options: DEFAULT_JOB_OPTIONS (3 attempts, exponential backoff)
```

### DB Changes: None
The existing `video` table already has:
- `sourceType: 'url'`
- `sourceUrl: string`
- `status: 'downloading'`
- `filePath: string` (empty initially, populated after S3 upload)
- `fileSize: bigint` (populated after download)

### S3 Paths
Uses existing `videoSourcePath(userId, videoId, ext)` -> `videos/{userId}/{videoId}/source.{ext}`

## Security Architecture

### SSRF Protection Layers

1. **URL Scheme Validation** (Zod level): Only `http:` and `https:` schemes
2. **DNS Resolution**: Resolve hostname to IP before connecting
3. **IP Range Blocking**: Reject private, loopback, link-local, cloud metadata IPs
4. **Redirect Following**: Re-validate each redirect target (max 5 redirects)
5. **Content-Type Validation**: Reject non-video content types
6. **Magic Bytes Validation**: Verify actual file format matches video signatures

### Rate Limiting
- Existing `checkRateLimit('upload', ...)` at tRPC level (10 uploads/hour)
- BullMQ worker concurrency: 2 (natural throttle on download bandwidth)

## Consistency with Project Architecture

- **Pattern:** Same BullMQ worker pattern as stt.ts, llm-analyze.ts, etc.
- **Logging:** Pino via `createLogger('worker-download')`
- **Error handling:** Throw to let BullMQ retry; mark failed after all attempts exhausted
- **Cleanup:** `finally` block for temp file deletion
- **Types:** Defined in `packages/types`, re-exported from `packages/queue`
- **S3:** Uses `packages/s3` operations (putObject, validateMagicBytes, videoSourcePath)
