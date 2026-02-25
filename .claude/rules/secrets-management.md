# Secrets Management (Client-Side Encryption)

## Principle
User enters keys via UI → encrypted in browser → server never stores them.

## UX
- Settings > Integrations: clear labels, masked fields, "Где взять ключ?" links
- "Проверить" button → test API call → immediate feedback
- View (masked), delete, update, encrypted backup

## Security
- AES-GCM 256-bit (Web Crypto API)
- PBKDF2 from user password (100K+ iterations)
- IndexedDB for encrypted data, master key in memory only
- Auto-lock after 30 min inactivity

## Never
- Send plaintext keys to backend for storage
- Log keys (even partially)
- Store in localStorage/sessionStorage
- Include in error reports or analytics
