# Review Report: Dashboard (US-10a)

## Review Method

Brutal honesty review (Linus mode + Ramsay mode) using parallel review agents:

| Agent | Scope | Focus |
|-------|-------|-------|
| code-quality | 14 dashboard components | TypeScript strictness, naming, duplication, accessibility |
| architecture | Layout, page, nav, middleware | Auth flow, data flow, server/client split, Prisma patterns |
| security | Auth, headers, pagination, CSRF | Vulnerabilities, input validation, header spoofing |
| performance | Prisma queries, rendering, pagination | N+1, bundle size, loading states, index coverage |

## Summary

| Metric | Count |
|--------|-------|
| **Critical issues found** | 4 |
| **Major issues found** | 14 |
| **Minor issues found** | 12 |
| **Critical fixed** | 4 |
| **Major fixed** | 12 |
| **Minor fixed** | 8 |
| **Remaining (accepted)** | 6 |

## Critical Issues — All Fixed

| # | Issue | File | Fix |
|---|-------|------|-----|
| C1 | **JWT claim mismatch**: layout reads `payload.sub` but token stores `payload.id` — userId is `undefined` at runtime | layout.tsx | Switched to reading `x-user-*` headers from middleware |
| C2 | **Stale cookie after refresh**: layout reads old expired cookie while middleware refreshes — causes redirect to login every 15 min | layout.tsx | Same fix — read headers, not cookies |
| C3 | **Missing `downloading` status**: videos in downloading state show "Неизвестно" | status-badge.tsx | Added `downloading` entry, imported `VideoStatus` from `@clipmaker/types` |
| C4 | **`formatDuration` fractional seconds**: `totalSeconds % 60` produces decimals for non-integer input | format.ts | Added `Math.floor` |

## Major Issues — Fixed

| # | Issue | File | Fix |
|---|-------|------|-----|
| M1 | **Redundant JWT verification**: layout re-decodes JWT that middleware already verified — divergent auth paths | layout.tsx | Reads `x-user-*` headers (single source of truth: middleware) |
| M2 | **Header spoofing on public paths**: middleware didn't strip `x-user-*` headers on public routes — client could inject forged identity | middleware.ts | Strip `x-user-id/email/plan` headers on public paths |
| M3 | **`return null` on missing userId**: page silently renders nothing instead of redirecting | page.tsx | Changed to `redirect('/login')` |
| M4 | **`findUniqueOrThrow` on deleted user**: throws unhandled error instead of graceful redirect | page.tsx | Changed to `findUnique` + null check + redirect |
| M5 | **No page upper bound**: `?page=999999999` causes massive offset scan | page.tsx | Capped at `MAX_PAGE = 10000` |
| M6 | **Russian pluralization bug**: "1 клипов" instead of "1 клип" | format.ts, video-row.tsx | Added `pluralizeClips()` with Russian grammar rules |
| M7 | **`formatRelativeDate` creates 5 Date objects**: redundant `new Date(date)` per call | format.ts | Parse once at top, accept `Date \| string` |
| M8 | **Types not from `@clipmaker/types`**: `status: string` instead of `VideoStatus`, `planId: string` instead of `PlanId` | status-badge, plan-badge | Imported `VideoStatus`, `PlanId` from `@clipmaker/types` |
| M9 | **`aria-label` on `<div>` ignored by screen readers**: stat cards and plan badge used div with aria-label but no role | stat-card, plan-badge, minutes-card | Changed to `<section>` elements |
| M10 | **Pagination missing semantic nav**: no `<nav>` wrapper, no aria-labels on buttons | pagination-controls.tsx | Added `<nav aria-label>`, `aria-label` on buttons |
| M11 | **Loading skeleton mismatch**: 5 video rows vs 10 actual — causes ~300px layout shift | loading.tsx | Changed to 10 rows, added `role="status"` |
| M12 | **Suspense without fallback**: PaginationControls Suspense rendered null during suspension | video-list.tsx | Added `fallback={<div className="h-10" />}` |

## Minor Issues — Fixed

