# INS-006: DB schema out of sync after Prisma model changes

**Status:** 🟢 Active | **Hits:** 1 | **Created:** 2026-02-26

## Error Signatures
- `The column "file_size" does not exist in the current database`
- `P2022: The column X does not exist`
- Any Prisma runtime error about missing columns

## Root Cause
Prisma schema was updated (new columns added) but `prisma migrate dev` or `prisma db push` was not run. The generated Prisma Client expects columns that don't exist in the actual database.

## Solution
After any schema change, run:
```bash
npx prisma db push --schema packages/db/prisma/schema.prisma
```

For dev: `db push` is faster (no migration files).
For prod: use `prisma migrate dev --name <desc>`.

## Gotcha: Table/Column naming
Prisma models use camelCase but map to snake_case:
- Model `User` → table `"users"` (@@map)
- Field `emailVerified` → column `"email_verified"` (@map)
- Field `fileSize` → column `"file_size"` (@map)

When running raw SQL, use the mapped names:
```sql
UPDATE "users" SET "email_verified" = true;  -- NOT "User"."emailVerified"
```

## Files Changed
- `packages/db/prisma/schema.prisma` (source of truth)
