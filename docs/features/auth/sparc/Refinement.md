# Auth Feature — Refinement

## Edge Cases

| # | Scenario | Expected Behavior | Handling |
|---|----------|-------------------|----------|
| E1 | Duplicate email registration | "Email уже зарегистрирован" (409) | Check Prisma unique constraint error (`P2002`), return user-friendly Russian error message |
| E2 | VK OAuth with existing email | Link VK to existing account | Match by email in NextAuth callback, update `vkId` and set `authProvider="both"` |
| E3 | Expired verification link (>24h) | "Ссылка устарела" error page | JWT expiry check fails, show error with re-send button |
| E4 | Expired password reset link (>1h) | "Ссылка устарела" error page | JWT expiry check fails, show "Запросить снова" link |
| E5 | 6th login attempt in 1 minute | 429 "Подождите минуту" | Redis INCR with 60s TTL counter per IP, auto-unlock after TTL expires |
| E6 | VK OAuth denied by user | Redirect to login with error message | Catch OAuth `access_denied` error in callback, redirect to `/login?error=vk_cancelled`, display "VK авторизация отменена" |
| E7 | Concurrent sessions from multiple devices | Allow all sessions | JWT is stateless — no session table, each device holds its own token pair |
| E8 | SQL injection in email field | Rejected by Zod validation | Zod `z.string().email()` rejects malformed input before it reaches Prisma; Prisma uses parameterized queries as additional defense |
| E9 | XSS in name field | Sanitized on display | React auto-escapes JSX output by default; DOMPurify applied for any `dangerouslySetInnerHTML` rendering |
| E10 | JWT stolen via XSS | Mitigated by HttpOnly cookies | HttpOnly flag prevents JavaScript access to cookies; even if XSS occurs, tokens cannot be exfiltrated |
| E11 | CSRF attack on auth endpoints | Blocked by SameSite cookie + state param | SameSite=Lax on auth cookies blocks cross-origin POST; VK OAuth uses state parameter for CSRF; Lax (not Strict) required for OAuth redirects |
| E12 | VK API rate limit during OAuth | Retry with backoff | NextAuth handles OAuth token exchange internally; VK rate limits during auth are rare (single request per login) |
| E13 | User registers with email, then tries VK OAuth with same email | Accounts linked automatically | VK callback checks email match, links `vkId` to existing account, sets `authProvider="both"` |
| E14 | Password reset for VK-only account (no password set) | Allow setting initial password | Reset flow creates `passwordHash` where it was previously null, updates `authProvider` to `"both"` |
| E15 | Browser with cookies disabled | Auth fails gracefully | NextAuth detects missing cookie support, returns error; login page shows "Включите cookies в настройках браузера" |
| E16 | Concurrent registration requests with same email | Only one succeeds | PostgreSQL unique constraint on `email` field — second INSERT fails with `P2002`, caught and returned as 409 |
| E17 | Malformed JWT in cookie | Treated as unauthenticated | Middleware catches `JsonWebTokenError`, clears invalid cookies, redirects to `/login` |
| E18 | Clock skew between server instances | JWT validation tolerance | NextAuth uses `clockTolerance` option (30 seconds) to handle minor clock differences |

---

## Testing Strategy

### Unit Tests (Vitest)

| Test | Input | Expected Output |
|------|-------|-----------------|
| bcrypt hashing produces valid hash | `"MyP@ssw0rd"` | Hash starts with `$2a$12$`, length 60 |
| bcrypt comparison succeeds for correct password | `"MyP@ssw0rd"`, valid hash | `true` |
| bcrypt comparison fails for wrong password | `"wrongpass"`, valid hash | `false` |
| JWT sign produces valid token | `{ userId, email, purpose }` | Decodable JWT with correct claims |
| JWT verify succeeds for valid token | Valid token, correct secret | Decoded payload |
| JWT verify fails for expired token | Expired token | Throws `TokenExpiredError` |
| JWT verify fails for tampered token | Modified token | Throws `JsonWebTokenError` |
| Zod register schema accepts valid input | `{ email: "a@b.com", password: "12345678", name: "Test" }` | Passes validation |
| Zod register schema rejects short password | `{ email: "a@b.com", password: "123" }` | Validation error: password min 8 |
| Zod register schema rejects invalid email | `{ email: "not-email", password: "12345678" }` | Validation error: invalid email |
| Zod login schema rejects empty fields | `{ email: "", password: "" }` | Validation errors |
| Rate limiter increments counter | First call with IP | Counter = 1, allowed = true |
| Rate limiter blocks after 5 attempts | 6th call with same IP | Counter = 6, allowed = false |
| Rate limiter resets after TTL | Call after 60s TTL expires | Counter = 1, allowed = true |
| VK provider parses profile correctly | VK API response JSON | `{ id, email, name, vkId }` |

### Integration Tests (Vitest + testcontainers)

These tests use real PostgreSQL and Redis containers via testcontainers.

