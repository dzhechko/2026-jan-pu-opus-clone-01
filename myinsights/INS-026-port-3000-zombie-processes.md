# INS-026: Port 3000 не освобождается — зомби next-server процессы

**Status:** 🟢 Active | **Hits:** 5 | **Created:** 2026-02-27

## Error Signatures
- `Port 3000 is in use by an unknown process, using available port 3001 instead`
- `EADDRINUSE: address already in use :::3000`
- Next.js стартует на 3001, 3002, 3003... вместо 3000
- `lsof -ti :3000` возвращает пустоту, но порт занят

## Root Cause
В Codespace при `kill` родительского процесса (`npm exec next dev`) дочерний `next-server` (Node.js) не умирает. Причины:
1. `kill PID` (SIGTERM) — npm wrapper умирает, но next-server остаётся сиротой
2. `lsof -ti` иногда не видит процесс из-за особенностей Codespace (Linux namespaces)
3. При повторном `npm run dev` — Next.js видит занятый порт и молча выбирает следующий
4. Так накапливается 3-4 зомби-процессов на портах 3000-3003

## Solution
Надёжный алгоритм завершения — использовать `ss` вместо `lsof`, убивать через `-9`:

```bash
# 1. Найти ВСЕ next-server процессы (ss надёжнее lsof в Codespace)
ss -tlnp | grep '300[0-9]'

# 2. Убить все next-server PID через SIGKILL (SIGTERM не работает)
ss -tlnp | grep 'next-server' | grep -oP 'pid=\K[0-9]+' | xargs kill -9 2>/dev/null

# 3. Подождать и проверить
sleep 2 && ss -tlnp | grep 300 || echo "All ports clear"

# 4. Запустить свежий dev server
npm run dev --prefix apps/web
```

**Ключевое:** `kill -9` (SIGKILL), НЕ `kill` (SIGTERM). И `ss -tlnp` вместо `lsof`.

## One-liner
```bash
ss -tlnp | grep 'next-server' | grep -oP 'pid=\K[0-9]+' | xargs kill -9 2>/dev/null; sleep 2 && npm run dev --prefix apps/web
```

## Prevention
- Не использовать `kill` без `-9` для next-server в Codespace
- При перезапуске dev server — всегда сначала убить ВСЕ next-server процессы
- Не полагаться на `lsof` — использовать `ss -tlnp`
