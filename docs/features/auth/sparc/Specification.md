# Auth Feature — Specification

## User Stories

### US-12a: Email Registration

**As a** visitor, **I want to** register with email **so I can** access the service.

**Acceptance Criteria:**

- Email field: valid email format (Zod validation)
- Password: min 8 chars, max 128 chars
- Name: min 1, max 100 chars
- On submit: create user with bcrypt hash (12 rounds), send verification email
- Duplicate email → "Email уже зарегистрирован" (409)
- After verification → auto-login, redirect to dashboard with onboarding
- Default state: Free plan, 30 min/month, LLM preference "ru"

---

### US-12b: Email Login

**As a** registered user, **I want to** login with email/password.

**Acceptance Criteria:**

- Input validation with Zod
- On success: JWT access token (15min, HttpOnly) + refresh token (7d, secure cookie)
- Wrong credentials → "Неверный email или пароль" (401)
- 5 attempts/min rate limit → "Слишком много попыток. Подождите минуту" (429)
- Unverified email → "Подтвердите email для входа" (403)

---

### US-12c: VK OAuth

**As a** visitor, **I want to** login via VK **for** quick access.

**Acceptance Criteria:**

- OAuth scopes: only "video" and "wall"
- New user → create account with VK data, auto-connect VK for publishing
- Existing user (same email) → link VK to existing account
- After login → redirect to dashboard
- VK pre-connected for auto-posting (PlatformConnection created)

---

### US-12d: Password Reset

**As a** user, **I want to** reset my forgotten password.

**Acceptance Criteria:**

- Enter email → send reset link (valid 1 hour)
- Non-existent email → still show success (prevent enumeration)
- Link contains signed JWT token with user ID
- New password: min 8 chars, bcrypt hash
- After reset → redirect to login with success message

---

## Non-Functional Requirements

| Requirement | Target |
|---|---|
| API response time | p99 < 500ms for auth endpoints |
| JWT validation | < 1ms |
| Rate limiting | Redis-backed, 5 auth/min per IP |
| Password hashing | bcrypt 12 rounds (~250ms) |
| Email sending | async (queue), < 30s delivery |
| Error messages | Russian language |

---

## Data Types

```typescript
type RegisterInput = { name: string; email: string; password: string; }
type LoginInput = { email: string; password: string; }
type ResetPasswordInput = { email: string; }
type NewPasswordInput = { token: string; password: string; }
type AuthResponse = { user: { id: string; email: string; name: string; planId: string; }; }
```