| Test | Flow | Assertions |
|------|------|------------|
| Registration: valid input | POST register → check DB | User created, `emailVerified` is null, `passwordHash` is bcrypt hash |
| Registration: duplicate email | Register twice with same email | First succeeds (201), second fails (409) with "Email уже зарегистрирован" |
| Registration: concurrent duplicate | Two parallel register requests, same email | Exactly one succeeds, one fails with 409 |
| Login: valid credentials | Register → verify email → login | 200, JWT cookies set (access + refresh) |
| Login: wrong password | Register → login with wrong password | 401 "Неверный email или пароль" |
| Login: unverified email | Register (no verify) → login | 403 "Подтвердите email" |
| Login: non-existent email | Login with unknown email | 401 "Неверный email или пароль" (same message to prevent enumeration) |
| VK OAuth: new user | Simulate VK callback with new vkId | User created with `authProvider="vk"`, `emailVerified` set |
| VK OAuth: existing email | Register email user → VK callback with same email | User updated: `vkId` set, `authProvider="both"` |
| VK OAuth: existing vkId | VK login twice | Second login reuses existing user |
| Password reset: request | POST reset-password with valid email | Always returns success (200), email "sent" (logged) |
| Password reset: request with unknown email | POST reset-password with unknown email | Still returns success (200) — no enumeration |
| Password reset: use valid token | Request reset → use token with new password | Password updated, can login with new password |
| Password reset: expired token | Use token after 1h | 400 "Ссылка устарела" |
| Rate limiting: 5 attempts OK | 5 login attempts in 60s | All return normal responses (success or auth error) |
| Rate limiting: 6th attempt blocked | 6th login attempt in 60s | 429 "Подождите минуту" |
| Rate limiting: unblocked after TTL | 6th attempt → wait 60s → 7th attempt | 7th attempt allowed |
| JWT refresh: expired access token | Login → wait for access expiry → make request | Middleware issues new access token, request succeeds |
| JWT refresh: expired refresh token | Login → wait for refresh expiry → make request | Redirect to /login |
| Email verification: valid token | Register → click verification link | `emailVerified` updated, redirect to login |
| Email verification: expired token | Register → wait 24h → click link | Error page with re-send button |
| Email verification: tampered token | Modified JWT in URL | 400 error |

### E2E Tests (Playwright)

| Test | User Actions | Assertions |
|------|-------------|------------|
| Full registration flow | Fill form → submit → check email (mock) → click link → see login page | Registration success, verification success, login page displayed |
| Email login flow | Enter email + password → submit | Redirected to /dashboard, user name displayed |
| VK OAuth flow | Click "Войти через VK" → (mock OAuth) → callback | Redirected to /dashboard |
| Password reset flow | Click "Забыли пароль?" → enter email → check email (mock) → enter new password → login | Password changed, login succeeds |
| Rate limit display | Submit wrong password 6 times | "Подождите минуту" error after 5th attempt, retry button disabled |
| Logout flow | Click avatar → "Выйти" | Redirected to /login, cookies cleared |
| Protected route redirect | Navigate to /dashboard without auth | Redirected to /login |
| Registration validation | Submit form with invalid email | Inline error "Введите корректный email" |
| Registration validation | Submit form with short password | Inline error "Минимум 8 символов" |

---

## Performance Optimization

### Latency Budget

| Operation | Target | Actual (expected) | Notes |
|-----------|--------|-------------------|-------|
| bcrypt hash (12 rounds) | <500ms | ~250ms | Runs max 5 times/min/IP due to rate limit |
| bcrypt compare | <500ms | ~250ms | Same as hash |
| JWT sign (HS256) | <5ms | <1ms | CPU-bound, negligible |
| JWT verify (HS256) | <5ms | <1ms | Runs on every authenticated request (middleware) |
| Redis INCR (rate limit check) | <5ms | <1ms | In-memory operation |
| Prisma user lookup by email | <10ms | <5ms | Indexed unique field |
| Full registration request | <1s | ~500ms | bcrypt dominates |
| Full login request | <1s | ~400ms | bcrypt compare + JWT sign |
| Middleware JWT check | <5ms | <2ms | No DB call, pure crypto |

### Optimization Decisions

- **No database sessions:** JWT is stateless, eliminating a DB read on every request. BullMQ workers validate JWTs without DB access.
- **bcrypt 12 rounds (not 14):** Balances security (~250ms) vs. UX. 14 rounds would be ~1s, unacceptable for login.
- **Redis rate limiting (not in-memory):** Works across multiple web container instances. No state loss on restart.
- **Email index on User table:** Prisma `@unique` creates a B-tree index, ensuring O(log n) lookup for login and registration checks.
- **Middleware-level JWT validation:** Validates before hitting API routes, rejecting unauthorized requests early.

---

## Security Hardening Checklist

### Implemented (auth feature scope)

