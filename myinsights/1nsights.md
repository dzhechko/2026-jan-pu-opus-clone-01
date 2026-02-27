# Development Insights Index

| ID | Error Signatures | Summary | Detail File | Status | Hits |
|----|-----------------|---------|-------------|--------|------|
| INS-001 | `307 redirect`, `tRPC UNAUTHORIZED`, `/api/trpc/` | Middleware blocks unauthenticated tRPC calls (register) | [INS-001](INS-001-middleware-trpc-auth.md) | 🟢 Active | 1 |
| INS-002 | `EMAIL_NOT_VERIFIED`, `Неверный email или пароль` | Login fails in dev: no SMTP for email verification | [INS-002](INS-002-dev-email-verification.md) | 🟢 Active | 1 |
| INS-003 | `Secure`, `cookie`, `Codespace`, `HTTPS proxy` | Auth cookies rejected in Codespace HTTPS environment | [INS-003](INS-003-codespace-secure-cookies.md) | 🟢 Active | 1 |
| INS-004 | `CORS`, `S3 presigned URL`, `upload hangs`, `s3.cloud.ru` | Upload hangs: S3 CORS blocks browser PUT to presigned URL | [INS-004](INS-004-s3-cors-upload-hang.md) | 🟢 Active | 1 |
| INS-005 | `Invalid environment variables`, `DATABASE_URL Required` | Worker/Next.js can't find .env in monorepo | [INS-005](INS-005-monorepo-env-loading.md) | 🟢 Active | 1 |
| INS-006 | `file_size does not exist`, `prisma db push` | DB schema out of sync after Prisma model changes | [INS-006](INS-006-prisma-schema-sync.md) | 🟢 Active | 2 |
| INS-007 | `SignatureDoesNotMatch`, `presigned URL`, `checksum`, `CRC32` | S3 presigned URL fails: AWS SDK v3 auto-checksum + Codespace proxy | [INS-007](INS-007-s3-signature-mismatch.md) | 🟢 Active | 1 |
| INS-008 | `UNAUTHORIZED`, `protectedProcedure`, `x-user-id null` | Soft-auth paths skip JWT verification → protectedProcedure fails | [INS-008](INS-008-soft-auth-missing-headers.md) | 🟢 Active | 1 |
| INS-009 | `body exceeded 10 MB`, upload truncated, `uploading` stuck | Next.js silently truncates request body to 10 MB | [INS-009](INS-009-nextjs-body-size-limit.md) | 🟢 Active | 1 |
| INS-010 | `spawn ffprobe ENOENT`, `stt_error`, video `failed` | ffprobe not installed in Codespace | [INS-010](INS-010-ffprobe-not-installed.md) | 🟢 Active | 1 |
| INS-011 | `not a valid model ID`, `google/gemini-2.0-flash`, OpenRouter `400` | OpenRouter model IDs require version suffixes (-001) | [INS-011](INS-011-openrouter-model-ids.md) | 🟢 Active | 1 |
| INS-012 | `response_format.type`, `Input should be 'json_schema'`, Anthropic `400` | Anthropic rejects response_format via OpenAI SDK | [INS-012](INS-012-anthropic-response-format.md) | 🟢 Active | 1 |
| INS-013 | `localhost:9000`, `ByteString`, presigned URL, thumbnail 404 | S3 presigned URLs fail in Codespace — use proxy | [INS-013](INS-013-s3-proxy-codespace.md) | 🟢 Active | 1 |
| INS-014 | `404`, `/dashboard/settings`, route group `(settings)` | Settings 404: route group mismatch with nav links | [INS-014](INS-014-route-group-mismatch.md) | 🟢 Active | 1 |
| INS-015 | `downloading` stuck, YouTube URL, `safeFetch` HTML | YouTube URL download gets HTML, not video file | [INS-015](INS-015-youtube-url-download.md) | 🟢 Active | 1 |
| INS-016 | `platforms page not working`, `free plan`, `autoPostPlatforms` | Free plan: platform UI shows no feedback when gated | [INS-016](INS-016-free-plan-platform-gating.md) | 🟢 Active | 1 |
| INS-017 | `Unknown field teamId`, `prisma db push already in sync`, `select` | Prisma Client stale after schema change in monorepo | [INS-017](INS-017-prisma-client-stale-monorepo.md) | 🟢 Active | 1 |
| INS-018 | `useRef Expected 1 arguments`, `Uint8Array BufferSource`, `QueueName undefined` | Pre-existing TS errors: React 19 useRef, BufferSource cast, Record index | [INS-018](INS-018-preexisting-ts-errors.md) | 🟢 Active | 2 |
| INS-019 | `Конфигурация VK OAuth не настроена`, `VK_PUBLISH_CLIENT_ID`, `YANDEX_CLIENT_ID` | OAuth невозможен в Codespace — нужна dev-mode заглушка | [INS-019](INS-019-oauth-dev-simulation.md) | 🟢 Active | 1 |
| INS-020 | `email not received`, `SMTP_HOST not configured`, `Ethereal` | Ethereal fake SMTP для dev-email вместо console.log | [INS-020](INS-020-ethereal-dev-email.md) | 🟢 Active | 1 |
| INS-021 | `QueueName | undefined`, `Record<string, QueueName>`, `Type 'undefined' is not assignable` | Record<string,T> indexing возвращает T \| undefined в strict mode | [INS-021](INS-021-record-index-undefined.md) | 🟢 Active | 1 |
| INS-022 | `Cannot find module '../lib/redis'`, `billing-cron import error` | Worker import paths — только из @clipmaker/queue | [INS-022](INS-022-worker-import-paths.md) | 🟢 Active | 1 |
| INS-023 | `accountName undefined`, `metadata?.accountName`, `platform no name` | Platform metadata key mismatch — UI vs Backend | [INS-023](INS-023-metadata-key-mismatch.md) | 🟢 Active | 1 |
