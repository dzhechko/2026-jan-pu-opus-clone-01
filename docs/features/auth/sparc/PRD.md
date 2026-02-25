# PRD: Authentication & Authorization

## Status
- **Priority:** P0 (blocking all other features)
- **Phase:** Planning
- **Owner:** TBD
- **Last updated:** 2026-02-25

---

## 1. Problem Statement

Users cannot access any functionality of КлипМейкер without first creating an account and authenticating. Every downstream feature -- video upload, AI processing, clip generation, auto-posting to VK/Rutube/Dzen/Telegram -- depends on knowing who the user is, what plan they are on, and which platform API keys they hold.

Today there is no authentication layer. Without it:
- Users cannot upload videos or trigger processing pipelines.
- Platform API keys cannot be associated with a user profile.
- Billing, usage tracking, and rate limiting are impossible.
- Auto-posting requires VK OAuth tokens that must be stored per-user.

The auth feature is the single most critical blocker in the entire product.

## 2. Target Users

| Attribute | Detail |
|-----------|--------|
| Persona | Russian-speaking online course creators and info-business owners |
| Age range | 25-55 |
| Technical level | Non-technical; comfortable with VK and GetCourse, not with developer tools |
| Language | Russian (all UI text, error messages, and email templates in Russian) |
| Platforms | Desktop (primary), mobile browser (secondary) |
| Existing accounts | Nearly all have VK accounts; many use Gmail or Yandex Mail |

**Key insight:** These users expect one-click VK login. Email/password is a fallback, not the primary path. The UX must make VK OAuth the prominent, encouraged option.

## 3. Solution Overview

Implement authentication using **NextAuth.js** with two providers:

1. **Email + Password** -- traditional registration with email verification, bcrypt-hashed passwords, and password reset flow.
2. **VK OAuth** -- one-click signup/login via VK ID, which simultaneously captures the OAuth tokens needed for future auto-posting to VK (video + wall scopes).

Session management uses **JWT tokens** stored in **HttpOnly secure cookies**:
- Access token: 15-minute lifetime
- Refresh token: 7-day lifetime
- Automatic silent refresh on the client side

All user data is stored in PostgreSQL via Prisma ORM, on a Russian VPS, in compliance with 152-FZ.

## 4. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Registration completion rate | >80% of users who start signup finish it | Funnel analytics (start -> verify email -> complete onboarding) |
| Login time (email/password) | <3 seconds from form submit to dashboard | Server-side timing + client performance marks |
| Login time (VK OAuth) | <5 seconds including redirect | Client performance marks |
| VK OAuth conversion | >40% of new registrations use VK OAuth | Provider breakdown in analytics |
| Password reset success | >90% of reset requests lead to successful login | Funnel analytics |
| Failed auth rate (brute force) | <0.1% of total auth requests trigger rate limit | Rate limiter logs |
| Email verification completion | >70% within 24 hours of registration | Database query (verified_at != null) |

## 5. Feature Requirements

### 5.1 Email Registration with Verification

**User story:** As a course creator, I want to register with my email so I can access КлипМейкер even without a VK account.

**Requirements:**
- Registration form: email, password, password confirmation, name (optional)
- Password requirements: minimum 8 characters, no maximum, no complexity rules (UX over security theater)
- Password hashing: bcrypt with cost factor 12
- Email verification: send a verification link immediately upon registration
- Verification link: signed JWT, valid for 24 hours, single-use
- Unverified users: can log in but cannot upload videos or access paid features
- Duplicate email: clear error message "Этот email уже зарегистрирован. Войти?"
- All form validation: client-side (Zod) + server-side (Zod) -- never trust the client alone

**Email template:**
- Subject: "Подтвердите ваш email в КлипМейкер"
- Body: brief greeting, verification button, link text fallback, 24-hour expiry note
- Sender: noreply@clipmaker.ru

### 5.2 Email/Password Login

**User story:** As a registered user, I want to log in with my email and password so I can access my dashboard.

