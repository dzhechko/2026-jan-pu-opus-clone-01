# Architecture: Auto-Posting

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        apps/web                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Settings UI  │  │  Clip Card   │  │  OAuth Callbacks   │  │
│  │ (platforms)  │  │  (publish)   │  │  /api/oauth/{plat} │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬─────────────┘  │
│         │                 │                  │                │
│  ┌──────▼─────────────────▼──────────────────▼─────────────┐ │
│  │              tRPC Routers                                │ │
│  │  platform.connect / platform.list / platform.disconnect  │ │
│  │  clip.publish (modified) / clip.cancelPublication        │ │
│  └──────────────────────┬──────────────────────────────────┘ │
└─────────────────────────┼────────────────────────────────────┘
                          │
                    ┌─────▼─────┐
                    │  BullMQ   │
                    │  (Redis)  │
                    └─────┬─────┘
                          │
┌─────────────────────────┼────────────────────────────────────┐
│                   apps/worker                                 │
│  ┌──────────────────────▼──────────────────────────────────┐ │
│  │                  publish worker                          │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │ │
│  │  │VKProvider│ │RutubeP.  │ │DzenP.    │ │TelegramP.  │ │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │               stats-collector worker                     │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## Component Breakdown

### 1. Platform Connection Router (`apps/web/lib/trpc/routers/platform.ts`)
- **connect**: Initiate OAuth or validate token, create PlatformConnection
- **list**: Return user's connected platforms
- **disconnect**: Delete connection, cancel pending publications
- **testConnection**: Verify token is still valid

### 2. OAuth Callback Routes (`apps/web/app/api/oauth/`)
- `/api/oauth/vk/callback` — VK OAuth code exchange
- `/api/oauth/dzen/callback` — Yandex OAuth code exchange
- These are Next.js API routes (not tRPC) because OAuth redirects need plain HTTP

### 3. Clip Router Mutations (modified `clip.publish` + new mutations)
- **clip.publish**: Validate clip status, plan permissions, platform connections, file size per platform; create Publication records; enqueue BullMQ jobs (token read from DB by worker, NOT passed in job data)
- **clip.cancelPublication**: Cancel scheduled publication, remove BullMQ job
- **clip.retryPublication**: Re-enqueue failed publication

### 4. Platform Providers (`apps/worker/lib/providers/`)
- `base.ts` — Abstract base class (already exists)
- `vk.ts` — VK API v5.199 (video.save + upload)
- `rutube.ts` — Rutube REST API
- `dzen.ts` — Yandex Zen Studio API
- `telegram.ts` — Telegram Bot API
- `index.ts` — Factory function (already exists)

### 5. Publish Worker (`apps/worker/workers/publish.ts`)
- Already exists (skeletal)
- Needs: token decryption, proper error handling, token refresh logic

### 6. Stats Collector (`apps/worker/workers/stats-collector.ts`)
- Already exists (skeletal)
- Needs: platform provider stats implementations, scheduling trigger

### 7. Token Encryption Module (`packages/crypto/` or `apps/web/lib/crypto.ts`)
- **New module** — does not exist yet, needs to be created
- Server-side AES-256-GCM encryption for OAuth tokens
- Uses `PLATFORM_TOKEN_SECRET` env var (32-byte hex) as key
- IV generated per-encryption (prepended to ciphertext as `iv:ciphertext:authTag`)
- Exported functions: `encrypt(plaintext, key): string`, `decrypt(encrypted, key): string`
- Used by: OAuth callbacks (web), token-based connection flows (web), publish worker (worker), stats worker (worker)
- Shared between apps/web and apps/worker → consider placing in packages/ for reuse

## Data Flow: Publish

```
User clicks "Опубликовать"
  → tRPC clip.publish mutation
    → Validate: clip ready, plan allows platform, connection exists
    → Create Publication records (status: publishing/scheduled)
    → Enqueue BullMQ jobs (one per platform)
      → publish worker picks up job
        → Decrypt token
        → Call platform API (upload + publish)
        → Update Publication (published + platformUrl)
      → On failure: BullMQ retries (3x, exponential)
      → On final failure: Publication.status = 'failed'
```

## Data Flow: OAuth Connection

```
User clicks "Подключить VK"
  → tRPC platform.connect({ platform: 'vk' })
    → Generate state, store in Redis (TTL 5min)
    → Return OAuth redirect URL
  → Browser redirects to VK
  → User authorizes
  → VK redirects to /api/oauth/vk/callback?code=...&state=...
    → Validate state from Redis
    → Exchange code for access_token
    → Encrypt token
    → Upsert PlatformConnection
    → Redirect to /dashboard/settings?connected=vk
```

## Security Architecture

### Token Encryption
- OAuth tokens encrypted with AES-256-GCM
- Encryption key from `PLATFORM_TOKEN_SECRET` env var
- IV generated per-encryption (prepended to ciphertext)
- Decryption only in worker process memory

### OAuth State Validation
- CSRF protection: random state stored in Redis (5min TTL)
- State validated on callback before token exchange
- Prevents authorization code injection

### Platform API Access
- Tokens never logged (even partially)
- Worker decrypts in-memory, uses, discards
- Token refresh on 401 (VK, Дзен)
- Expired connections flagged in UI

## Technology Choices

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Queue | BullMQ | Already used, supports delay/retry |
| Token encryption | Node.js crypto (AES-GCM) | Server-side, no browser dependency |
| OAuth state | Redis (TTL) | Fast, auto-expiring |
| File upload | Node.js streams | Memory-efficient for large files |
| VK API | REST v5.199 | Latest stable version |
| Telegram API | Bot API via HTTPS | Standard approach |

## Consistency with Project Architecture

- **Distributed Monolith**: tRPC routes in web, workers in worker app, shared via packages
- **Communication**: Via PostgreSQL + Redis queue (no HTTP inter-service)
- **Types**: Shared via `@clipmaker/types`
- **Queue**: Via `@clipmaker/queue`
- **Logging**: Pino in workers, console in web routes
- **Auth**: JWT middleware (tRPC routes), OAuth callbacks bypass JWT (added to PUBLIC_PATH)
