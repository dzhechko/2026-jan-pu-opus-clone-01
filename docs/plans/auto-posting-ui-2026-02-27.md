# Plan: Auto-Posting UI Components

**Date:** 2026-02-27
**Status:** implemented
**Complexity:** medium

## Context

Бэкенд авто-постинга полностью реализован (4 платформы, OAuth, воркеры, tRPC роутеры). Не хватает UI: подключение платформ в настройках и кнопка публикации в карточке клипа.

## Changes (4 files)

### 1. `apps/web/app/(dashboard)/dashboard/settings/platforms/page.tsx` — страница подключения платформ
- Список из 4 платформ: VK, Rutube, Дзен, Telegram
- Для каждой: статус (подключена/нет), кнопка подключить/отключить
- VK/Дзен: OAuth redirect через `platform.connect`
- Rutube/Telegram: форма ввода токена
- Кнопка "Проверить" для каждой подключённой платформы

### 2. `apps/web/app/(dashboard)/dashboard/settings/page.tsx` — ссылка на платформы
- Добавить секцию "Платформы для публикации" с ссылкой на `/dashboard/settings/platforms`

### 3. `apps/web/components/clips/publish-dialog.tsx` — диалог публикации
- Модальное окно с чекбоксами подключённых платформ
- Опция "Опубликовать сейчас" / "Запланировать" (datetime picker)
- Кнопка "Опубликовать" → `clip.publish` mutation
- Показать ограничения плана (какие платформы доступны)

### 4. `apps/web/components/clips/clip-card.tsx` — кнопка + статус публикаций
- Кнопка "Опубликовать" (для готовых клипов)
- Список публикаций с иконками платформ и статусами
- Кнопки "Повторить" для failed, "Отменить" для scheduled

## Files WITHOUT changes
- `apps/web/lib/trpc/routers/platform.ts` — бэкенд готов
- `apps/web/lib/trpc/routers/clip.ts` — publish/cancel/retry готовы
- `apps/worker/workers/publish.ts` — воркер готов
- `apps/worker/lib/providers/` — провайдеры готовы

## Verification
1. Settings → Платформы → подключить VK (OAuth redirect)
2. Settings → Платформы → ввести Telegram бот-токен → "Подключить"
3. Clip card → "Опубликовать" → выбрать платформу → публикация
4. Clip card → статус публикации отображается
5. Failed → кнопка "Повторить" работает
