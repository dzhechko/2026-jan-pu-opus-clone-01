# INS-005: Worker/Next.js can't find .env in monorepo

**Status:** 🟢 Active | **Hits:** 1 | **Created:** 2026-02-26

## Error Signatures
- `Invalid environment variables`
- `DATABASE_URL Required`
- Worker crashes on startup

## Root Cause
Turborepo runs each app from its own directory (`apps/web/`, `apps/worker/`). The `.env` file lives at monorepo root. Neither Next.js nor Node.js automatically looks up the directory tree for `.env`.

## Solution

### Next.js (apps/web)
Create symlink: `cd apps/web && ln -sf ../../.env .env`
- `.env` is in `.gitignore` so symlink won't be committed
- Next.js reads `.env` from its own directory

### Worker (apps/worker)
Load dotenv explicitly in entry point:
```typescript
// apps/worker/workers/index.ts
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '../../.env') });
```

### Alternative (not implemented)
Use Turborepo `globalDotEnv` in `turbo.json`:
```json
{ "globalDotEnv": [".env"] }
```

## Files Changed
- `apps/worker/workers/index.ts` — dotenv import
- `apps/web/.env` — symlink (manual step)
