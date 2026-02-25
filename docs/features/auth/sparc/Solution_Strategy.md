# Solution Strategy: Authentication & Authorization

## Status
- **Priority:** P0
- **Phase:** Planning
- **Last updated:** 2026-02-25

---

## 1. Problem Analysis

### 1.1 Core Problem

КлипМейкер cannot function without authentication. Every feature in the product -- video upload, AI processing, clip generation, auto-posting, billing -- requires knowing who the user is. Auth is not a feature users want; it is a gate they must pass through to reach the value.

### 1.2 Secondary Problem: VK OAuth is a Business Requirement, Not Just a Convenience

VK OAuth serves a dual purpose:

1. **Frictionless signup** -- the target audience (Russian course creators) universally has VK accounts. One-click registration removes the biggest conversion barrier.
2. **Auto-posting tokens** -- to publish clips to VK (the primary distribution platform), we need OAuth tokens with `video` and `wall` scopes. Capturing these during signup eliminates a second authorization step later.

If we only implement email/password, every user would need to go through a separate VK OAuth flow later to enable auto-posting. This fragments the UX and reduces VK publishing adoption.

### 1.3 Why This Must Be Solved First

```
Auth ──┬── Upload (needs userId)
       ├── Processing (needs userId, plan)
       ├── Billing (needs userId, email)
       ├── Auto-posting (needs VK OAuth tokens)
       ├── API Key Vault (needs encryption key derived from user)
       └── Rate limiting (needs userId or IP)
```

Every arrow is a hard dependency. There is no feature in КлипМейкер that works without auth.

## 2. First Principles Decomposition

### 2.1 What Is the Minimal Auth That Unblocks Everything?

Stripping auth to its absolute minimum:

| Capability | Why Required | Can We Defer? |
|-----------|-------------|---------------|
| Create user record | Store user data, associate resources | No |
| Verify identity (login) | Prevent unauthorized access | No |
| Session management | Maintain state across requests | No |
| VK OAuth | Auto-posting tokens | No (core value prop) |
| Email verification | Prevent spam accounts, enable password reset | No |
| Password reset | Users forget passwords | No (support cost too high) |
| Rate limiting | Prevent brute force | No (security baseline) |
| Onboarding | Guide first-time users | Could defer, but hurts activation |
| 2FA | Extra security layer | Yes -- v2 |
| Admin panel | Manage users | Yes -- v2 |

**Minimum viable auth:** User creation + email/password login + VK OAuth + JWT sessions + email verification + password reset + rate limiting. This is 7 capabilities, none of which can be cut.

### 2.2 Stateless vs Stateful Sessions

**Question:** Should we use database-backed sessions or JWTs?

**First principles analysis:**

- The web app (Next.js) needs to authenticate requests.
- The worker service (BullMQ) needs to validate that a job belongs to a user.
- Workers do not have access to NextAuth session stores by default.
- Database sessions require a DB query on every request.
- JWTs are self-contained and can be verified by any service with the secret.

**Conclusion:** JWT strategy. Access token (short-lived, 15 min) contains user claims. Refresh token (long-lived, 7 days) stored in DB for revocation. This gives us stateless verification for hot paths and revocation capability for security events.

### 2.3 Where Should Tokens Live?

| Storage | XSS Safe | CSRF Safe | Works Across Tabs | Worker Access |
|---------|----------|-----------|-------------------|---------------|
| localStorage | No | Yes | Yes | No |
| sessionStorage | No | Yes | No | No |
| HttpOnly Cookie | Yes | Need SameSite | Yes | Yes (via cookie) |
| Memory only | Yes | Yes | No | No |

**Conclusion:** HttpOnly, Secure, SameSite=Lax cookies. This is the only option that is XSS-safe and works across tabs. CSRF is mitigated by SameSite=Lax (blocks cross-origin POST) plus the short access token lifetime.

## 3. Approach

### 3.1 Technology Selection

| Component | Technology | Justification |
|-----------|-----------|---------------|
| Auth framework | NextAuth.js v4 | Mature, extensible, supports custom OAuth providers, large community |
| User storage | PostgreSQL 16 + Prisma ORM | Already in stack, ACID-compliant, Prisma adapter for NextAuth |
| Password hashing | bcrypt (cost 12) | Industry standard, intentionally slow, resistant to GPU attacks |
| Rate limiting | Redis 7 + sliding window | Already in stack for BullMQ, sub-millisecond lookups |
| Email delivery | Transactional email service (TBD) | Need high deliverability to Russian providers |
| VK OAuth | Custom NextAuth provider | VK is not a built-in NextAuth provider; we write a custom one |
| Token storage | HttpOnly cookies | XSS protection, cross-tab support |

