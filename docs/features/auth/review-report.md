# Review Report: Authentication

## Review Method

Brutal honesty review (Linus mode + Ramsay mode) using parallel review agents:

| Agent | Scope | Focus |
|-------|-------|-------|
| code-quality | `lib/auth/*` | JWT, cookies, rate limiting, password, VK provider |
| architecture | `middleware.ts`, `trpc/context.ts`, `options.ts` | Dual auth system, session flow |
| security | API routes, registration, verify-email | Vulnerabilities, input validation |

## Summary

| Metric | Count |
|--------|-------|
| **Critical issues found** | 5 |
| **Major issues found** | 9 |
| **Minor issues found** | 7 |
| **Critical fixed** | 5 |
| **Major fixed** | 9 |
| **Minor fixed** | 5 |
| **Remaining (accepted)** | 2 |

## Critical Issues — All Fixed

| # | Issue | File | Fix |
|---|-------|------|-----|
| C1 | **Cookie name mismatch**: middleware reads `access_token`, cookies.ts wrote `clipmaker_access_token` — auth completely broken | cookies.ts | Changed to `access_token`/`refresh_token` |
| C2 | **Refresh token missing `type: 'refresh'` field**: middleware checks `payload.type !== 'refresh'` — silent refresh never works | jwt.ts | Added `type: 'refresh'` and full user claims to signRefreshToken |
| C3 | **Dual auth system conflict**: NextAuth issues `next-auth.session-token`, middleware reads custom `access_token` — two systems never converge, all protected routes fail | Multiple | Created custom `/api/auth/login` route for credentials, `/api/auth/session-bridge` for VK OAuth → custom JWT bridge |
| C4 | **Rate limiter crashes app on missing REDIS_URL**: `throw new Error()` at module level kills entire app if Redis unavailable | rate-limit.ts | Fail open pattern — `redis` is `null` if unavailable, `checkRateLimit` returns immediately |
| C5 | **tRPC context used `getServerSession` (NextAuth) instead of middleware headers**: completely disconnected from JWT auth system | context.ts | Reads `x-user-*` headers from middleware, passes `clientIp` for rate limiting |

## Major Issues — All Fixed

| # | Issue | File | Fix |
|---|-------|------|-----|
| M1 | **Refresh cookie path `/api/auth`**: middleware reads cookies on `/dashboard` etc., but cookie with path `/api/auth` isn't sent on those routes | cookies.ts | Changed path to `/` |
| M2 | **NextAuth session.maxAge = 15 min**: kills entire NextAuth session, not just access token — VK OAuth bridge would fail after 15 min | options.ts | Changed to 7 days (matches refresh token lifetime) |
| M3 | **VK OAuth missing email-based account linking**: only looks up by vkId, user with same email gets duplicate account | options.ts | Added email-based fallback: if vkId not found, try email match and link |
| M4 | **VK provider `...options` spread at end**: can override `id`, `type`, `authorization`, `token` — security-critical fields | vk-provider.ts | Moved `...options` before security fields |
| M5 | **INCR/EXPIRE race condition**: non-atomic operations could miss setting TTL if server crashes between INCR and EXPIRE | rate-limit.ts | Used Redis pipeline for atomic execution |
| M6 | **Registration rate limit uses global key `'trpc-register'`**: ALL users share one counter — single attacker blocks everyone | user.ts + context.ts | Uses per-IP key from `ctx.clientIp` |
| M7 | **Email existence leak on registration**: `CONFLICT` error reveals whether email is registered | user.ts | Returns same success message regardless; silently skips if email exists |
| M8 | **Login page missing Suspense boundary for `useSearchParams`**: causes Next.js build error in App Router | login/page.tsx | Wrapped in `<Suspense>` with `LoginForm` inner component |
| M9 | **Login page doesn't pass rememberMe to auth**: checkbox has no effect | login/page.tsx | Custom login API receives `rememberMe`, issues 30-day refresh token |

## Minor Issues — Fixed

| # | Issue | File | Fix |
|---|-------|------|-----|
| m1 | **Register page duplicates Zod schema** instead of importing from schemas.ts | register/page.tsx | Imports `registerSchema` from `@/lib/auth/schemas` |
| m2 | **Register page leaks raw tRPC errors** to user | register/page.tsx | Shows generic error message, specific message only for rate limiting |
| m3 | **VK button uses `e.target` instead of `e.currentTarget`**: hover breaks when clicking SVG child | login/page.tsx, register/page.tsx | Used Tailwind classes `bg-[#0077FF] hover:bg-[#0066DD]` instead of JS hover |
| m4 | **Register page missing Suspense boundary** | register/page.tsx | Added `<Suspense>` wrapper |
| m5 | **verify-email doesn't validate email matches token**: could verify wrong user's email | verify-email/route.ts | Added email match check + user existence check |

## Remaining Issues (Accepted)

| # | Issue | Severity | Status | Rationale |
|---|-------|----------|--------|-----------|
| R1 | **NextAuth CredentialsProvider still exists** alongside custom login route | Minor | Accepted | Needed for NextAuth's internal session management used by session-bridge. Will be removed when VK OAuth is migrated to fully custom flow |
| R2 | **Email sending is TODO** (console.log placeholder) | Minor | Accepted | Requires email provider integration (Resend/SendGrid) — separate feature |

## Architecture Decision: Auth Unification

**Problem**: Two independent auth systems (NextAuth + custom JWT) that never converged.

**Solution**: Custom JWT as primary, NextAuth as OAuth-only bridge.

```
Credentials Login:
  Browser → POST /api/auth/login → validate → signAccessToken + signRefreshToken → set cookies

VK OAuth:
  Browser → NextAuth signIn('vk') → OAuth callback → NextAuth session
  → redirect to /api/auth/session-bridge → read NextAuth session → issue custom JWT cookies

All Protected Routes:
  Browser → Edge middleware → verify access_token (jose) → set x-user-* headers
  → tRPC/Server Components read headers

Token Refresh:
  Middleware detects expired access_token → verify refresh_token → issue new access_token cookie

Logout:
  POST /api/auth/logout → clear custom JWT cookies + NextAuth session cookie
```

## Files Modified

| File | Changes |
|------|---------|
| `lib/auth/cookies.ts` | Cookie names aligned, refresh path `/` |
| `lib/auth/jwt.ts` | signRefreshToken includes `type: 'refresh'` + full claims |
| `lib/auth/rate-limit.ts` | Fail open, pipeline atomic INCR/EXPIRE |
| `lib/auth/options.ts` | session.maxAge 7d, VK email linking |
| `lib/auth/vk-provider.ts` | Options spread order |
| `lib/trpc/context.ts` | Reads x-user-* headers + clientIp |
| `app/api/trpc/[trpc]/route.ts` | Passes request to context |
| `app/api/auth/login/route.ts` | **New** — custom credentials login |
| `app/api/auth/session-bridge/route.ts` | **New** — VK OAuth → JWT bridge |
| `app/api/auth/logout/route.ts` | Clears both cookie systems |
| `app/api/auth/verify-email/route.ts` | Email match check, idempotent |
| `app/(auth)/login/page.tsx` | Custom login API, Suspense, Zod validation |
| `app/(auth)/register/page.tsx` | Suspense, shared schema, error handling |
| `lib/trpc/routers/user.ts` | Per-IP rate limit, no email leak |
