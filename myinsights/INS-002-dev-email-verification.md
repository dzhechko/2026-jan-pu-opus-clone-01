# INS-002: Login fails in dev — no SMTP for email verification

**Status:** 🟢 Active | **Hits:** 1 | **Created:** 2026-02-26

## Error Signatures
- `EMAIL_NOT_VERIFIED`
- `Неверный email или пароль` (misleading — frontend maps some errors to generic message)
- User can register but can't login

## Root Cause
Registration creates user with `email_verified = false`. Verification link is only printed to `console.log` (no SMTP configured). Login endpoint checks `emailVerified` and returns 403 `EMAIL_NOT_VERIFIED`. Frontend shows "Подтвердите email. Проверьте почту." but no email was ever sent.

**Gotcha:** The Prisma schema uses `Boolean` for `emailVerified` (not `DateTime` like NextAuth default). Use `true`/`false`, not `new Date()`.

## Solution
In development mode, auto-verify email immediately after user creation:
```typescript
if (process.env.NODE_ENV === 'development') {
  await ctx.prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true }, // Boolean, NOT new Date()
  });
}
```

For existing unverified users:
```sql
UPDATE "users" SET "email_verified" = true WHERE "email_verified" = false;
```

Note: table is `"users"` (@@map), column is `"email_verified"` (@map), NOT `"User"` / `"emailVerified"`.

## Files Changed
- `apps/web/lib/trpc/routers/user.ts`
