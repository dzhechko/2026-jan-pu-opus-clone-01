# Completion: BYOK Key Management

## Deployment Plan

### Pre-Deployment Checklist

- [ ] All unit tests pass (byok-vault, byok-cache, llm-router BYOK)
- [ ] Integration tests pass (vault flow, tRPC endpoints, worker pipeline)
- [ ] E2E tests pass (Playwright: add key, test, delete, auto-lock)
- [ ] Security review: no key leaks in logs, no persistent server storage
- [ ] PLATFORM_TOKEN_SECRET env var set on production VPS
- [ ] Redis configured and accessible from workers
- [ ] nginx config updated to strip X-BYOK-Key headers from logs
- [ ] CSP headers verified (no eval, strict script-src)
- [ ] HTTPS enforced on all routes

### Deployment Sequence

1. **Database:** No schema changes required (BYOK keys are client-side)
2. **Packages:** Deploy `packages/crypto` (no changes, existing token.ts reused)
3. **Worker:** Deploy updated `llm-router.ts` and new `byok-cache.ts`
4. **API:** Deploy updated tRPC routes (testByokKey, cacheByokKeys)
5. **Web:** Deploy new vault module, settings UI, and BYOK panel
6. **Nginx:** Update config to strip BYOK headers from logs

### Rollback Plan

BYOK is an additive feature with no database migrations. Rollback:
1. Revert web deployment (removes vault UI -- users cannot add new keys)
2. Revert API deployment (removes tRPC endpoints)
3. Revert worker deployment (removes BYOK cache reads -- workers use server keys)
4. Existing encrypted keys in IndexedDB are orphaned but harmless
5. Redis BYOK cache entries expire via TTL within 5 minutes

No data loss, no schema changes, instant rollback.

## Monitoring & Alerting

### Key Metrics to Track

| Metric | Type | Alert Threshold |
|--------|------|----------------|
| `byok.key_stored` | Counter | N/A (adoption tracking) |
| `byok.key_tested` | Counter | N/A |
| `byok.key_test_failed` | Counter | >50% failure rate in 1 hour |
| `byok.vault_locked` | Counter | N/A |
| `byok.vault_unlock_failed` | Counter | >10 per user per hour |
| `byok.redis_cache_miss` | Counter | >30% miss rate in 1 hour |
| `byok.redis_cache_set` | Counter | N/A |
| `byok.fallback_to_server_key` | Counter | >20% fallback rate in 1 hour |
| `byok.provider_api_error` | Counter | >5 per minute |

### Log Events

```json
{ "event": "byok_key_cached", "userId": "...", "provider": "gemini", "ttl": 300 }
{ "event": "byok_key_retrieved", "userId": "...", "provider": "gemini" }
{ "event": "byok_key_expired", "userId": "...", "provider": "gemini" }
{ "event": "byok_fallback_server_key", "userId": "...", "provider": "gemini", "reason": "401" }
{ "event": "byok_key_test_success", "provider": "gemini" }
{ "event": "byok_key_test_failed", "provider": "gemini", "error": "401" }
```

**CRITICAL:** Never log the actual BYOK key value. Only log provider, userId, and status.

## Logging Strategy

### What to Log
- BYOK key operations (cache, retrieve, delete) with userId and provider
- BYOK key test results (success/failure)
- BYOK fallback events (BYOK key rejected, using server key)
- Vault lock/unlock events (client-side, sent via analytics)

### What NOT to Log
- The BYOK key itself (even partially)
- The X-BYOK-Key or X-BYOK-Keys header values
- Any decrypted key material
- The user's vault password

### Implementation
- Add logger filter in `apps/worker/lib/logger.ts` to strip sensitive headers
- nginx `log_format` excludes X-BYOK-Key
- tRPC middleware strips BYOK headers from error context

## Handoff Checklists

### Developer Handoff
- [ ] Code reviewed by senior engineer (security focus)
- [ ] BYOK vault module documented with JSDoc
- [ ] tRPC endpoints have Zod validation schemas
- [ ] Worker modifications backward-compatible (no BYOK = use server key)
- [ ] Integration tests demonstrate full pipeline with BYOK

### QA Handoff
- [ ] Test scenarios documented in this Refinement.md
- [ ] BDD scenarios mapped to test files
- [ ] Manual test plan for edge cases (E1-E16)
- [ ] Browser compatibility matrix: Chrome, Firefox, Safari, Edge
- [ ] Mobile browser testing: Chrome Android, Safari iOS

### Ops Handoff
- [ ] PLATFORM_TOKEN_SECRET in env (must be 64 hex chars, 32 bytes)
- [ ] Redis health check includes BYOK key patterns
- [ ] nginx log format excludes BYOK headers
- [ ] Monitoring dashboards added for BYOK metrics
- [ ] Alert rules configured for BYOK failure rates