**Requirements:**
- Login form: email, password, "Запомнить меня" checkbox (extends refresh to 30 days)
- On success: set HttpOnly JWT cookies, redirect to dashboard
- On failure: generic error "Неверный email или пароль" (never reveal which is wrong)
- Rate limiting: 5 failed attempts per minute per IP + per email combination
- After 5 failures: temporary lockout (15 minutes), show "Слишком много попыток. Попробуйте через 15 минут."
- "Забыли пароль?" link visible on login form

### 5.3 VK OAuth Signup/Login

**User story:** As a course creator with a VK account, I want to sign up with one click via VK so I can start using КлипМейкер immediately and auto-post to VK later.

**Requirements:**
- VK OAuth button: prominent placement above email form, styled with VK brand colors
- OAuth scopes requested: `video`, `wall`, `offline` (for refresh tokens)
- On first OAuth: create user account, store VK user ID, store encrypted OAuth tokens
- On subsequent OAuth: log in existing user, refresh OAuth tokens if expired
- Account linking: if a user registered with email and later uses VK OAuth with the same email, prompt to link accounts
- VK profile data captured: VK user ID, first name, last name, avatar URL
- OAuth tokens: encrypted client-side (AES-GCM 256-bit) before storage, following the project's client-side encryption pattern
- Fallback: if VK OAuth is temporarily unavailable, show a message and suggest email login

### 5.4 Password Reset

**User story:** As a user who forgot my password, I want to reset it via email so I can regain access to my account.

**Requirements:**
- "Забыли пароль?" link on login page
- Reset form: email input only
- Always respond with "Если аккаунт существует, мы отправили ссылку для сброса" (prevent email enumeration)
- Reset link: signed JWT, valid for 1 hour, single-use
- Reset form (after clicking link): new password + confirmation
- On success: invalidate all existing sessions (rotate refresh tokens), redirect to login
- Rate limiting: max 3 reset requests per email per hour

### 5.5 JWT Token Management

**User story:** As a system, I need secure stateless session management that works across the web app and worker services.

**Requirements:**
- Access token: JWT, 15-minute expiry, contains `userId`, `email`, `plan`, `role`
- Refresh token: opaque token, 7-day expiry (30 days if "remember me"), stored in DB for revocation
- Token storage: HttpOnly, Secure, SameSite=Lax cookies
- Silent refresh: client-side interceptor refreshes access token before expiry using refresh token
- Token rotation: each refresh issues a new refresh token and invalidates the old one
- Logout: clear cookies + invalidate refresh token in DB
- Multi-device: each device gets its own refresh token; revoking one does not affect others

### 5.6 Rate Limiting

**User story:** As a system, I need to protect auth endpoints from brute force and credential stuffing attacks.

**Requirements:**
- Login endpoint: 5 attempts per minute per IP + per email
- Registration endpoint: 3 registrations per hour per IP
- Password reset: 3 requests per hour per email
- VK OAuth: 10 attempts per minute per IP (higher because redirects count)
- Implementation: Redis-backed sliding window counters
- Response on limit: HTTP 429 with `Retry-After` header and Russian error message
- Monitoring: log all rate limit triggers with IP, endpoint, and timestamp

### 5.7 Post-Registration Onboarding (3 Steps)

**User story:** As a new user, I want a quick onboarding so I understand what to do first.

**Requirements:**
- Step 1: "Добро пожаловать!" -- brief product overview (30-second read), skip button
- Step 2: "Подключите VK" -- prompt to connect VK OAuth if registered via email (skip allowed)
- Step 3: "Загрузите первое видео" -- direct link to upload page, brief instructions
- Onboarding state: stored in user profile (`onboardingStep: 0|1|2|3`), 3 = completed
- Skip: users can skip any step; onboarding is marked complete when all steps are seen or skipped
- Re-access: onboarding available from Settings for users who skipped

## 6. User Flows

### 6.1 Email Registration Flow

```
Landing Page → "Регистрация" button
  → Registration form (email, password, confirm password)
    → Client-side Zod validation
    → POST /api/auth/register
      → Server-side Zod validation
      → Check duplicate email
      → bcrypt hash password
      → Create user in DB (unverified)
      → Send verification email
      → Redirect to "Проверьте почту" page
        → User clicks email link
          → GET /api/auth/verify?token=xxx
          → Mark user as verified
          → Redirect to onboarding Step 1
```