### 3.2 Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Browser                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │
│  │ Login    │  │ Register │  │ VK OAuth Button   │ │
│  │ Form     │  │ Form     │  │ (redirect to VK)  │ │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘ │
│       │              │                 │            │
│       ▼              ▼                 ▼            │
│  ┌──────────────────────────────────────────────┐   │
│  │           NextAuth.js Client                 │   │
│  │  (signIn, signOut, useSession, getSession)   │   │
│  └────────────────────┬─────────────────────────┘   │
└───────────────────────┼─────────────────────────────┘
                        │ HttpOnly Cookies
                        ▼
┌─────────────────────────────────────────────────────┐
│              Next.js API Routes                     │
│  ┌──────────────────────────────────────────────┐   │
│  │          NextAuth.js Server                  │   │
│  │  /api/auth/[...nextauth]                     │   │
│  │  ┌────────────┐  ┌───────────────────────┐   │   │
│  │  │ Credentials│  │ VK OAuth Provider     │   │   │
│  │  │ Provider   │  │ (custom)              │   │   │
│  │  └─────┬──────┘  └──────────┬────────────┘   │   │
│  │        │                    │                │   │
│  │        ▼                    ▼                │   │
│  │  ┌──────────────────────────────────────┐    │   │
│  │  │         JWT Callbacks                │    │   │
│  │  │  (sign, verify, refresh rotation)    │    │   │
│  │  └──────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌────────────────┐  ┌─────────────────────────┐    │
│  │ Rate Limiter   │  │ Custom API Routes       │    │
│  │ Middleware      │  │ /api/auth/register      │    │
│  │ (Redis)        │  │ /api/auth/forgot-password│    │
│  └────────┬───────┘  │ /api/auth/reset-password │    │
│           │          │ /api/auth/verify          │    │
│           ▼          └────────────┬──────────────┘    │
│  ┌────────────────────────────────┼──────────────┐   │
│  │              Redis 7           │              │   │
│  │  (rate limit counters,         │              │   │
│  │   BullMQ queues)              │              │   │
│  └────────────────────────────────┼──────────────┘   │
│                                   │                  │
│  ┌────────────────────────────────▼──────────────┐   │
│  │          PostgreSQL 16 (Prisma)               │   │
│  │  ┌──────┐ ┌─────────┐ ┌──────────────────┐   │   │
│  │  │ User │ │ Account │ │ RefreshToken     │   │   │
│  │  └──────┘ └─────────┘ └──────────────────┘   │   │
│  └───────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 3.3 Data Model

```prisma
model User {
  id              String    @id @default(cuid())
  email           String    @unique
  emailVerified   DateTime?
  passwordHash    String?   // null for VK-only users
  name            String?
  avatarUrl       String?
  plan            Plan      @default(FREE)
  onboardingStep  Int       @default(0) // 0-3
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  accounts        Account[]
  refreshTokens   RefreshToken[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  provider          String  // "credentials" | "vk"
  providerAccountId String
  accessToken       String? // encrypted, for VK OAuth
  refreshToken      String? // encrypted, for VK OAuth
  tokenExpiresAt    DateTime?
  scope             String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model RefreshToken {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  device    String?  // user-agent fingerprint
  expiresAt DateTime
  createdAt DateTime @default(now())
  revokedAt DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([token])
}

model VerificationToken {
  id        String   @id @default(cuid())
  email     String
  token     String   @unique
  type      TokenType // EMAIL_VERIFY | PASSWORD_RESET
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())

  @@index([token])
  @@index([email])
}

enum Plan {
  FREE
  STARTER
  PRO
  BUSINESS
}

enum TokenType {
  EMAIL_VERIFY
  PASSWORD_RESET
}
```

### 3.4 API Endpoints

| Method | Endpoint | Purpose | Rate Limit |
|--------|----------|---------|------------|
| POST | `/api/auth/register` | Email registration | 3/hour/IP |
| GET | `/api/auth/verify?token=xxx` | Email verification | 10/hour/token |
| POST | `/api/auth/[...nextauth]` | NextAuth sign-in (credentials + VK) | 5/min/IP+email |
| GET | `/api/auth/[...nextauth]` | NextAuth callbacks, session | 100/min/user |
| POST | `/api/auth/forgot-password` | Request password reset | 3/hour/email |
| POST | `/api/auth/reset-password` | Execute password reset | 5/hour/IP |
| POST | `/api/auth/logout` | Logout + revoke refresh token | 10/min/user |
| GET | `/api/auth/session` | Get current session | 100/min/user |

