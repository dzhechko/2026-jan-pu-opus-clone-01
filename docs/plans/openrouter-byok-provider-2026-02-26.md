# Plan: OpenRouter как дополнительный BYOK-провайдер

**Date:** 2026-02-26
**Status:** implemented
**Complexity:** medium

## Context

Пользователь хочет иметь выбор: использовать нативные ключи (Gemini, Anthropic, OpenAI) ИЛИ единый ключ OpenRouter для доступа ко всем Global-моделям. OpenRouter — OpenAI-compatible API, поддерживает все модели через один ключ. Не замена, а дополнение.

**Приоритет резолвинга ключей:** нативный BYOK → OpenRouter BYOK → нативный серверный (env) → OpenRouter серверный (env)

**Ограничение:** OpenRouter НЕ поддерживает Whisper STT. STT по-прежнему только через нативный OpenAI ключ.

## Changes (9 files)

### 1. `packages/types/src/byok.ts` — тип + реестр
- Добавлен `'openrouter'` в `ByokProvider` union
- Добавлена запись в `BYOK_PROVIDERS` (name: "OpenRouter", helpUrl, keyPrefix: "sk-or-")
- `LLM_PROVIDER_TO_BYOK` — без изменений (OpenRouter — fallback, не прямой провайдер)

### 2. `packages/config/src/llm-providers.ts` — маппинг моделей
- Добавлен `OPENROUTER_MODEL_MAP: Record<string, string>` (4 модели)
- Добавлен `OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'`

### 3. `packages/config/src/index.ts` — ре-экспорт
- Добавлен экспорт `OPENROUTER_MODEL_MAP` и `OPENROUTER_BASE_URL`

### 4. `packages/config/src/env.ts` + `.env.example`
- Добавлен `OPENROUTER_API_KEY: z.string().optional()` в env-схему
- Добавлен `OPENROUTER_API_KEY=` в `.env.example`

### 5. `apps/worker/lib/byok-cache.ts` — убран хардкод
- Заменены 2 захардкоженных массива `['gemini', 'openai', 'anthropic']` на `Object.keys(BYOK_PROVIDERS)`

### 6. `apps/worker/lib/llm-router.ts` — ядро (главное изменение)
- Конструктор: добавлен `openrouter?: string` в `globalKeys`
- `resolveByokKey()`: возвращает `{ apiKey, viaOpenRouter }` вместо просто `string`
- `createProviderClient()`: добавлен параметр `useOpenRouter`, case для OpenRouter baseURL
- `getClient()`: при отсутствии нативного серверного ключа — fallback на OpenRouter серверный
- `complete()`: при `viaOpenRouter` ремапит model name через `OPENROUTER_MODEL_MAP`
- Добавлен `hasNativeServerKey()` хелпер
- `transcribe()`: без изменений (OpenRouter не поддерживает STT)

### 7. `apps/worker/workers/llm-analyze.ts` — интеграция воркера
- Startup check: принимает `OPENROUTER_API_KEY` как альтернативу `GEMINI_API_KEY`
- Конструктор `LLMRouter`: передаёт `openrouter: process.env.OPENROUTER_API_KEY`
- BYOK loading: добавлен `peekByokKey(user.id, 'openrouter')` в Promise.all

### 8. `apps/web/lib/trpc/routers/user.ts` — API валидации
- `testByokKey`: добавлен `'openrouter'` в z.enum + case с тестом `GET /api/v1/models`
- `cacheByokKeys`: добавлен `openrouter: z.string().min(10).max(256).optional()`

## Files WITHOUT changes
- `apps/worker/workers/stt.ts` — STT не через OpenRouter
- `apps/web/components/settings/byok-keys-panel.tsx` — data-driven от BYOK_PROVIDERS, карточка появится автоматически
- `apps/web/lib/crypto/byok-vault.ts` — зависит от типа ByokProvider, поддержит автоматически

## Dependencies
- Нет новых пакетов
- Опциональная env-переменная `OPENROUTER_API_KEY`

## Verification
1. `npm run typecheck` — TS компиляция (no new errors)
2. UI: Settings → API Keys → карточка OpenRouter появится автоматически
3. Ввод ключа OpenRouter → "Проверить" → валидация через OpenRouter API
4. Запуск обработки с OpenRouter ключом → LLM лог: `viaOpenRouter: true`