- [x] Passwords hashed with bcrypt (12 rounds, `bcryptjs`)
- [x] JWT stored in HttpOnly cookies (not localStorage, not sessionStorage)
- [x] SameSite=Lax on all auth cookies (Lax required for VK OAuth redirects)
- [x] Secure flag on cookies (HTTPS only)
- [x] Rate limiting: 5 auth attempts per minute per IP (Redis-backed)
- [x] Email enumeration prevented: password reset always returns success message
- [x] Login error message is generic: "Неверный email или пароль" (does not reveal which field is wrong)
- [x] Zod validation on all auth inputs (email format, password length, name length)
- [x] No plaintext secrets in logs (passwords, hashes, tokens never logged)
- [x] VK OAuth uses minimal scopes (profile only for auth)
- [x] JWT tokens have short lifetimes (15 min access, 7 day refresh)
- [x] Email verification required before login
- [x] Password reset tokens expire in 1 hour
- [x] Verification tokens expire in 24 hours
- [x] Prisma parameterized queries prevent SQL injection

### Planned (P1 — next sprint)

- [ ] CSRF token for non-SameSite browsers (fallback protection)
- [ ] CSP headers (Content-Security-Policy) configured in `next.config.js`
- [ ] Account lockout notification email after 5 failed attempts
- [ ] Login activity log (IP, device, timestamp) visible to user

### Planned (v2)

- [ ] Phone verification for free tier abuse prevention
- [ ] Two-factor authentication (TOTP via authenticator app)
- [ ] Session revocation (Redis blacklist for compromised JWTs)
- [ ] Brute-force detection across IPs (distributed attack pattern)
- [ ] Password strength meter (zxcvbn integration)

---

## Error Handling Strategy

### User-Facing Error Messages (Russian)

| Error Code | HTTP Status | Message |
|------------|-------------|---------|
| `AUTH_DUPLICATE_EMAIL` | 409 | "Email уже зарегистрирован" |
| `AUTH_INVALID_CREDENTIALS` | 401 | "Неверный email или пароль" |
| `AUTH_EMAIL_NOT_VERIFIED` | 403 | "Подтвердите email для входа" |
| `AUTH_RATE_LIMITED` | 429 | "Слишком много попыток. Подождите минуту" |
| `AUTH_TOKEN_EXPIRED` | 400 | "Ссылка устарела" |
| `AUTH_TOKEN_INVALID` | 400 | "Недействительная ссылка" |
| `AUTH_VK_CANCELLED` | — | "VK авторизация отменена" (redirect param) |
| `AUTH_VK_ERROR` | 500 | "Ошибка авторизации через VK. Попробуйте позже" |
| `AUTH_PASSWORD_TOO_SHORT` | 400 | "Пароль должен быть не менее 8 символов" |
| `AUTH_INVALID_EMAIL` | 400 | "Введите корректный email" |
| `AUTH_COOKIES_DISABLED` | — | "Включите cookies в настройках браузера" |

### Error Handling Principles

1. **Never expose internal errors to users.** Prisma errors, JWT errors, Redis errors are caught and mapped to user-friendly codes.
2. **Never reveal account existence** in password reset or login flows. Same message for "user not found" and "wrong password."
3. **Log all auth errors** with structured context (Pino) for debugging, but strip sensitive fields.
4. **Rate limit errors include Retry-After header** so clients know when to retry.

---

## Monitoring and Observability

### Key Metrics (Prometheus)

| Metric | Type | Labels | Alert Threshold |
|--------|------|--------|-----------------|
| `auth_login_total` | Counter | `method` (email/vk), `result` (success/failure) | Failure rate >20% in 5 min |
| `auth_register_total` | Counter | `result` (success/duplicate/error) | Error rate >10% in 5 min |
| `auth_rate_limit_hits` | Counter | `endpoint` | >100 hits/min (possible attack) |
| `auth_password_reset_total` | Counter | `result` (requested/completed) | Completion rate <10% (email delivery issue) |
| `auth_jwt_refresh_total` | Counter | `result` (success/expired) | High expired rate (clock skew issue) |
| `auth_latency_seconds` | Histogram | `endpoint`, `method` | p99 >1s |

### Log Events (Pino, structured JSON)

```jsonc
// Successful login
{ "level": "info", "event": "auth.login.success", "userId": "uuid", "method": "email", "ip": "masked" }

// Failed login
{ "level": "warn", "event": "auth.login.failure", "email": "u***@example.com", "reason": "invalid_password", "ip": "masked" }

// Rate limit hit
{ "level": "warn", "event": "auth.rate_limit", "ip": "masked", "attempts": 6 }

// VK OAuth error
{ "level": "error", "event": "auth.vk.error", "error": "access_denied", "ip": "masked" }
```

---

## Dependencies and Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| VK OAuth API changes | Low | Medium | Abstract VK provider behind interface, monitor VK dev changelog |
| bcryptjs vulnerability | Very Low | High | Pin version, monitor npm advisories, can swap to argon2 |
| Redis downtime | Low | High (rate limiting fails open) | Rate limiter defaults to "allow" if Redis is down (fail-open), log warning |
| Email delivery failure (v2) | Medium | Medium | Verification email has retry button, MVP uses console.log |
| JWT secret compromise | Very Low | Critical | Rotate NEXTAUTH_SECRET, all existing tokens invalidated (acceptable for security incident) |
| Brute-force from distributed IPs | Medium | Medium | P1: add global rate limit by email (not just IP) |
