# Research Findings: BYOK Key Management

## 1. Web Crypto API for Client-Side Encryption

### AES-GCM 256-bit
- **Browser support:** All modern browsers (Chrome 37+, Firefox 34+, Safari 11+, Edge 12+)
- **API:** `crypto.subtle.encrypt/decrypt` with `AES-GCM` algorithm
- **IV requirement:** 12 bytes (96 bits), MUST be unique per encryption operation
- **Auth tag:** 128 bits (default), provides integrity verification
- **Key usage:** `encrypt`, `decrypt` operations

### PBKDF2 Key Derivation
- **Purpose:** Derive a 256-bit AES key from user password
- **Parameters:**
  - Hash: SHA-256
  - Iterations: 100,000+ (OWASP recommends 600,000 for PBKDF2-SHA256 as of 2023)
  - Salt: 16 bytes random per user
- **Browser API:** `crypto.subtle.deriveKey` with `PBKDF2` algorithm

### IndexedDB Storage
- **Capacity:** 50MB+ in most browsers (Chrome: 60% of disk, Firefox: 2GB)
- **Persistence:** Survives page refreshes, but cleared by "Clear site data"
- **Security:** Same-origin policy, not accessible from other domains
- **Limitation:** Can be cleared by browser storage pressure in incognito mode

## 2. Existing Key Storage Patterns in КлипМейкер

### Server-side token encryption (`packages/crypto/src/token.ts`)
- Uses Node.js `crypto` module (not available in browser)
- AES-256-GCM with hex-encoded `iv:ciphertext:authTag` format
- 32-byte key from env var `PLATFORM_TOKEN_SECRET`
- Used for: VK OAuth tokens, platform connection tokens

### Architecture says:
- "Encrypted KeyVault: Web Crypto API + IndexedDB (platform API keys)" -- already planned in Architecture.md
- "BYOK (Global): encrypted in browser, proxied per-request" -- confirmed in Architecture.md
- Security rules: "PBKDF2 key derivation (100K+ iterations), auto-lock 30 min"

## 3. Key Transport Security

### Header-based approach
- Send decrypted key in custom header `X-BYOK-Key` per API request
- Requires HTTPS (TLS 1.3 enforced) -- header encrypted in transit
- Server extracts from header, uses for API call, discards immediately
- Header is NOT logged by nginx (configure `proxy_hide_header`)

### Alternative: Request body approach
- Send key as part of tRPC mutation payload
- More visible in code, but mixed with business data
- Harder to strip from logs

**Decision: Header-based approach** -- cleaner separation, easier to filter from logs, consistent with proxy patterns.

## 4. Provider Key Validation

### Gemini API Key
- **How to obtain:** https://aistudio.google.com/apikey
- **Test endpoint:** `GET https://generativelanguage.googleapis.com/v1beta/models?key=API_KEY`
- **Expected response:** 200 with list of models
- **Error on invalid:** 400 or 403

### OpenAI API Key
- **How to obtain:** https://platform.openai.com/api-keys
- **Test endpoint:** `GET https://api.openai.com/v1/models` with `Authorization: Bearer API_KEY`
- **Expected response:** 200 with model list
- **Error on invalid:** 401

### Anthropic API Key
- **How to obtain:** https://console.anthropic.com/settings/keys
- **Test endpoint:** `POST https://api.anthropic.com/v1/messages` with minimal payload
- **Expected response:** 200 (or use `GET /v1/models` if available)
- **Error on invalid:** 401

## 5. Competitor Analysis

### Opus Clip
- Does not offer BYOK
- All processing via platform keys
- Higher pricing as a result

### Descript
- No BYOK, but offers API access for Enterprise
- Keys managed server-side

### Eleven Labs
- Offers API key management in settings
- Keys stored server-side (encrypted at rest)
- No client-side encryption

**КлипМейкер differentiator:** True client-side encryption with zero server storage of plaintext keys. This is a stronger security posture than any competitor.

## 6. Security Considerations

### XSS Protection for Keys in Memory
- Master key stored in closure variable (not global/window)
- Use `Object.freeze()` on sensitive objects
- Clear key by overwriting with zeros before nulling
- Auto-lock timer uses `setTimeout` with visibility API

### IndexedDB Security
- Same-origin policy protects from cross-site access
- Browser extensions CAN access IndexedDB -- documented risk
- Encrypted data is useless without master key (which is in memory only)

### BYOK Key in Worker Context
- Worker receives BYOK key via job data or Redis
- **Problem:** Redis stores job data -- BYOK key would be persisted in Redis
- **Solution:** Do NOT pass BYOK key via BullMQ job data. Instead:
  - Client sends BYOK key to a tRPC endpoint
  - Endpoint makes the API call directly (synchronous proxy)
  - For async workers: store encrypted BYOK key in Redis with short TTL (5 min), worker decrypts with server-side key, uses, deletes

### Chosen Architecture: Hybrid Approach
For BYOK + async worker pipeline:
1. User unlocks vault, decrypts BYOK key in browser
2. Client sends BYOK key in `X-BYOK-Key` header to API
3. API re-encrypts with server-side `PLATFORM_TOKEN_SECRET` and stores in Redis with 5-min TTL keyed by `byok:{userId}:{provider}`
4. Worker reads encrypted key from Redis, decrypts with server key, uses for API call, deletes from Redis
5. Key never touches PostgreSQL, never logged, TTL ensures auto-cleanup

This is the only feasible approach because BullMQ workers are async and cannot receive data from HTTP headers at execution time.
