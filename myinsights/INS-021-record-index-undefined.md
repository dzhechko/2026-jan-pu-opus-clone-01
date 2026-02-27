# INS-021: Record<string, T> indexing возвращает T | undefined

**Status:** 🟢 Active
**Hits:** 1
**Date:** 2026-02-27

## Error Signatures
`QueueName | undefined`, `Type 'undefined' is not assignable`, `Argument of type 'string | undefined'`, `Record<string, QueueName>`

## Problem
TypeScript strict mode: `QUEUE_NAMES.VIDEO_RENDER` возвращает `QueueName | undefined`, хотя ключ явно задан. Компилятор не может доказать, что ключ существует.

## Root Cause
Тип `Record<string, QueueName>` позволяет любой строковый ключ → TypeScript считает, что произвольный ключ может быть `undefined`. Даже с `as const` тип Record "перебивает" const assertion.

## Solution
**Плохо:** `Record<string, QueueName>` + `!` assertion при каждом использовании

**Хорошо:** Конкретный тип объекта без Record:
```typescript
// Было:
export const QUEUE_NAMES: Record<string, QueueName> = { STT: 'stt', ... } as const;

// Стало:
export const QUEUE_NAMES = {
  STT: 'stt' as QueueName,
  LLM: 'llm' as QueueName,
  VIDEO_RENDER: 'video-render' as QueueName,
  // ...
};
```

Теперь `QUEUE_NAMES.STT` возвращает `QueueName` (не `QueueName | undefined`).

## Prevention
- Не используйте `Record<string, T>` для объектов с фиксированным набором ключей
- Если ключи известны заранее, используйте конкретный тип или `as const satisfies`
