# INS-022: Worker import paths — только из @clipmaker/queue

**Status:** 🟢 Active
**Hits:** 1
**Date:** 2026-02-27

## Error Signatures
`Cannot find module '../lib/redis'`, `getRedisConnection`, `billing-cron import error`, `worker registration failed`

## Problem
`billing-cron.ts` worker не запускался — импортировал `getRedisConnection` из несуществующего `../lib/redis`.

## Root Cause
Worker был написан с неправильным import path. Все остальные workers (stt, llm-analyze, video-render, download, publish) импортируют из:
```typescript
import { getRedisConnection } from '@clipmaker/queue/src/queues';
import { QUEUE_NAMES } from '@clipmaker/queue/src/constants';
```

А billing-cron пытался:
```typescript
import { getRedisConnection } from '../lib/redis'; // ← файл не существует
```

## Solution
Заменить import path на `@clipmaker/queue/src/queues` — единый источник для всех workers.

## Prevention
- При создании нового worker — копировать imports из существующего (например, `stt.ts`)
- Паттерн: Redis-подключение ВСЕГДА из `@clipmaker/queue/src/queues`
- Queue names ВСЕГДА из `@clipmaker/queue/src/constants`
- Не создавать дублирующие модули для того, что уже есть в packages/
