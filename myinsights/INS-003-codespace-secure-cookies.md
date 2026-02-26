# INS-003: Auth cookies rejected in Codespace HTTPS environment

**Status:** 🟢 Active | **Hits:** 1 | **Created:** 2026-02-26

## Error Signatures
- Login succeeds (200) but user stays on `/login`
- Cookies set without `Secure` flag
- Codespace proxy URL: `*.app.github.dev` (HTTPS)

## Root Cause
Auth cookies were set with `secure: process.env.NODE_ENV === 'production'` → `false` in dev. But Codespace port forwarding uses HTTPS (`*.app.github.dev`). Some browsers reject non-Secure cookies in HTTPS context, or the proxy strips them.

## Solution
Detect Codespace environment and set `Secure` flag:
```typescript
const USE_SECURE_COOKIES =
  IS_PRODUCTION ||
  !!process.env.CODESPACES ||
  !!process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
```

Apply in TWO places:
1. `apps/web/lib/auth/cookies.ts` — login endpoint
2. `apps/web/middleware.ts` — token refresh flow

## Environment Variables
- `CODESPACES=true` — always set in GitHub Codespaces
- `GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN=app.github.dev`

## Files Changed
- `apps/web/lib/auth/cookies.ts`
- `apps/web/middleware.ts`