## 4. Alternatives Considered

### 4.1 Clerk

| Aspect | Assessment |
|--------|-----------|
| What it is | Hosted auth service with pre-built UI components |
| Pros | Fast to implement, handles email/password/social out of the box, good DX |
| Cons | No VK OAuth provider, data stored outside Russia (152-FZ violation), $25/mo+ at scale, vendor lock-in |
| Verdict | **Rejected.** No VK provider is a dealbreaker. 152-FZ non-compliance is a legal risk. |

### 4.2 Auth0

| Aspect | Assessment |
|--------|-----------|
| What it is | Enterprise auth platform with custom social connections |
| Pros | Supports custom OAuth providers (could add VK), extensive features, enterprise-grade |
| Cons | Expensive ($23/mo for 1000 MAU), data in US/EU by default, complex setup for custom providers, overkill for MVP |
| Verdict | **Rejected.** Cost + 152-FZ concerns + complexity. Could revisit for enterprise tier later. |

### 4.3 Supabase Auth

| Aspect | Assessment |
|--------|-----------|
| What it is | Open-source auth tied to Supabase ecosystem |
| Pros | Free tier, open source, PostgreSQL-native |
| Cons | No VK OAuth provider, tightly coupled to Supabase (we use standalone Prisma), self-hosting adds ops burden |
| Verdict | **Rejected.** No VK provider. Would require forking to add custom providers. |

### 4.4 Custom JWT from Scratch (No Framework)

| Aspect | Assessment |
|--------|-----------|
| What it is | Hand-rolled JWT auth with custom endpoints |
| Pros | Full control, no dependencies, minimal footprint |
| Cons | Security risk (easy to make JWT mistakes), reinventing session management, CSRF handling, token rotation, OAuth state management -- all well-solved by NextAuth |
| Verdict | **Rejected.** Too much surface area for security bugs. NextAuth handles the hard parts. |

### 4.5 Passport.js

| Aspect | Assessment |
|--------|-----------|
| What it is | Express middleware for auth strategies |
| Pros | 500+ strategies including VK (passport-vkontakte), mature ecosystem |
| Cons | Express-centric (poor fit for Next.js API routes), no built-in session management for JWTs, needs significant glue code in App Router |
| Verdict | **Rejected.** NextAuth.js is the natural fit for Next.js. Passport.js would require too much adaptation. |

### Summary Matrix

| Solution | VK OAuth | 152-FZ | Cost | Complexity | Verdict |
|----------|----------|--------|------|------------|---------|
| NextAuth.js | Custom provider | Self-hosted (compliant) | Free | Medium | **Selected** |
| Clerk | No | Non-compliant | $25+/mo | Low | Rejected |
| Auth0 | Custom (complex) | Non-compliant by default | $23+/mo | High | Rejected |
| Supabase Auth | No | Self-host possible | Free | Medium | Rejected |
| Custom JWT | Full control | Self-hosted (compliant) | Free | Very High | Rejected |
| Passport.js | Yes (community) | Self-hosted (compliant) | Free | High | Rejected |

## 5. Key Decisions

### Decision 1: NextAuth.js v4 (Not v5)

**Context:** NextAuth.js v5 (Auth.js) is available but still has rough edges with custom providers and the App Router migration.

**Decision:** Use NextAuth.js v4, the mature and stable version.

**Rationale:**
- v4 has extensive documentation and community solutions for edge cases.
- Custom OAuth provider support is well-documented in v4.
- v5 is still evolving its API surface; migrating later is straightforward.
- Risk of v5 bugs in production auth is unacceptable for a P0 feature.

**Consequences:**
- Will need to migrate to v5 eventually (low effort, well-documented path).
- v4 uses Pages Router for auth routes; we wrap them in App Router.

### Decision 2: JWT Strategy (Not Database Sessions)

**Context:** NextAuth supports both JWT and database session strategies.

**Decision:** Use JWT strategy with short-lived access tokens and DB-backed refresh tokens.

**Rationale:**
- Workers (BullMQ) need to verify user identity without DB access on every job.
- JWT access tokens are stateless -- any service can verify with the shared secret.
- Refresh tokens in DB give us revocation capability (logout, security events).
- 15-minute access token lifetime limits exposure if a token is leaked.