| # | Issue | File | Fix |
|---|-------|------|-----|
| m1 | **`Intl.DateTimeFormat` in render path**: new instance per render | plan-badge.tsx | Moved to module-level const |
| m2 | **Error digest leak in production**: `error.digest` shown to all users | error.tsx | Wrapped in `process.env.NODE_ENV !== 'production'` |
| m3 | **Icon size double-specified**: span wrapper + icon both have `h-5 w-5` | stat-card.tsx | Removed sizing from span wrapper |
| m4 | **`minutesLimit === 0` edge case**: shows "0 из 0 мин" with empty progress bar | minutes-card.tsx | Renders "Лимит не установлен" instead |
| m5 | **`pointer-events-none` redundant**: native `disabled` already blocks keyboard | pagination-controls.tsx | Replaced with `cursor-not-allowed` |
| m6 | **Pagination shows when single page**: controls visible with only 1 page of data | pagination-controls.tsx | Return null when `!hasPrev && !hasMore` |
| m7 | **VideoThumbnail missing accessible role**: `aria-label` on div ignored | video-thumbnail.tsx | Added `role="img"` |
| m8 | **Removed totalPages**: pagination no longer shows "page X of Y" — just prev/next | pagination-controls.tsx | Shows "Страница X" (simpler, eliminates need for count-based total) |

## Remaining Issues (Accepted)

| # | Issue | Severity | Status | Rationale |
|---|-------|----------|--------|-----------|
| R1 | **Refresh token uses stale claims** (email, planId from 7-day-old token) | Major | Accepted | Requires `refreshTokenVersion` column + DB lookup from Edge. Plan for next sprint. |
| R2 | **No rate limiting on dashboard queries** | Major | Accepted | Requires Edge-compatible Redis client (e.g., `@upstash/redis`). Current `ioredis` is not Edge-compatible. |
| R3 | **Offset pagination degrades at scale** (large OFFSET scan) | Minor | Accepted | Acceptable for <1000 videos per user. Cursor-based pagination planned for scale phase. |
| R4 | **`formatRelativeDate` not testable** (uses `new Date()` internally) | Minor | Accepted | Server-side only. Can add optional `now` param when writing tests. |
| R5 | **No barrel export** (`components/dashboard/index.ts`) | Minor | Accepted | Direct imports are explicit and tree-shake well. |
| R6 | **CSRF on logout endpoint** (no Origin check) | Minor | Accepted | Mitigated by `SameSite=Lax` cookies. Forced logout is low-impact. |

## Architecture Decision: Layout Auth via Middleware Headers

**Problem**: Layout was re-decoding JWT from cookies, duplicating middleware work and reading stale cookies after refresh.

**Solution**: Layout reads `x-user-*` headers set by middleware (single source of truth).

```
Request Flow:
  Browser → Edge Middleware → verify JWT → set x-user-* headers
  → Layout reads x-user-id/email/plan from headers → passes user to DashboardNav
  → Page reads x-user-id from headers → parallel Prisma queries
```

## Files Modified

| File | Changes |
|------|---------|
| `app/(dashboard)/layout.tsx` | Read headers instead of jose JWT decode |
| `app/(dashboard)/dashboard/page.tsx` | redirect, findUnique, page cap, videoCount |
| `app/(dashboard)/dashboard/loading.tsx` | 10 skeleton rows, role="status" |
| `app/(dashboard)/dashboard/error.tsx` | Hide digest in production |
| `components/dashboard/stats-grid.tsx` | Accept videoCount prop |
| `components/dashboard/stat-card.tsx` | section element, remove icon sizing |
| `components/dashboard/minutes-card.tsx` | section element, handle 0 limit |
| `components/dashboard/plan-badge.tsx` | PlanId type, section, cached formatter |
| `components/dashboard/status-badge.tsx` | VideoStatus type, add downloading |
| `components/dashboard/video-row.tsx` | pluralizeClips |
| `components/dashboard/video-list.tsx` | Remove totalPages, Suspense fallback |
| `components/dashboard/pagination-controls.tsx` | nav wrapper, aria, hide when single page |
| `components/dashboard/video-thumbnail.tsx` | role="img" |
| `lib/utils/format.ts` | Floor seconds, single Date parse, pluralizeClips |
| `middleware.ts` | Strip x-user-* headers on public paths |
