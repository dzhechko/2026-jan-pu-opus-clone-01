# Plan: Video Processing Controls — остановка и перезапуск из UI

**Date:** 2026-02-27
**Status:** implemented
**Complexity:** medium

## Context

Сейчас управление обработкой видео доступно только из консоли — если видео зависло или нужно остановить, приходится вручную убивать воркер и менять статус в БД. Кнопка "Перезапустить" появляется только после `failed`. Нужны кнопки Stop (остановить) и Restart (перезапустить) прямо в UI на странице видео.

## Changes (7 files)

### 1. `packages/db/prisma/schema.prisma` — добавить статус `cancelled`

- Добавить `cancelled` в enum `VideoStatus` (между `completed` и `failed`)
- Миграция: `npx prisma migrate dev --name add-cancelled-status`

### 2. `packages/queue/src/queues.ts` — утилита отмены jobs по videoId

- Добавить функцию `cancelJobsByVideoId(queueName, videoId)`:
  - Получить все active + waiting + delayed jobs из очереди
  - Найти jobs с `data.videoId === videoId`
  - Вызвать `job.remove()` для waiting/delayed, `job.moveToFailed()` для active
  - Возвращать количество отменённых jobs
- BullMQ API: `queue.getJobs(['active', 'waiting', 'delayed'])`

### 3. `apps/web/lib/trpc/routers/video.ts` — мутация `cancel`

- Новая мутация `cancel`:
  - Input: `{ videoId: string }`
  - Валидация: видео принадлежит пользователю, статус в `[transcribing, analyzing, generating_clips, downloading]`
  - Отменить jobs во всех очередях (STT, LLM, RENDER) через `cancelJobsByVideoId`
  - Обновить видео: `status: 'cancelled'`, `errorMessage: 'Остановлено пользователем'`
  - Return: `{ cancelled: true }`

- Расширить мутацию `reprocess`:
  - Разрешить рестарт не только для `failed`, но и для `cancelled`
  - Строка ~313: `if (!['failed', 'cancelled'].includes(video.status))` throw

### 4. `apps/web/components/video/video-header.tsx` — кнопка "Остановить"

- Добавить кнопку "Остановить" (красная, иконка Square/StopCircle) рядом с существующими
- Показывать при статусах: `transcribing`, `analyzing`, `generating_clips`, `downloading`
- onClick → `cancelMutation.mutateAsync({ videoId })` → refetch
- Кнопку "Перезапустить" показывать для `failed` И `cancelled`

### 5. `apps/web/components/video/video-detail.tsx` — обработка статуса `cancelled`

- Добавить `cancelled` в список терминальных статусов (TERMINAL_STATUSES)
- Создать `CancelledBlock` (аналог `FailedBlock`): показывает "Обработка остановлена" + кнопку "Перезапустить"
- Или переиспользовать `FailedBlock` с разным текстом в зависимости от статуса

### 6. `apps/web/components/dashboard/processing-progress.tsx` — кнопка Stop в прогресс-баре

- Добавить prop `onCancel?: () => void`
- Если передан — рендерить маленькую кнопку ✕ справа от прогресс-бара
- VideoDetail передаёт onCancel при обработке

### 7. `packages/types/src/index.ts` — тип VideoStatus (если есть union type)

- Добавить `'cancelled'` в union type VideoStatus (если используется отдельно от Prisma enum)

## Files WITHOUT changes

- `apps/worker/workers/stt.ts` — воркер сам не знает об отмене; BullMQ job.remove() уберёт job из очереди; если job уже в процессе, moveToFailed заставит retry handler пометить видео
- `apps/worker/workers/llm-analyze.ts` — аналогично, job management через BullMQ
- `apps/worker/workers/video-render.ts` — аналогично

## Dependencies

- BullMQ: `Queue.getJobs()`, `Job.remove()`, `Job.moveToFailed()` — уже в API, ничего ставить не надо
- Prisma migration: `npx prisma migrate dev --name add-cancelled-status`
- Никаких новых пакетов

## Edge Cases

1. **Job уже active (воркер обрабатывает)**: `moveToFailed` переведёт в failed, воркер увидит ошибку в catch, retry handler обновит статус → но мы уже поставили `cancelled`, поэтому retry handler должен проверять текущий статус перед обновлением на `failed`
2. **Гонка cancel + завершение**: cancel ставит `cancelled`, но job завершается успешно → worker пытается обновить на `analyzing` → нужна проверка `WHERE status = 'transcribing'` (conditional update)
3. **Множественные jobs**: для одного видео могут быть jobs в STT + LLM + RENDER одновременно → cancel должен пройтись по ВСЕМ очередям
4. **Reprocess после cancel**: должен работать как обычный reprocess — удалить старые данные, создать новый job

## Verification

1. `npx prisma migrate dev --name add-cancelled-status` — миграция проходит
2. `npx tsc --noEmit` — типы собираются
3. UI: видео в статусе `transcribing` → видна кнопка "Остановить" в header + ✕ в прогресс-баре
4. Нажать "Остановить" → статус меняется на `cancelled`, показывается CancelledBlock
5. Нажать "Перезапустить" из cancelled → видео переходит обратно в обработку
6. Видео в `completed` → нет кнопки остановки (корректно)
