# Auth Feature — Architecture

## System Context

Auth is a core subsystem within the КлипМейкер distributed monolith. It lives entirely inside `apps/web` (Next.js 15) and relies on shared monorepo packages for data access and configuration.

### Integration Points

| Dependency | Role | Location |
|------------|------|----------|
| `apps/web` (Next.js API Routes + tRPC) | Hosts auth endpoints and middleware | Monorepo app |
| `packages/db` (Prisma / PostgreSQL 16) | User storage, email uniqueness, platform connections | Shared package |
| Redis 7 | Rate limiting counters, session invalidation broadcast | Docker Compose service |
| NextAuth.js v4 | Auth framework — providers, callbacks, JWT lifecycle | Library inside `apps/web` |
| BullMQ Workers (`apps/worker`) | Consume JWTs for job authorization (read-only) | Separate container |

Auth does **not** introduce new Docker services. It extends the existing `web` container and uses the existing `redis` and `postgres` containers.

---

## Component Architecture

```
apps/web/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx          — Login form (email + VK OAuth)
│   │   ├── register/page.tsx       — Registration form
│   │   ├── verify-email/page.tsx   — Email verification handler
│   │   └── reset-password/page.tsx — Password reset form
│   └── api/
│       └── auth/[...nextauth]/route.ts — NextAuth handler
├── lib/
│   ├── auth/
│   │   ├── options.ts       — NextAuth config (providers, callbacks, JWT)
│   │   ├── vk-provider.ts   — Custom VK OAuth provider
│   │   └── rate-limit.ts    — Redis-backed auth rate limiter
│   └── trpc/routers/
│       └── user.ts          — register, me, updateSettings mutations
└── middleware.ts             — JWT validation, refresh token rotation
```

### Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| `options.ts` | Central NextAuth configuration: JWT callbacks, session shape, provider list |
| `vk-provider.ts` | Custom OAuth provider for VK (vk.com/dev), maps VK profile to user model |
| `rate-limit.ts` | Redis INCR + TTL pattern — 5 auth attempts per minute per IP |
| `user.ts` (tRPC router) | `register` mutation (Zod validation, bcrypt, DB insert, verification email), `me` query, `updateSettings` |
| `middleware.ts` | Runs on every request — validates JWT, rotates refresh token if access expired, redirects unauthenticated users |
| `[...nextauth]/route.ts` | NextAuth catch-all — credentials provider (email+password) and VK OAuth |

---

## Database Changes

The User model from the project scaffold already contains the required fields. No new tables are needed for auth.

### Existing Fields Used

| Field | Type | Purpose |
|-------|------|---------|
| `id` | UUID | Primary key |
| `email` | String (unique) | Login identifier |
| `name` | String | Display name |
| `passwordHash` | String (nullable) | bcrypt hash (null for VK-only users) |
| `emailVerified` | DateTime (nullable) | Timestamp when email was verified |
| `vkId` | String (nullable) | VK user ID for OAuth linking |
| `authProvider` | String | `email`, `vk`, or `both` |
| `createdAt` | DateTime | Account creation timestamp |

### Email Verification Strategy

Email verification tokens are **JWT-based** (signed with NEXTAUTH_SECRET, 24h expiry). No separate `VerificationToken` table is needed. The token payload contains `{ userId, email, purpose: "email-verify" }`.

Password reset tokens follow the same pattern: JWT with `{ userId, email, purpose: "password-reset" }` and 1h expiry.

---

## Authentication Flow Diagram

### Registration (Email)

```
[Browser]
  │
  ├─ POST /api/trpc/user.register
  │    Body: { email, password, name }
  │    │
  │    ├─ Zod validation (email format, password min 8 chars)
  │    ├─ Check rate limit (Redis: 5 attempts/min/IP)
  │    ├─ Check email uniqueness (Prisma)
  │    ├─ bcrypt hash password (12 rounds)
  │    ├─ Create user in PostgreSQL (emailVerified = null)
  │    ├─ Sign verification JWT (24h expiry)
  │    ├─ Send verification email (placeholder: console.log for MVP)
  │    └─ Return { success: true, message: "Проверьте почту" }
  │
  ├─ GET /verify-email?token=<JWT>
  │    │
  │    ├─ Verify JWT signature + expiry
  │    ├─ Update user: emailVerified = now()
  │    └─ Redirect to /login with success message
```

### Login (Email + Password)

```
[Browser]
  │
  ├─ POST /api/auth/callback/credentials
  │    Body: { email, password }
  │    │
  │    ├─ Check rate limit (Redis: 5 attempts/min/IP)
  │    ├─ Find user by email (Prisma)
  │    ├─ Verify emailVerified is not null → 403 if unverified
  │    ├─ bcrypt compare password
  │    ├─ Generate JWT access token (15 min) → HttpOnly cookie
  │    ├─ Generate JWT refresh token (7 days) → Secure cookie
  │    └─ Return session with user data
```

### Login (VK OAuth)

```
[Browser]
  │
  ├─ GET /api/auth/signin/vk → redirect to VK OAuth
  │    │
  │    ├─ VK: user authorizes (scopes: basic profile only)
  │    └─ Callback: GET /api/auth/callback/vk?code=<code>
  │         │
  │         ├─ Exchange code for VK access token
  │         ├─ Fetch VK user profile
  │         ├─ Find user by vkId OR email
  │         │   ├─ New user → create with vkId, authProvider="vk"
  │         │   ├─ Existing (same email) → link vkId, authProvider="both"
  │         │   └─ Existing (same vkId) → login
  │         ├─ Generate JWT cookies
  │         └─ Redirect to /dashboard
```

