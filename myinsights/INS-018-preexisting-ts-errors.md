# INS-018: Pre-existing TS errors — React 19 useRef, BufferSource, Record index

**Status:** 🟢 Active | **Hits:** 1 | **Created:** 2026-02-27

## Error Signatures
- `Expected 1 arguments, but got 0` on `useRef<...>()`
- `Uint8Array<ArrayBufferLike> is not assignable to BufferSource`
- `QueueName | undefined is not assignable to QueueName`

## Root Cause

### 1. useRef requires initial value (React 19)
React 19 types changed `useRef<T>()` to require an argument. Previously `useRef<T>()` with no args was allowed.

**Fix:** `useRef<T>(undefined)` or `useRef<T>(null)`

### 2. Uint8Array vs BufferSource (TypeScript 5.x)
TypeScript 5.x made `Uint8Array` generic: `Uint8Array<ArrayBufferLike>`. But Web Crypto's `BufferSource` expects `ArrayBufferView<ArrayBuffer>` (not `ArrayBufferLike`). `SharedArrayBuffer` causes the mismatch.

**Fix:** Cast explicitly: `salt as BufferSource`

### 3. Record<string, T> index returns T | undefined
`Record<string, QueueName>` means accessing `QUEUE_NAMES.STT` returns `QueueName | undefined` under `noUncheckedIndexedAccess` or strict mode, because any string key might not exist.

**Fix:** Non-null assertion: `QUEUE_NAMES.STT!` (safe when we control the constant)

## Files Fixed
- `apps/web/components/transcript/transcript-viewer.tsx` — useRef(undefined)
- `apps/web/lib/crypto/byok-vault.ts` — salt as BufferSource
- `apps/web/lib/trpc/routers/video.ts` — QUEUE_NAMES.STT!, QUEUE_NAMES.VIDEO_DOWNLOAD!
