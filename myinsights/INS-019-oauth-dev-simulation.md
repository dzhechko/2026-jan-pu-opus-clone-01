# INS-019: OAuth невозможен в Codespace — dev-mode заглушка

**Status:** 🟢 Active
**Hits:** 1
**Date:** 2026-02-27

## Error Signatures
`Конфигурация VK OAuth не настроена`, `Конфигурация Yandex/Дзен OAuth не настроена`, `VK_PUBLISH_CLIENT_ID`, `YANDEX_CLIENT_ID`

## Problem
При попытке подключить платформы (VK, Дзен) в Codespace получаем ошибки "Конфигурация OAuth не настроена". Реальный OAuth невозможен без публичного redirect URL.

## Root Cause
OAuth flow требует redirect URL, доступного извне. В Codespace/localhost это невозможно без ngrok/tunneling. Env vars `VK_PUBLISH_CLIENT_ID`, `VK_PUBLISH_REDIRECT_URI`, `YANDEX_CLIENT_ID`, `YANDEX_REDIRECT_URI` отсутствуют.

## Solution
Добавлена dev-mode заглушка в `apps/web/lib/trpc/routers/platform.ts`:
- Когда `NODE_ENV === 'development'` и OAuth creds отсутствуют → `simulateOAuthConnect()` создаёт фейковый `PlatformConnection` в БД с зашифрованным мок-токеном
- UI показывает синий баннер "Dev mode: подключения симулированы" + бейдж "(dev)" на аккаунтах
- В production требуются реальные OAuth credentials

## Prevention
- Всегда проверять наличие OAuth env vars перед redirect
- Документировать dev vs prod различия в README
