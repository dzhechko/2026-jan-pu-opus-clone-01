# Development Insights Index

| ID | Error Signatures | Summary | Detail File | Status | Hits |
|----|-----------------|---------|-------------|--------|------|
| INS-001 | `307 redirect`, `tRPC UNAUTHORIZED`, `/api/trpc/` | Middleware blocks unauthenticated tRPC calls (register) | [INS-001](INS-001-middleware-trpc-auth.md) | 🟢 Active | 1 |
| INS-002 | `EMAIL_NOT_VERIFIED`, `Неверный email или пароль` | Login fails in dev: no SMTP for email verification | [INS-002](INS-002-dev-email-verification.md) | 🟢 Active | 1 |
| INS-003 | `Secure`, `cookie`, `Codespace`, `HTTPS proxy` | Auth cookies rejected in Codespace HTTPS environment | [INS-003](INS-003-codespace-secure-cookies.md) | 🟢 Active | 1 |
| INS-004 | `CORS`, `S3 presigned URL`, `upload hangs`, `s3.cloud.ru` | Upload hangs: S3 CORS blocks browser PUT to presigned URL | [INS-004](INS-004-s3-cors-upload-hang.md) | 🟢 Active | 1 |
| INS-005 | `Invalid environment variables`, `DATABASE_URL Required` | Worker/Next.js can't find .env in monorepo | [INS-005](INS-005-monorepo-env-loading.md) | 🟢 Active | 1 |
| INS-006 | `file_size does not exist`, `prisma db push` | DB schema out of sync after Prisma model changes | [INS-006](INS-006-prisma-schema-sync.md) | 🟢 Active | 1 |
| INS-007 | `SignatureDoesNotMatch`, `presigned URL`, `checksum`, `CRC32` | S3 presigned URL fails: AWS SDK v3 auto-checksum + Codespace proxy | [INS-007](INS-007-s3-signature-mismatch.md) | 🟢 Active | 1 |
| INS-008 | `UNAUTHORIZED`, `protectedProcedure`, `x-user-id null` | Soft-auth paths skip JWT verification → protectedProcedure fails | [INS-008](INS-008-soft-auth-missing-headers.md) | 🟢 Active | 1 |
