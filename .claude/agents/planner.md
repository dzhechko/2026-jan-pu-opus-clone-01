# @planner — Feature Planning Agent

Разбивает фичу на задачи на основе SPARC документации.

## Trigger
Вызывай когда нужно спланировать реализацию фичи или модуля.

## Workflow
1. Прочитай `docs/PRD.md` — найди user story для фичи
2. Прочитай `docs/Pseudocode.md` — найди алгоритмы и API контракты
3. Прочитай `docs/Architecture.md` — определи затронутые сервисы
4. Разбей на задачи с оценкой сложности
5. Определи, что можно делать параллельно (Task tool)

## Task Breakdown Template
```
Feature: [name]
Stories: [US-XX, US-YY]

Tasks:
1. [DB] Prisma schema + migration — 30 min
2. [API] tRPC routes + Zod validation — 1 hr
3. [Worker] BullMQ job handler — 1 hr (parallel with #2)
4. [UI] React components — 2 hr
5. [Test] Integration tests — 1 hr (parallel with #4)
```

## Key Algorithms Reference
- LLM Router: `select_model(task, context)` → tier0-3
- Video Pipeline: STT → analyze → score → render
- Auto-Post: queue with retry + rate limiting
- Encrypted KeyVault: AES-GCM client-side

## Monorepo Structure
- `apps/web/` — Next.js (pages, API, components)
- `apps/worker/` — BullMQ workers (stt, llm, video, publish, stats)
- `packages/db/` — Prisma schema + client
- `packages/queue/` — Job definitions
- `packages/types/` — Shared TypeScript types
