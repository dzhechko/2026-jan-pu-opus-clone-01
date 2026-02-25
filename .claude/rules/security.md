# Security Rules

## API Input Validation
- ALL API inputs validated with Zod schemas — no exceptions
- File uploads: magic bytes check (not just MIME type)
- Max file size: 4GB (nginx + API level)
- Rate limiting: 100 req/min per user, 10 uploads/hour

## Authentication
- JWT: 15 min access (HttpOnly) + 7d refresh (secure cookie)
- VK OAuth: minimal scopes (video, wall only)
- Password: bcrypt, min 8 chars, email verification required
- 5 auth attempts/min rate limit

## API Keys (Platform & LLM)
- Platform keys: AES-GCM 256-bit, client-side IndexedDB only
- Server NEVER stores plaintext keys — pass-through per-request
- PBKDF2 key derivation (100K+ iterations), auto-lock 30 min
- Cloud.ru key: server-side env var (never exposed)
- BYOK (Global): encrypted in browser, proxied per-request

## Data Residency
- RU strategy: all data in RF (Cloud.ru + Russian VPS)
- Global strategy: video stays in RF, transcripts to US/EU (user consents)

## Headers & DB
- HTTPS TLS 1.3 + HSTS, CSP, X-Frame-Options: DENY
- Prisma ORM only (no raw SQL without review)
- Daily encrypted backups to S3
