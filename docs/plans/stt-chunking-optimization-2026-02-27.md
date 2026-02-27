# Plan: Оптимизация STT чанкинга для Cloud.ru

**Дата:** 2026-02-27
**Статус:** ✅ Выполнено
**Коммит:** `fix(stt): optimize chunking for Cloud.ru stability`

## Контекст / Проблема

Cloud.ru Whisper API нестабильно работает с большими чанками (10 мин):
- `verbose_json` не поддерживается → fallback тратит ~2 мин впустую на таймаут
- Большие MP3 (~1.5MB/10мин) медленно аплоадятся из Codespace
- Прогресс обновляется только 3 раза (17% → 33% → 50%) — плохой UX
- Частые таймауты/Connection error на длинных чанках

## Изменения

### 1. CHUNK_DURATION: 10 мин → 3 мин
**Файл:** `apps/worker/lib/audio-chunker.ts:4`

```diff
- export const CHUNK_DURATION = 600; // 10 minutes in seconds
+ export const CHUNK_DURATION = 180; // 3 minutes in seconds
```

Для 27-мин видео: 3 чанка → 9 чанков. Каждый MP3 ~450KB (вместо 1.5MB).

### 2. Убрать verbose_json для ru стратегии
**Файл:** `apps/worker/workers/stt.ts:112-125`

Было: `verbose_json` → таймаут → fallback `json` (теряли ~2 мин на КАЖДЫЙ чанк)
Стало: сразу `json` для `strategy === 'ru'`, `verbose_json` только для `global`

```typescript
const responseFormat = strategy === 'ru' ? 'json' as const : 'verbose_json' as const;
```

### 3. Concurrency: 3 → 2
**Файл:** `apps/worker/workers/stt.ts:165`

```diff
- { concurrency: 3 },
+ { concurrency: 2 },
```

Меньше нагрузка на Cloud.ru API → меньше отказов.

## Результаты (ожидаемые)

| Метрика | Было | Стало |
|---------|------|-------|
| Чанков для 27 мин | 3 | 9-10 |
| Размер чанка MP3 | ~1.5MB | ~450KB |
| Время на чанк | 3-5 мин | 20-40 сек |
| Таймаут verbose_json | ~2 мин впустую | 0 |
| Прогресс обновлений | 3 | 9-10 |
| Суммарное время STT | ~8-12 мин | ~2-3 мин |

## Реальные результаты тестирования (2026-02-27)

Тест на видео 27.4 мин (1646 сек), global стратегия (OpenAI Whisper):

| Метрика | Значение |
|---------|----------|
| Чанков | 10 |
| Модель | whisper-1 |
| Сегментов | 358 |
| Общее время STT | **55 секунд** |
| Стоимость | 15.41₽ (1541 коп) |
| Прогресс-апдейтов | ~10 (гранулярно) |

Cloud.ru (ru стратегия): API недоступен из GitHub Codespace (сетевое ограничение), на VPS в РФ ожидается аналогичное ускорение.

## Verification
- [x] `npx tsc --noEmit -p apps/worker/tsconfig.json` — clean
- [x] Reprocess видео → 10 чанков, verbose_json для global, прогресс обновляется гранулярно
- [x] STT complete: 358 сегментов за 55 сек
- [x] UI прогресс-бар двигается плавно
- [ ] Cloud.ru (ru стратегия) — не протестирован (API недоступен из Codespace)
