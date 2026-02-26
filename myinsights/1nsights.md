# Development Insights Index

| ID | Error Signatures | Summary | Detail File | Status | Hits |
|----|-----------------|---------|-------------|--------|------|
| INS-001 | `307 redirect`, `tRPC UNAUTHORIZED`, `/api/trpc/` | Middleware blocks unauthenticated tRPC calls (register) | [INS-001](INS-001-middleware-trpc-auth.md) | 🟢 Active | 1 |
| INS-002 | `EMAIL_NOT_VERIFIED`, `Неверный email или пароль` | Login fails in dev: no SMTP for email verification | [INS-002](INS-002-dev-email-verification.md) | 🟢 Active | 1 |
| INS-003 | `Secure`, `cookie`, `Codespace`, `HTTPS proxy` | Auth cookies rejected in Codespace HTTPS environment | [INS-003](INS-003-codespace-secure-cookies.md) | 🟢 Active | 1 |
| INS-004 | `CORS`, `S3 presigned URL`, `upload hangs`, `s3.cloud.ru` | Upload hangs: S3 CORS blocks browser PUT to presigned URL | [INS-004](INS-004-s3-cors-upload-hang.md) | 🟢 Active | 1 |
| INS-005 | `Invalid environment variables`, `DATABASE_URL Required` | Worker/Next.js can't find .env in monorepo | [INS-005](INS-005-monorepo-env-loading.md) | 🟢 Active | 1 |
| INS-006 | `file_size does not exist`, `prisma db push` | DB schema out of sync after Prisma model changes | [INS-006](INS-006-prisma-schema-sync.md) | 🟢 Active | 1 |
