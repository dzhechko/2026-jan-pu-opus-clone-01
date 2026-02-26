# PRD: BYOK (Bring Your Own Key) for Global AI Providers

## Status
- **Priority:** P1 (enables cost-free Global strategy usage)
- **Phase:** Planning
- **Owner:** TBD
- **Last updated:** 2026-02-26

---

## 1. Problem Statement

When users select the "Global" AI provider strategy (Gemini, Claude, OpenAI), all API calls are billed against server-side API keys owned by the platform. This creates two problems:

1. **Cost burden on the platform:** Global provider costs (~55 rub/60 min) are significantly higher than Cloud.ru (~21 rub/60 min). Every Global-strategy user erodes platform margins.
2. **User demand for own keys:** Power users who already have Google AI Studio, OpenAI, or Anthropic API credits want to use their existing allocations rather than paying through the platform markup.

Currently there is no mechanism for users to provide their own API keys. The only alternative is Cloud.ru (server-side), which keeps all data in Russia but limits users to Russian-hosted models.

Without BYOK:
- Users who prefer Global AI pay platform rates with no opt-out.
- Users with existing API credits cannot leverage them.
- Platform absorbs all Global provider API costs in subscription pricing.

## 2. Target Users

| Attribute | Detail |
|-----------|--------|
| Persona | Russian-speaking course creators who prefer Global AI models |
| Technical level | Moderately technical -- can obtain API keys from Google AI Studio or OpenAI Dashboard |
| Motivation | Reduce costs, use existing API credits, access specific model versions |
| Plans | All plans (free, start, pro, business) -- BYOK always benefits the platform |

## 3. Solution Overview

Allow users to optionally provide their own API keys for Global AI providers (Gemini, OpenAI, Anthropic). Keys are:

1. **Encrypted client-side** using AES-GCM 256-bit via Web Crypto API
2. **Stored in IndexedDB** -- never on the server
3. **Decrypted in memory** when needed, sent per-request to the backend
4. **Proxied through backend** -- server receives the key, makes the API call, discards the key immediately
5. **Auto-locked after 30 minutes** of inactivity (master key cleared from memory)

The tier selection algorithm still applies -- Free/Start users with BYOK are still limited to Tier 0-1 models. BYOK only replaces which API key is used, not which models are available.

## 4. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| BYOK adoption rate | 15% of Global-strategy users within 30 days | Analytics event |
| Key validation success | >95% first-attempt success for valid keys | Test call pass rate |
| Vault lock compliance | 100% auto-lock after 30 min | Client-side timer |
| Zero plaintext key storage | 0 keys ever persisted server-side | Security audit |
| Platform cost reduction | 30% reduction in Global provider API costs | Billing dashboard |

## 5. Scope

### In Scope (MVP)
- Client-side encryption vault (AES-GCM 256-bit, PBKDF2 key derivation)
- IndexedDB storage for encrypted keys
- Settings UI: add, test, delete keys for Gemini, OpenAI, Anthropic
- Key validation via test API call (proxied through backend)
- Auto-lock after 30 min inactivity
- Backend pass-through: accept BYOK key per-request, use for API call, discard
- Fallback to server key when BYOK key fails or is absent

### Out of Scope
- Cloud.ru BYOK (always server-side, users never provide their own Cloud.ru key)
- Key rotation reminders
- Key usage analytics per user
- Encrypted key export/import backup
- Team-shared BYOK keys (each user has their own)
- BYOK for platform keys (VK, Telegram) -- handled by existing EncryptedKeyVault

## 6. User Stories

See Specification.md for full user stories and acceptance criteria.

## 7. Dependencies

| Dependency | Status | Risk |
|------------|--------|------|
| Auth system (JWT cookies) | Implemented | None |
| Global provider config | Implemented (`packages/config/src/llm-providers.ts`) | None |
| LLM Router | Implemented (`apps/worker/lib/llm-router.ts`) | Needs modification |
| STT Worker | Implemented (`apps/worker/workers/stt.ts`) | Needs modification |
| Settings page | Implemented (`apps/web/app/(settings)/settings/page.tsx`) | Needs new tab |
| Web Crypto API | Browser-native | Requires HTTPS |

## 8. Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| User enters key in HTTP (not HTTPS) | Low | Critical | Enforce HTTPS check before vault operations |
| Master key lost (browser cleared) | Medium | Medium | User must re-enter password; keys remain encrypted |
| BYOK key leaked via XSS | Low | Critical | CSP headers, DOMPurify, no eval(), strict input validation |
| Worker logs include BYOK key | Medium | Critical | Logging filter: never log request headers containing keys |
| IndexedDB quota exceeded | Low | Low | Keys are tiny (~200 bytes each), warn if storage unavailable |
