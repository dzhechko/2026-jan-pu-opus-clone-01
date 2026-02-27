# INS-023: Platform metadata key mismatch — UI vs Backend

**Status:** 🟢 Active
**Hits:** 1
**Date:** 2026-02-27

## Error Signatures
`accountName undefined`, `metadata?.accountName`, `platform connected but no name shown`

## Problem
Платформы показывают "Подключено" но имя аккаунта не отображается. UI читает `metadata?.accountName`, но backend сохраняет данные под другими ключами.

## Root Cause
Рассогласование ключей metadata между backend и UI:

| Platform | Backend saves | UI reads (was) | UI reads (fixed) |
|----------|--------------|----------------|------------------|
| VK | `metadata.name` | `metadata.accountName` ❌ | `metadata.name` ✅ |
| Дзен | `metadata.publisherName` | `metadata.accountName` ❌ | `metadata.publisherName` ✅ |
| Rutube | `metadata.name` | `metadata.accountName` ❌ | `metadata.name` ✅ |
| Telegram | `metadata.chatTitle` | `metadata.accountName` ❌ | `metadata.chatTitle` ✅ |

## Solution
Исправить UI (`platforms/page.tsx`) чтобы читать правильные ключи:
```typescript
const accountName = metadata?.name ?? metadata?.publisherName ?? metadata?.chatTitle;
```

## Prevention
- При добавлении нового поля в metadata — сразу проверить, что UI читает тот же ключ
- Использовать единый интерфейс `PlatformMetadata` с типизированными ключами
