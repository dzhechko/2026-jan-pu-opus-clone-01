# Solution Strategy: BYOK Key Management

## 1. First Principles Decomposition

### What is the fundamental problem?
Users need to provide API keys to the system, but the system must never persistently store those keys in plaintext on the server.

### Breaking it down:
1. **Key entry:** User types a plaintext API key
2. **Key protection:** Key must be encrypted at rest
3. **Key storage:** Encrypted key must persist across sessions
4. **Key usage:** Key must be available in plaintext for API calls
5. **Key transport:** Key must move from browser to API provider securely
6. **Key lifecycle:** Lock, unlock, delete, auto-expire

### Fundamental truths:
- Web Crypto API provides cryptographic primitives in the browser
- IndexedDB provides persistent storage in the browser
- HTTPS encrypts all data in transit
- AES-GCM provides both confidentiality and integrity
- PBKDF2 can derive a strong key from a weak password
- Memory is volatile -- cleared on page unload or timer expiry

## 2. Five Whys

**Problem:** Server stores API keys in plaintext

1. Why? Because the worker needs plaintext keys to call external APIs
2. Why can't the worker get keys another way? Because workers are async (BullMQ) and cannot receive HTTP headers
3. Why not store encrypted in Redis? We can -- with server-side encryption key and short TTL
4. Why not store in PostgreSQL? Because database backups would contain encrypted keys -- unnecessary risk
5. Why Redis with TTL? Because Redis data is transient, TTL auto-cleans, and we only need the key for the duration of one processing pipeline (~3 minutes)

**Root cause:** Async worker architecture requires temporary server-side storage.
**Solution:** Use Redis with server-side encryption and aggressive TTL (5 min).

## 3. SCQA Framework

**Situation:** КлипМейкер processes videos using AI providers (Gemini, OpenAI, Anthropic). Currently, all API keys are server-owned env vars.

**Complication:** Users on Global strategy want to use their own API keys to reduce costs and use existing credits. But the system must never persistently store user keys in plaintext. Additionally, workers are async (BullMQ) and cannot receive keys directly from HTTP requests.

**Question:** How can we let users provide their own keys while maintaining zero-trust server-side key management and supporting async worker processing?

**Answer:** Three-layer approach:
1. **Client-side vault** (AES-GCM + IndexedDB) for persistent encrypted storage
2. **Header transport** for synchronous API calls (test key endpoint)
3. **Redis ephemeral cache** (server-encrypted, 5-min TTL) for async worker pipeline

## 4. Game Theory Analysis

| Stakeholder | Interest | Outcome with BYOK |
|-------------|----------|-------------------|
| **User (Free/Start)** | Reduce costs, use own credits | Positive: saves money on Global |
| **User (Pro/Business)** | Premium experience, cost control | Positive: use own API credits |
| **Platform** | Reduce API costs, increase margins | Positive: users pay their own API costs |
| **Attacker** | Steal API keys | Neutral: encrypted storage is harder to exploit than plaintext |

**Nash equilibrium:** All parties benefit from BYOK. No player has incentive to deviate.

## 5. Second-Order Thinking

### First order: Users provide own keys
- Direct benefit: reduced platform costs

### Second order: Some users will have invalid/expired keys
- Need: robust validation and clear error messages
- Need: graceful fallback to server keys

### Third order: Users may share keys across accounts
- Risk: abuse of shared keys (low impact -- their keys, their problem)
- Mitigation: rate limiting per user (already exists)

### Fourth order: BYOK keys may have different rate limits than server keys
- Risk: user's key has lower rate limit, causing failures
- Mitigation: retry with server key on 429 errors from BYOK key

## 6. TRIZ Contradiction Resolution

### Contradiction 1: Server needs plaintext key but must not store it
- **Principle: Taking out** -- Extract the storage concern. Use volatile storage (Redis TTL) instead of persistent storage (PostgreSQL).
- **Principle: Dynamics** -- Key storage is temporary, not permanent. Redis TTL auto-cleans.

### Contradiction 2: Client encrypts key but server needs to decrypt
- **Principle: Nesting** -- Two layers of encryption. Client encrypts with user password (persistent in IndexedDB). Server re-encrypts with server key (ephemeral in Redis).
- **Principle: The other way round** -- Instead of server decrypting client encryption, client decrypts first, sends plaintext over HTTPS, server re-encrypts with own key.

### Contradiction 3: Auto-lock improves security but hurts UX
- **Principle: Partial action** -- 30-min timer is a partial action. Long enough for a typical session, short enough to limit exposure.
- **Principle: Feedback** -- Show countdown timer in UI, allow manual re-lock.

## 7. Solution Synthesis

### Architecture: Three-Layer Key Protection

```
Layer 1: Client-Side Vault (Persistent)
  User password → PBKDF2 → Master Key (in memory)
  API key → AES-GCM(Master Key) → Encrypted blob → IndexedDB
  Auto-lock: 30 min → Master Key = null

Layer 2: Transport (Transient)
  Client decrypts key → HTTPS header (X-BYOK-Key) → Server
  TLS 1.3 encrypts in transit

Layer 3: Server-Side Cache (Ephemeral, 5 min TTL)
  Server receives plaintext key → AES-256-GCM(PLATFORM_TOKEN_SECRET) → Redis
  Key: byok:{userId}:{provider}
  TTL: 300 seconds
  Worker reads → decrypts → uses → deletes from Redis
```

### Flow for Video Processing with BYOK:

1. User uploads video (strategy=global)
2. Client checks if BYOK keys exist and vault is unlocked
3. If yes: client decrypts keys, sends to API in `X-BYOK-Key` header
4. API re-encrypts keys with server key, stores in Redis (TTL 5 min)
5. API enqueues STT job as normal
6. STT worker checks Redis for `byok:{userId}:openai`
7. If found: decrypt, use for Whisper API call, delete from Redis
8. If not found: use server key (fallback)
9. Same pattern for LLM worker (Gemini, Anthropic keys)

### Flow for Key Test (Synchronous):

1. User enters key, clicks "Test"
2. Client sends key in `X-BYOK-Key` header to `POST /api/trpc/user.testByokKey`
3. Server extracts key, makes test API call to provider
4. Returns success/error to client
5. If success: client encrypts key and stores in IndexedDB
6. Key never persisted server-side
