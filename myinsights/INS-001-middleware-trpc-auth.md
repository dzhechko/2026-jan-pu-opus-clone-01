# INS-001: Middleware blocks unauthenticated tRPC calls

**Status:** 🟢 Active | **Hits:** 1 | **Created:** 2026-02-26

## Error Signatures
- `307 redirect` from tRPC POST
- `UNAUTHORIZED` on `user.register`
- Registration form "hangs" (no response)

## Root Cause
`apps/web/middleware.ts` had a whitelist `PUBLIC_PATH_PREFIXES` that did NOT include `/api/trpc/`. All unauthenticated tRPC requests (like register) got 307 redirected to `/login`. The tRPC client doesn't handle redirects gracefully → form appears hung.

## Solution
Implemented "soft auth" for `/api/trpc/` paths:
- If JWT cookies exist → verify and set `x-user-*` headers (for protectedProcedure)
- If no cookies → let request through without redirect (for publicProcedure)
- tRPC handles its own auth via `protectedProcedure` / `publicProcedure`

**NOT** a blanket public path — that breaks protectedProcedure because middleware skips JWT verification and doesn't set x-user-* headers.

## Key Code
```typescript
// middleware.ts — SOFT_AUTH_PREFIXES
const SOFT_AUTH_PREFIXES = ['/api/trpc/'];

// In middleware function:
if (softAuth && !accessToken && !refreshToken) {
  // Strip injected headers, let tRPC handle auth
  return NextResponse.next({ request: { headers: cleanHeaders } });
}
```

## Files Changed
- `apps/web/middleware.ts`
