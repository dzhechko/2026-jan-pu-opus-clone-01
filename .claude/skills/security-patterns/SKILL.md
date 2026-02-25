# Security Patterns: Encrypted Client-Side Key Storage

## Overview
Platform API keys encrypted in browser with AES-GCM 256-bit. Server never stores plaintext.

## Flow
```
User enters key → Web Crypto API: AES-GCM encrypt → IndexedDB store
When needed: decrypt in memory → send per-request → backend proxies → discard
Auto-lock after 30 min → master key cleared from memory
```

## Implementation
```typescript
// Derive master key
const keyMaterial = await crypto.subtle.importKey('raw', encode(password), 'PBKDF2', false, ['deriveKey'])
const masterKey = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
  keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
)
// Encrypt
const iv = crypto.getRandomValues(new Uint8Array(12))
const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, masterKey, encode(apiKey))
// Store in IndexedDB
await db.put('platform_keys', { platform, encrypted, iv, salt })
```

## Validation
Test API call on save → immediate ✓ or ✗ feedback.

## BYOK Flow
User enters Gemini/Claude key → encrypted same way → decrypt per-request → proxy → discard.
