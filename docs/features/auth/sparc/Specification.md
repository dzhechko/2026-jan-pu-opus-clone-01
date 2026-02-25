# Auth Feature — Specification

## Design Decisions (resolved contradictions)

- **VK OAuth scopes:** Profile-only for auth. `video`/`wall` requested separately when connecting publishing.
- **SameSite cookies:** `Lax` (required for VK OAuth redirects).
- **Unverified email:** Blocked from login (403).
- **VK token storage:** Server-side encryption (exception to client-side rule; OAuth tokens obtained server-side).
- **Verification tokens:** JWT-based (no database table).
- **Rate limiting:** 60s sliding window, no extended lockout in MVP.

---

## User Stories

### US-12a: Email Registration

**As a** visitor, **I want to** register with email **so I can** access the service.

**Acceptance Criteria:**

- Email field: valid email format (Zod `z.string().email()`), normalized to lowercase
- Password: min 8 chars, max 128 chars (no complexity rules)
- Password confirmation: must match password
- Name: min 1, max 100 chars
- On submit: create user with bcrypt hash (12 rounds), send verification email
- Duplicate email → "Email уже зарегистрирован" (409)
- After verification → redirect to login with success message "Email подтверждён"
- Default state: Free plan, 30 min/month, LLM preference "ru"
- Rate limit: 3 registrations per hour per IP. On exceed: 429 with Retry-After header
- Performance: p99 < 500ms (see NFR table)

---

### US-12b: Email Login

**As a** registered user, **I want to** login with email/password.

**Acceptance Criteria:**

- Email: valid email format (Zod `z.string().email()`). Password: non-empty (Zod `z.string().min(1)`). Invalid input → 400 with field-level errors
- On success: JWT access token (15min, HttpOnly, Secure, SameSite=Lax) + refresh token (7d, HttpOnly, Secure, SameSite=Lax, Path=/api/auth)
- Access token payload: `{ id, email, planId, role }`
- "Remember me" checkbox: if checked, refresh token extended to 30 days
- Wrong credentials → "Неверный email или пароль" (401)
- 5 attempts/min per IP rate limit → "Слишком много попыток. Подождите минуту" (429) with Retry-After header
- Unverified email → "Подтвердите email для входа" (403)
- Performance: p99 < 500ms (see NFR table)

---

### US-12c: VK OAuth

**As a** visitor, **I want to** login via VK **for** quick access.

**Acceptance Criteria:**

- OAuth scopes: profile-only for auth. `video`/`wall` scopes requested separately when connecting publishing
- New user → create account with VK data: `name` from `first_name + last_name`, `email` from VK profile (may be null), `vkId` from VK user ID, `avatarUrl` from `photo_200`. Default plan/quota/LLM per US-12a-7. `emailVerified=true`
- If VK returns no email → create user without email, prompt to add email on first dashboard visit
- Existing user (same email) → auto-link VK to existing account (set `vkId`, update `authProvider`)
- After login → redirect to dashboard
- VK tokens stored server-side encrypted in `PlatformConnection` (upsert to avoid duplicates)
- VK OAuth state parameter validated (CSRF protection)
- If VK OAuth denied by user → redirect to `/login?error=vk_cancelled`, display "VK авторизация отменена"
- If VK API unavailable → redirect to `/login?error=vk_unavailable`, display "Сервис VK временно недоступен"
- Rate limit: 10 OAuth attempts per minute per IP

---

### US-12d: Password Reset

**As a** user, **I want to** reset my forgotten password.

**Acceptance Criteria:**

- Enter email → send reset link (JWT signed with NEXTAUTH_SECRET, valid 1 hour, contains `{ userId, purpose: "password_reset" }`)
- Non-existent email → still show success "Если аккаунт существует, мы отправили ссылку" (prevent enumeration)
- New password: min 8 chars, max 128 chars, bcrypt 12 rounds (same rules as registration)
- Password confirmation must match
- After reset → redirect to login with success message "Пароль изменён. Войдите с новым паролем"
- Rate limit: 3 reset requests per hour per email. On exceed: 429 with Retry-After header
- Performance: p99 < 500ms (see NFR table)

---

## Non-Functional Requirements

| Requirement | Target |
|---|---|
| API response time | p99 < 500ms for all auth endpoints |
| JWT validation (middleware) | < 1ms |
| Rate limiting | Redis-backed, sliding window (INCR + TTL) |
| Password hashing | bcrypt 12 rounds (~250ms) |
| Email sending | async (console.log placeholder in MVP), < 30s delivery in production |
| Error messages | Russian language, with error codes for programmatic handling |
| Cookie policy | HttpOnly, Secure, SameSite=Lax |

---

## Data Types

```typescript
type RegisterInput = { name: string; email: string; password: string; confirmPassword: string; }
type LoginInput = { email: string; password: string; rememberMe?: boolean; }
type ResetPasswordInput = { email: string; }
type NewPasswordInput = { token: string; password: string; confirmPassword: string; }
type AuthResponse = { user: { id: string; email: string; name: string; planId: string; }; }
type AccessTokenPayload = { id: string; email: string; planId: string; role: string; }
```