### 6.2 VK OAuth Flow

```
Landing Page → "Войти через VK" button
  → Redirect to VK OAuth consent screen
    → User approves
      → VK redirects to /api/auth/callback/vk
        → Exchange code for tokens
        → Check if VK user ID exists in DB
          → If new: create user, store encrypted tokens, redirect to onboarding
          → If existing: update tokens, redirect to dashboard
          → If email matches existing email user: prompt to link accounts
```

### 6.3 Password Reset Flow

```
Login Page → "Забыли пароль?" link
  → Password reset form (email)
    → POST /api/auth/forgot-password
    → Always show "Ссылка отправлена" (even if email not found)
    → User clicks email link
      → GET /api/auth/reset-password?token=xxx
      → New password form
        → POST /api/auth/reset-password
        → Invalidate all sessions
        → Redirect to login with success message
```

## 7. Non-Functional Requirements

| Requirement | Specification |
|-------------|---------------|
| Performance | Login response <500ms (server-side), full flow <3s (including UI) |
| Availability | Auth service must be available 99.9% (critical path) |
| Scalability | Support up to 10,000 registered users in first 6 months |
| Security | OWASP Top 10 compliance, no plaintext secrets, HTTPS only |
| Data residency | All user data stored on Russian VPS (152-FZ) |
| Internationalization | Russian only for MVP; architecture must support i18n later |
| Accessibility | WCAG 2.1 AA for auth forms (keyboard nav, screen reader labels) |
| Browser support | Chrome 90+, Firefox 90+, Safari 14+, Yandex Browser |

## 8. Constraints

- **152-FZ compliance**: All personal data (email, name, VK ID) must be stored on servers physically located in the Russian Federation.
- **bcrypt only**: No SHA-256 or MD5 for passwords. bcrypt with cost factor >= 12.
- **Minimum password length**: 8 characters. No upper limit. No complexity rules (research shows they reduce security by encouraging predictable patterns).
- **VK OAuth dependency**: VK may change their OAuth API. The implementation must use an abstraction layer (NextAuth.js provider) to isolate VK-specific logic.
- **Email delivery**: Must use a transactional email service with high deliverability to Russian email providers (Yandex Mail, Mail.ru). Consider Unisender or MailGun with RU region.
- **No third-party auth SaaS**: Clerk, Auth0, and similar services are rejected due to cost, lack of VK OAuth, and 152-FZ data residency concerns.

## 9. Out of Scope (MVP)

- Two-factor authentication (2FA) -- planned for v2
- Social login providers beyond VK (Odnoklassniki, Yandex ID) -- planned for v2
- Admin panel for user management -- planned for v2
- Account deletion self-service (GDPR-style) -- planned for v2
- SSO / SAML for enterprise customers -- not planned
- Biometric authentication -- not planned

## 10. Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| PostgreSQL 16 | Infrastructure | Available |
| Redis 7 | Infrastructure | Available |
| NextAuth.js v4 | Library | Stable |
| Prisma ORM | Library | Stable |
| VK OAuth API | External | Stable, requires app registration at dev.vk.com |
| Transactional email service | External | Needs selection and setup |
| DNS + domain | Infrastructure | Needs clipmaker.ru domain and MX records |

## 11. Open Questions

1. **Email provider**: Which transactional email service to use? Candidates: Unisender, MailGun (RU), Sendsay. Need to evaluate deliverability to Mail.ru and Yandex.
2. **VK app review**: Does the VK OAuth app need review/approval for `video` and `wall` scopes? What is the timeline?
3. **"Remember me" duration**: 30 days is proposed. Is this acceptable from a security standpoint for the target audience?
4. **Account linking UX**: When a VK OAuth email matches an existing email account, what is the exact UX? Modal prompt? Separate page?
5. **Onboarding analytics**: Do we need event tracking for each onboarding step, or just completion rate?

## 12. Timeline Estimate

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Design (SPARC) | 2 days | All SPARC docs, validation report |
| Implementation | 5 days | Auth system, tests, email templates |
| Integration testing | 2 days | E2E flows, VK OAuth testing with real app |
| Security review | 1 day | Penetration testing, rate limit verification |
| **Total** | **10 days** | Production-ready auth |
