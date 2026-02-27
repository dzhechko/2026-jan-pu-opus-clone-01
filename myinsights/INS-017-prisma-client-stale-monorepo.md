# INS-017: Prisma Client stale after schema change in monorepo

**Status:** 🟢 Active | **Hits:** 1 | **Created:** 2026-02-27

## Error Signatures
- `Unknown field 'teamId' for select statement on model 'User'`
- `prisma db push` reports "already in sync" but runtime fails
- Any Prisma runtime error about unknown fields after schema changes

## Root Cause
In a Turborepo monorepo with `packages/db` containing the Prisma schema:
1. `prisma db push` syncs DB **and** regenerates `@prisma/client` in `node_modules/`
2. But the Next.js dev server may cache the **old** Prisma Client in memory
3. Also: `prisma migrate dev` may refuse to run (requires reset) — use `db push` for dev

The confusing part: `db push` says "already in sync" because the **DB** is in sync, but the **runtime client** loaded by the app is stale.

## Solution
After any schema change, always:
```bash
# 1. Push schema to DB + regenerate client
npx prisma db push --schema packages/db/prisma/schema.prisma

# 2. If still getting errors, force regenerate
npx prisma generate --schema packages/db/prisma/schema.prisma

# 3. Restart the Next.js dev server (Ctrl+C + npm run dev)
```

Key insight: **restart the dev server** after `prisma generate`. The running Next.js process has the old client cached.

## Prevention
- Always run `prisma db push` (not just `prisma generate`) after schema changes
- In CI: add `prisma generate` to the build step before `next build`
- Consider a `postinstall` script: `"postinstall": "prisma generate"`

## Files Changed
- `packages/db/prisma/schema.prisma` (schema changes)
- `node_modules/@prisma/client` (regenerated)
