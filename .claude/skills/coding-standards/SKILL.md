# Coding Standards: КлипМейкер

## Next.js 15
- App Router, route groups: `(auth)`, `(dashboard)`, `(settings)`
- Server Components default, `'use client'` only when needed
- tRPC for API, `loading.tsx` for every route group

## tRPC Pattern
- Shared types in `packages/types/`
- Router files in `apps/web/lib/trpc/routers/`
- Zod schemas for all inputs

## BullMQ Worker
- Job types in `packages/queue/`, workers in `apps/worker/workers/`
- Concurrency per worker type, retry max 3 + exponential backoff
- Log start/complete/fail with Pino structured JSON

## LLM Router
- OpenAI-compatible client for both Cloud.ru and Global providers
- `import OpenAI from 'openai'` with different baseURL per strategy
- JSON response_format for structured output

## Prisma
- Schema in `packages/db/`, transactions for billing, soft deletes
