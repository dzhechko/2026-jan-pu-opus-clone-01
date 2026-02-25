# Coding Style

## TypeScript
- Strict mode (no `any`, no implicit returns)
- Zod for runtime validation, TS for compile-time
- Prefer `type` over `interface`, export from `packages/types/`

## Next.js
- App Router, Server Components by default, `'use client'` only when needed
- tRPC for API, Zustand for client state, React Query for server state

## Prisma
- Schema in `packages/db/prisma/schema.prisma`
- Migrations: `npx prisma migrate dev --name <desc>`
- Transactions for multi-table ops, never raw SQL without review

## BullMQ
- Job types in `packages/queue/`, workers in `apps/worker/workers/`
- Always retry (max 3, exponential backoff), log with Pino

## FFmpeg
- Subprocess (not node bindings), validate paths (no injection), 5 min timeout

## Naming
- Files: kebab-case, Components: PascalCase, Variables: camelCase
- Constants: UPPER_SNAKE_CASE, DB tables: snake_case