**Consequences:**
- Cannot revoke access tokens before expiry (15 min max exposure).
- Need client-side silent refresh logic.
- Refresh token rotation adds complexity but is essential for security.

### Decision 3: HttpOnly Cookies (Not localStorage)

**Context:** JWTs need to be stored somewhere in the browser.

**Decision:** HttpOnly, Secure, SameSite=Lax cookies.

**Rationale:**
- XSS attacks cannot read HttpOnly cookies (localStorage is vulnerable).
- SameSite=Lax prevents CSRF for state-changing requests.
- Cookies are automatically sent with every request (no manual header management).
- Works across tabs and survives page refreshes.

**Consequences:**
- Cookie size limit (~4KB) constrains JWT payload size. Keep claims minimal.
- Need to handle cookie domains correctly for subdomains.
- CORS configuration must allow credentials.

### Decision 4: VK OAuth with Minimal Scopes

**Context:** VK OAuth supports many scopes. We could request everything upfront or incrementally.

**Decision:** Request `video`, `wall`, and `offline` scopes during initial OAuth.

**Rationale:**
- `video` and `wall` are needed for auto-posting (core product value).
- `offline` provides a refresh token so the user does not need to re-authorize.
- Requesting scopes at signup means the user sees one consent screen, not two.
- Requesting unnecessary scopes (friends, messages, etc.) reduces OAuth conversion.

**Consequences:**
- If we need additional scopes later, the user must re-authorize (re-consent screen).
- The `offline` scope means VK tokens are long-lived -- must encrypt at rest.
- VK may reject app review if scopes seem excessive; we justify with publishing use case.

### Decision 5: Redis-Backed Rate Limiting (Sliding Window)

**Context:** Rate limiting can be done in-memory, in Redis, or via middleware/WAF.

**Decision:** Redis sliding window counters, implemented as Next.js middleware.

**Rationale:**
- Redis is already in the stack (BullMQ) -- no new infrastructure.
- Sliding window is more accurate than fixed window (no burst at window boundaries).
- Next.js middleware runs before API routes -- blocks requests early.
- Per-user + per-IP dual tracking catches both authenticated and anonymous abuse.

**Consequences:**
- Redis becomes a hard dependency for auth (already is for queues, so acceptable).
- Need to handle Redis downtime gracefully (fail open with logging, not fail closed).
- Sliding window uses more Redis memory than fixed window (negligible at our scale).

## 6. Risk Analysis

### Risk 1: VK OAuth API Changes

| Attribute | Detail |
|-----------|--------|
| Probability | Medium (VK updates APIs periodically) |
| Impact | High (breaks VK login and auto-posting) |
| Mitigation | Isolate VK-specific logic in a custom NextAuth provider. Monitor VK developer changelog. Pin VK API version (v5.199). Integration test with real VK API in CI (weekly schedule). |
| Contingency | If VK OAuth breaks, users fall back to email login. Auto-posting degrades gracefully with clear error message. |

### Risk 2: Email Delivery Reliability

| Attribute | Detail |
|-----------|--------|
| Probability | Medium (Russian email providers have aggressive spam filters) |
| Impact | High (users cannot verify email or reset password) |
| Mitigation | Use transactional email service with proven Russian deliverability. Set up SPF, DKIM, DMARC for clipmaker.ru domain. Monitor bounce rates and spam complaint rates. Provide "Resend verification email" button. |
| Contingency | If email delivery fails repeatedly, offer manual verification via support. Add VK OAuth as alternative signup path (no email needed). |

### Risk 3: Brute Force / Credential Stuffing Attacks

| Attribute | Detail |
|-----------|--------|
| Probability | High (common attack vector for any auth system) |
| Impact | Medium (account takeover, data breach) |
| Mitigation | Rate limiting (5 attempts/min per IP+email). Account lockout after 15 failed attempts (15-min cooldown). bcrypt with cost 12 (slow by design). No username enumeration (generic error messages). Monitoring and alerting on unusual auth patterns. |
| Contingency | If a breach is detected: force password reset for affected accounts, revoke all refresh tokens, notify users. |

### Risk 4: JWT Secret Compromise

