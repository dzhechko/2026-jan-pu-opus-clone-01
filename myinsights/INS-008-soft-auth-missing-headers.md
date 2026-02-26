# INS-008: Soft-auth paths skip JWT → protectedProcedure fails

**Status:** 🟢 Active | **Hits:** 1 | **Created:** 2026-02-26

## Error Signatures
- `UNAUTHORIZED` on protectedProcedure (e.g., `video.createFromUpload`)
- `Сессия истекла. Войдите снова`
- `x-user-id` header is null/missing

## Root Cause
Initial fix for INS-001 added `/api/trpc/` to `PUBLIC_PATH_PREFIXES`. Public paths skip JWT verification entirely and strip `x-user-*` headers. This fixed publicProcedure (register) but broke protectedProcedure (upload) because middleware never set `x-user-id`.

## Solution
Replaced blanket public path with **soft-auth** approach:

```typescript
const SOFT_AUTH_PREFIXES = ['/api/trpc/'];

// In middleware:
const softAuth = isSoftAuthPath(pathname);

// If no tokens and soft auth → pass through (for publicProcedure)
if (!accessToken && !refreshToken) {
  if (softAuth) return NextResponse.next({ headers: cleanHeaders });
  return redirectToLogin(request);
}

// If tokens exist → verify JWT and set x-user-* headers (for protectedProcedure)
// If token invalid and soft auth → pass through instead of redirect
```

Key difference from public paths:
- **Public:** Always skip JWT, strip headers
- **Soft-auth:** Try JWT if available, set headers if valid, don't redirect if missing/invalid

## Files Changed
- `apps/web/middleware.ts`