### Password Reset

```
[Browser]
  │
  ├─ POST /api/auth/reset-password
  │    Body: { email }
  │    │
  │    ├─ Check rate limit
  │    ├─ Find user by email (always return success to prevent enumeration)
  │    ├─ If user exists: sign reset JWT (1h expiry), send email
  │    └─ Return { success: true, message: "Если email зарегистрирован, вы получите письмо" }
  │
  ├─ POST /api/auth/new-password
  │    Body: { token, newPassword }
  │    │
  │    ├─ Verify JWT signature + expiry + purpose="password-reset"
  │    ├─ bcrypt hash new password (12 rounds)
  │    ├─ Update user passwordHash
  │    └─ Return { success: true } → redirect to /login
```

### JWT Refresh (Middleware)

```
[Browser] → Any authenticated request
  │
  middleware.ts:
  ├─ Read access token from cookie
  ├─ If valid → pass through
  ├─ If expired → read refresh token
  │   ├─ If refresh valid → generate new access token (15 min)
  │   │   └─ Set new access token cookie in response
  │   └─ If refresh expired → redirect to /login
```

---

## Security Architecture

### Password Handling

- **Algorithm:** bcrypt with 12 rounds (~250ms per hash)
- **Library:** `bcryptjs` (pure JavaScript, no native dependencies — avoids Docker build issues)
- **Policy:** Minimum 8 characters, validated by Zod schema

### JWT Configuration

| Token | Lifetime | Storage | Flags |
|-------|----------|---------|-------|
| Access token | 15 minutes | Cookie | HttpOnly, Secure, SameSite=Strict, Path=/ |
| Refresh token | 7 days | Cookie | HttpOnly, Secure, SameSite=Strict, Path=/api/auth |
| Email verification | 24 hours | URL query param | Signed with NEXTAUTH_SECRET (HS256) |
| Password reset | 1 hour | URL query param | Signed with NEXTAUTH_SECRET (HS256) |

### Rate Limiting

```
Redis key pattern: auth:ratelimit:<ip>
Strategy: INCR + EXPIRE
Limit: 5 attempts per 60 seconds per IP
Response on exceed: 429 "Подождите минуту"
Auto-unlock: TTL expiry (60 seconds)
```

Implementation uses a single Redis INCR call with conditional EXPIRE (set TTL only on first increment). This is atomic and avoids race conditions.

### VK OAuth Security

- VK access tokens are stored in `PlatformConnection.access_token_encrypted` (server-side encryption for OAuth refresh)
- VK OAuth requests use minimal scopes (profile info only for auth; video/wall scopes are requested separately when user connects publishing)
- State parameter validated to prevent CSRF

### Logging Policy

- Auth events logged with Pino (structured JSON)
- **Never log:** passwords, password hashes, JWT tokens, VK access tokens
- **Do log:** user ID, email (masked: `u***@example.com`), auth result (success/failure), rate limit hits, IP (for abuse detection)

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `next-auth` | ^4.x | Auth framework (already in project) |
| `bcryptjs` | ^2.4 | Password hashing (pure JS, no native deps) |
| `ioredis` | ^5.x | Redis client for rate limiting (already in project via BullMQ) |
| `zod` | ^3.x | Input validation (already in project) |

No new infrastructure dependencies. All auth components use existing PostgreSQL, Redis, and Next.js services.

---

## Technology Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Auth framework | NextAuth.js v4 | Lucia, custom JWT, Passport.js | Mature ecosystem, built-in VK provider support via custom provider, JWT mode works with stateless workers |
| Session storage | JWT (stateless) | Database sessions (NextAuth adapter) | BullMQ workers need to validate tokens without DB calls; JWT is self-contained |
| Password hashing | bcryptjs | argon2, scrypt | Pure JS — no native build issues in Docker multi-stage builds; 12 rounds provides adequate security |
| Rate limiting | Redis INCR + TTL | In-memory Map, Upstash | Redis is already running for BullMQ; distributed rate limiting across multiple web instances |
| Email service | Placeholder (console.log) | Mailgun, SendGrid, Postmark | MVP phase — will integrate real email provider in v2 |
| Verification tokens | JWT-based | Database tokens (separate table) | Simpler — no table, no cleanup cron; JWT expiry handles invalidation automatically |

---

## Consistency with Project Architecture

This auth implementation aligns with the project's root `docs/Architecture.md`:

- **Distributed Monolith pattern:** Auth lives inside `apps/web`, no separate auth service
- **Docker Compose deployment:** No new containers needed
- **Monorepo packages:** Uses `packages/db` for Prisma, `packages/types` for shared types
- **tRPC for API:** Registration is a tRPC mutation; NextAuth handles OAuth callbacks via API routes
- **Redis for infrastructure:** Rate limiting uses the same Redis instance as BullMQ
- **Security rules:** Follows the project security spec (JWT lifetimes, HttpOnly cookies, rate limits, Zod validation)
- **152-FZ compliance:** All user data stored in PostgreSQL on Russian VPS; no auth data leaves RF
