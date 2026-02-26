# Refinement: BYOK Key Management

## Edge Cases Matrix

| # | Edge Case | Expected Behavior | Test Priority |
|---|-----------|-------------------|---------------|
| E1 | User enters key while vault is locked | Prompt for password before storing | High |
| E2 | User clears browser data (IndexedDB wiped) | All encrypted keys lost; user must re-enter | Medium |
| E3 | User enters same key twice | Overwrite previous encryption (new IV) | Low |
| E4 | User opens multiple tabs | Only one tab controls vault state (last-write-wins for IndexedDB) | Medium |
| E5 | BYOK key expires mid-processing | Worker receives 401, falls back to server key, notifies user | High |
| E6 | Redis TTL expires before worker reads key | Worker uses server key (silent fallback) | High |
| E7 | User switches from Global to RU strategy with stored BYOK keys | Keys remain in IndexedDB but are not used; UI hides BYOK section | Medium |
| E8 | User's password changed (vault password derived from account password) | Old encrypted keys become unreadable; user must re-enter keys | High |
| E9 | IndexedDB not available (private browsing, browser restriction) | Show warning, disable BYOK features | Medium |
| E10 | HTTPS not available (dev environment) | Block vault operations, show "BYOK requires HTTPS" | Low |
| E11 | Concurrent video processing with BYOK | Redis caches keys once, workers share from Redis | Medium |
| E12 | User provides Gemini key for STT (wrong provider) | Validation detects provider mismatch; show error | Medium |
| E13 | Server key is also missing (no fallback) | Error: "No API key available for provider X" | High |
| E14 | BYOK key has insufficient permissions (e.g., no Whisper access on OpenAI) | API returns 403, fallback to server key | Medium |
| E15 | Redis server down | BYOK cache unavailable, use server keys | High |
| E16 | PLATFORM_TOKEN_SECRET env var missing | Server cannot encrypt/decrypt BYOK keys for Redis; fail fast | High |

## Testing Strategy

### Unit Tests

| Test | Module | Framework |
|------|--------|-----------|
| PBKDF2 key derivation | `byok-vault.ts` | Vitest + jsdom (Web Crypto polyfill) |
| AES-GCM encrypt/decrypt round-trip | `byok-vault.ts` | Vitest + jsdom |
| Different password fails decrypt | `byok-vault.ts` | Vitest + jsdom |
| Auto-lock timer fires | `byok-vault.ts` | Vitest + fake timers |
| IndexedDB store/get/delete | `byok-vault.ts` | Vitest + fake-indexeddb |
| Redis BYOK cache set/get/delete | `byok-cache.ts` | Vitest + testcontainers (Redis) |
| Redis TTL expiry | `byok-cache.ts` | Vitest + testcontainers |
| LLM Router with BYOK key | `llm-router.ts` | Vitest + MSW |
| LLM Router BYOK fallback | `llm-router.ts` | Vitest + MSW |
| Server-side encrypt/decrypt with token.ts | `byok-cache.ts` | Vitest |

### Integration Tests

| Test | Scope | Framework |
|------|-------|-----------|
| Full vault flow: unlock -> encrypt -> store -> decrypt | Client vault | Vitest + jsdom |
| Test BYOK key endpoint (valid key) | tRPC + proxy | Vitest + MSW |
| Test BYOK key endpoint (invalid key) | tRPC + MSW | Vitest + MSW |
| Cache BYOK keys -> worker reads -> API call | Worker + Redis | Vitest + testcontainers |
| BYOK key fails -> fallback to server key | Worker + Redis + MSW | Vitest + testcontainers |

### E2E Tests

| Test | Flow | Framework |
|------|------|-----------|
| Add Gemini key, verify, see "connected" status | Settings UI | Playwright |
| Remove key, see "not connected" status | Settings UI | Playwright |
| Vault auto-locks after 30 min | Settings UI + timer | Playwright (with clock control) |
| Process video with BYOK key | Full pipeline | Playwright + MSW (mock provider APIs) |

### BDD Scenarios (Gherkin)

```gherkin
Feature: BYOK Key Vault

  Scenario: Successful key storage
    Given I am on the API Keys settings page
    And the vault is unlocked
    When I enter a valid Gemini API key
    And I click "Verify"
    Then the key is tested via proxy API call
    And the key is encrypted with AES-GCM 256-bit
    And stored in IndexedDB
    And the Gemini card shows "Connected"

  Scenario: Wrong vault password
    Given I am on the API Keys settings page
    And the vault is locked
    When I enter an incorrect vault password
    Then I see "Wrong password" error
    And the vault remains locked
    And after 5 failed attempts I see "Too many attempts"

  Scenario: Auto-lock clears master key
    Given the vault has been unlocked for 30 minutes
    And no user activity has occurred
    Then the master key is cleared from memory
    And I see "Vault locked" notification
    And attempting to view key requires re-entering password

  Scenario: BYOK key rejected during processing
    Given I have a stored Gemini key that has been revoked
    And I upload a video with Global strategy
    When the LLM worker tries to use my Gemini key
    Then the API returns 401
    And the worker retries with the platform's server key
    And I am notified that my key was rejected

  Scenario: Redis cache miss
    Given I cached BYOK keys 6 minutes ago (TTL expired)
    When the worker processes my video
    Then the worker finds no BYOK key in Redis
    And uses the platform's server key
    And processing completes normally
```

## Performance Optimizations

| Optimization | Benefit | Cost |
|-------------|---------|------|
| Cache OpenAI client per BYOK key hash | Avoid creating new client per request | Memory (negligible, client is lightweight) |
| PBKDF2 100K iterations (not 600K) | ~200ms instead of ~1.2s unlock time | Slightly lower security margin (still above OWASP minimum) |
| Redis pipeline for multi-key cache | Single round-trip instead of 3 | None |
| IndexedDB batch read for all keys | Single transaction | None |

## Security Hardening

| Measure | Implementation |
|---------|---------------|
| BYOK key not in logs | Logger middleware strips X-BYOK-Key header from request logs |
| CSP headers | `script-src 'self'` prevents XSS from accessing vault |
| No eval() | Strict CSP, no dynamic code execution |
| Input sanitization | DOMPurify for any user-displayed text from API responses |
| Rate limiting on testByokKey | 10 test calls per minute per user |
| HTTPS enforcement | Web Crypto API naturally requires secure context |
| nginx header stripping | `proxy_hide_header X-BYOK-Key` in response |

## Technical Debt Items

| Item | Priority | Reason |
|------|----------|--------|
| BroadcastChannel multi-tab vault sync | Low | v2 -- prevents race conditions across tabs |
| Encrypted key export/import backup | Low | v2 -- user recovery if browser data cleared |
| BYOK key usage analytics | Low | v2 -- show users how much they save |
| Key rotation reminders | Low | v2 -- notify users to rotate keys periodically |
| Argon2id instead of PBKDF2 | Medium | Better resistance to GPU attacks (requires WebAssembly polyfill) |