| Attribute | Detail |
|-----------|--------|
| Probability | Low (server-side only, env var) |
| Impact | Critical (attacker can forge any user's session) |
| Mitigation | JWT secret in environment variable, never in code. Rotate secret periodically (with grace period for existing tokens). Use RS256 (asymmetric) if workers need verify-only capability. Secret different per environment (dev/staging/prod). |
| Contingency | Immediate secret rotation. All existing JWTs invalidated. All users forced to re-login. Incident response procedure. |

### Risk 5: 152-FZ Non-Compliance

| Attribute | Detail |
|-----------|--------|
| Probability | Low (we control infrastructure) |
| Impact | Critical (legal action, fines, service shutdown) |
| Mitigation | All PostgreSQL and Redis instances on Russian VPS (AdminVPS/HOSTKEY). No user PII sent to non-Russian services. Email service must have Russian data processing or be self-hosted. Regular compliance audit of data flows. |
| Contingency | If a non-compliant data flow is discovered: immediate remediation, data deletion from non-Russian servers, legal review. |

### Risk 6: NextAuth.js v4 End of Life

| Attribute | Detail |
|-----------|--------|
| Probability | Medium (v5 is the future, v4 will be deprecated) |
| Impact | Low (v4 will work for years, migration path is clear) |
| Mitigation | Pin NextAuth version. Plan migration to v5 (Auth.js) as a separate feature in v2. Avoid using deprecated v4 APIs. |
| Contingency | Fork NextAuth v4 if critical security patches stop (unlikely for 1-2 years). |

## 7. Implementation Phases

### Phase 1: Core Auth (Days 1-3)

**Goal:** Users can register, verify email, and log in.

- Set up NextAuth.js with Credentials provider
- Prisma schema for User, Account, RefreshToken, VerificationToken
- Registration endpoint with Zod validation and bcrypt
- Email verification flow (send + verify)
- JWT token management (access + refresh, HttpOnly cookies)
- Basic rate limiting middleware (Redis sliding window)
- Login/register UI pages (shadcn/ui forms)

**Exit criteria:** A user can register with email, receive verification email, verify, and log in. JWT tokens are set in cookies.

### Phase 2: VK OAuth (Days 3-4)

**Goal:** Users can sign up and log in via VK.

- Custom VK OAuth provider for NextAuth.js
- VK app registration at dev.vk.com
- OAuth callback handling (new user vs existing user)
- Account linking flow (VK + email same person)
- Encrypted storage of VK OAuth tokens (client-side AES-GCM)
- VK OAuth button on login/register pages

**Exit criteria:** A user can click "Войти через VK", authorize on VK, and land on the dashboard. VK tokens are stored encrypted.

### Phase 3: Password Reset + Rate Limiting (Days 4-5)

**Goal:** Users can recover accounts. Auth endpoints are protected.

- Password reset flow (request + email + reset form)
- Full rate limiting for all auth endpoints
- Account lockout logic (15-min cooldown after 15 failures)
- Error handling and Russian-language error messages
- Logout with refresh token revocation

**Exit criteria:** Full password reset flow works. Rate limiting blocks excessive attempts. All error messages are in Russian.

### Phase 4: Onboarding + Polish (Days 5-6)

**Goal:** New users are guided through first steps.

- 3-step onboarding UI (welcome, connect VK, upload prompt)
- Onboarding state persistence (user.onboardingStep)
- "Remember me" functionality (extended refresh token)
- Session refresh logic (silent refresh before expiry)
- Comprehensive error states and edge case handling

**Exit criteria:** New users see onboarding. "Remember me" works. Silent refresh prevents session drops.

### Phase 5: Testing + Security Review (Days 6-7)

**Goal:** Auth is production-ready and secure.

- Unit tests for all auth utilities (token generation, password hashing, rate limiting)
- Integration tests for all auth flows (register, login, VK OAuth, reset)
- E2E tests (Playwright) for critical paths
- Security review: OWASP checklist, penetration testing
- Load testing: auth endpoints under 100 concurrent users

**Exit criteria:** All BDD scenarios from test-scenarios.md pass. No critical or major security findings.

## 8. Success Validation

After implementation, the auth feature is considered complete when:

1. All 7 feature requirements from the PRD are implemented and tested.
2. Registration completion rate exceeds 80% in staging testing (simulated).
3. Login response time is under 500ms (server-side, measured with k6).
4. VK OAuth flow works end-to-end with real VK API (staging VK app).
5. Rate limiting correctly blocks brute force attempts (verified with automated test).
6. All user data resides on Russian VPS (verified by infrastructure audit).
7. BDD scenarios for auth (from docs/test-scenarios.md) have 100% pass rate.
8. Security review (brutal-honesty-review) has zero critical findings.
