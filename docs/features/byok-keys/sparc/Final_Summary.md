# Final Summary: BYOK Key Management

## Executive Summary

The BYOK (Bring Your Own Key) feature enables users to provide their own API keys for Global AI providers (Gemini, OpenAI, Anthropic). Keys are encrypted client-side using AES-GCM 256-bit via Web Crypto API, stored in IndexedDB, and proxied per-request through the backend. The server never persistently stores user API keys in plaintext.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Client-side encryption | AES-GCM 256-bit (Web Crypto API) | Browser-native, no dependencies, strongest symmetric encryption |
| Key derivation | PBKDF2 (100K iterations, SHA-256) | Standard, fast enough for UX (~200ms), secure |
| Client-side storage | IndexedDB | Persistent, large capacity, same-origin isolated |
| Key transport | HTTPS custom header (X-BYOK-Key) | Clean separation, easy to filter from logs |
| Worker key access | Redis cache (encrypted, 5-min TTL) | BullMQ workers are async, cannot receive HTTP headers |
| Server-side encryption | Reuse `packages/crypto/src/token.ts` | Existing AES-256-GCM, code reuse |
| Auto-lock timeout | 30 minutes | Balance between security and UX |
| BYOK availability | All plans | Benefits platform (user pays API costs) |
| Tier restrictions | Still enforced | Free/Start limited to Tier 0-1 regardless of BYOK |
| Fallback behavior | Server key on BYOK failure | Graceful degradation, no user impact |

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/lib/crypto/byok-vault.ts` | Web Crypto vault: derive key, encrypt, decrypt, IndexedDB ops, auto-lock |
| `apps/web/components/settings/byok-keys-panel.tsx` | Settings UI: provider cards, key input, test, delete |
| `apps/web/app/(settings)/settings/api-keys/page.tsx` | API Keys settings page |
| `apps/worker/lib/byok-cache.ts` | Redis BYOK cache: get, peek, clear |

## Files to Modify

| File | Change |
|------|--------|
| `apps/worker/lib/llm-router.ts` | Accept optional BYOK keys, create ephemeral clients, add fallback logic |
| `apps/worker/workers/stt.ts` | Read BYOK OpenAI key from Redis cache for Whisper calls |
| `apps/worker/workers/llm-analyze.ts` | Read BYOK keys from Redis cache, pass to LLM Router |
| `apps/worker/lib/stt-client.ts` | Accept optional BYOK key parameter |
| `apps/web/lib/trpc/routers/user.ts` | Add testByokKey and cacheByokKeys mutations |
| `apps/web/app/(settings)/settings/page.tsx` | Add link to API Keys section |
| `packages/types/src/index.ts` | Export BYOK types |

## Security Guarantees

1. **No plaintext key storage on server:** Redis cache is encrypted with server key, TTL 5 min
2. **No key in logs:** Logger filter strips X-BYOK-Key headers, nginx config excludes them
3. **No key in database:** PostgreSQL never sees BYOK keys
4. **Encrypted at rest (client):** AES-GCM 256-bit in IndexedDB
5. **Encrypted in transit:** HTTPS/TLS 1.3
6. **Auto-cleanup:** Redis TTL ensures keys disappear even if pipeline crashes
7. **Auto-lock:** 30-min inactivity timer clears master key from memory

## Risk Assessment

| Risk | Mitigation | Residual Risk |
|------|------------|--------------|
| XSS steals keys from memory | CSP headers, DOMPurify, no eval() | Low |
| Browser extension accesses IndexedDB | Encrypted data useless without master key | Low |
| Redis compromise | Keys encrypted with PLATFORM_TOKEN_SECRET | Low |
| User forgets vault password | Must re-enter API keys (no recovery) | Medium |
| Browser clears storage | Must re-enter API keys | Medium |

## Implementation Order

1. `packages/types` -- BYOK type definitions
2. `apps/web/lib/crypto/byok-vault.ts` -- Core vault module (can be tested independently)
3. `apps/worker/lib/byok-cache.ts` -- Redis cache module
4. `apps/web/lib/trpc/routers/user.ts` -- tRPC endpoints
5. `apps/worker/lib/llm-router.ts` -- BYOK-aware routing
6. `apps/worker/workers/stt.ts` + `llm-analyze.ts` -- Worker integration
7. `apps/web/components/settings/byok-keys-panel.tsx` -- Settings UI
8. `apps/web/app/(settings)/settings/api-keys/page.tsx` -- Page
9. Tests (parallel with implementation)

## Estimated Effort

| Component | Estimate |
|-----------|----------|
| BYOK Vault (client-side crypto) | 4-6 hours |
| Redis cache module | 1-2 hours |
| tRPC endpoints | 2-3 hours |
| LLM Router modifications | 2-3 hours |
| Worker integration | 2-3 hours |
| Settings UI | 3-4 hours |
| Tests | 4-6 hours |
| **Total** | **18-27 hours** |
