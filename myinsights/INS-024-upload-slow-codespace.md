# INS-024: Медленная загрузка видео в Codespace

**Status:** 🟡 Workaround
**Hits:** 1
**Date:** 2026-02-27

## Error Signatures
`upload slow`, `загрузка долгая`, `uploading stuck`, `progress stalls`, `upload timeout`

## Problem
Загрузка видео в Codespace/dev-среде значительно медленнее, чем ожидается. Файл 500 МБ может загружаться 10-20+ минут.

## Root Cause (5 факторов)

### 1. Двойная буферизация (CRITICAL)
**Файл:** `apps/web/app/api/upload/route.ts:35`
```typescript
const body = await request.arrayBuffer(); // Буферизует ВЕСЬ чанк в RAM
```
Каждый чанк проходит путь: Браузер → XHR → Next.js API (буфер в RAM) → S3 (MinIO).
Файл фактически загружается **дважды**: сначала в Next.js, потом из Next.js в MinIO.

### 2. Маленькие чанки 14 МБ (HIGH)
**Файл:** `packages/s3/src/multipart.ts:18`
```typescript
const MAX_PART_SIZE = 14 * 1024 * 1024; // 14MB — ограничение Codespace proxy ~16MB
```
Для 500 МБ файла = **36 HTTP round-trips** вместо 5 при 100 МБ чанках.

### 3. Только 3 параллельных чанка (MEDIUM)
**Файл:** `apps/web/components/upload/video-uploader.tsx:9`
```typescript
const CONCURRENT_PARTS = 3;
```

### 4. Нет прямой загрузки в S3 (MEDIUM)
В Codespace нельзя использовать presigned URL напрямую из-за:
- MinIO на `localhost:9000` недоступен из браузера (INS-013)
- S3 CORS блокирует PUT запросы (INS-004)
- Signature mismatch из-за Codespace proxy (INS-007)

### 5. Последовательные S3-вызовы после загрузки (LOW)
**Файл:** `apps/web/lib/trpc/routers/video.ts:206, 222`
```typescript
const head = await headObject(video.filePath);           // Вызов 1
const bytes = await getObjectBytes(video.filePath, ...); // Вызов 2 (последовательно)
```

## Current Workaround
Это **by design** для Codespace. Загрузка работает, просто медленно.

## Production Solution
В production (VPS + Cloud.ru S3) эти ограничения снимаются:
- `NEXT_PUBLIC_USE_S3_PROXY=false` → прямая загрузка по presigned URL
- Чанки до 100 МБ (нет Codespace proxy лимита)
- 5-6 параллельных чанков
- Streaming вместо буферизации (если нужно)

## Возможные оптимизации для Dev

| Оптимизация | Файл | Сложность | Эффект |
|-------------|------|-----------|--------|
| Streaming вместо arrayBuffer() | upload/route.ts:35 | Высокая | 2x ускорение |
| Увеличить CONCURRENT_PARTS до 5 | video-uploader.tsx:9 | Низкая | 30-50% ускорение |
| Параллелизовать headObject + getObjectBytes | video.ts:206-222 | Низкая | -200ms после загрузки |
| Увеличить MAX_PART_SIZE (если proxy позволяет) | multipart.ts:18 | Низкая | Меньше round-trips |

## Связанные инсайты
- INS-004: S3 CORS hang
- INS-007: S3 signature mismatch
- INS-009: Next.js body size truncation
- INS-013: S3 presigned URLs fail in Codespace
