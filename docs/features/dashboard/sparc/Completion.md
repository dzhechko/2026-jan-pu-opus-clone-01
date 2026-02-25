# Completion — Dashboard Enhancement

## Deployment Requirements

### Infrastructure Changes

**None required.** This is a code-only enhancement to the existing dashboard. No new services, databases, or infrastructure components.

### Environment Variables

**No new env vars needed.** Uses existing:
- `NEXTAUTH_SECRET` — for JWT decode via jose (already set)
- `DATABASE_URL` — for Prisma queries (already set)

---

## Files to Modify

| File | Change Description |
|------|-------------------|
| `apps/web/app/(dashboard)/layout.tsx` | Replace `getServerSession` with jose JWT decode; unify auth check with middleware pattern |
| `apps/web/app/(dashboard)/dashboard/page.tsx` | Rewrite with Server Component data fetching, stats grid, video list, pagination |
| `apps/web/components/dashboard-nav.tsx` | Update to receive user data from layout, fix navigation active states |

## Files to Create

| File | Description |
|------|-------------|
| `apps/web/app/(dashboard)/loading.tsx` | Skeleton UI with animate-pulse for dashboard segment |
| `apps/web/app/(dashboard)/error.tsx` | Error boundary with retry button (`'use client'`) |
| `apps/web/app/(dashboard)/not-found.tsx` | 404 state for invalid dashboard routes |
| `apps/web/components/dashboard/stats-grid.tsx` | Stats cards grid: total videos, processing, completed, published |
| `apps/web/components/dashboard/video-list.tsx` | Video grid/list with thumbnails, titles, status, dates |
| `apps/web/components/dashboard/status-badge.tsx` | Color-coded status indicator for video states |
| `apps/web/components/dashboard/empty-state.tsx` | Empty state with illustration and upload CTA |
| `apps/web/components/dashboard/pagination.tsx` | Page navigation with URL-based state management |

## Files to Create (Tests)

| File | Description |
|------|-------------|
| `apps/web/__tests__/dashboard/status-badge.test.tsx` | Unit tests for all status variants |
| `apps/web/__tests__/dashboard/pagination.test.ts` | Unit tests for pagination math |
| `apps/web/__tests__/dashboard/auth-decode.test.ts` | Unit tests for JWT decode utility |
| `apps/web/__tests__/dashboard/page.test.tsx` | Integration test for dashboard page |

---

## Database Changes

### No migrations needed.

Existing schema already has the required fields:
- `Video` model with `userId`, `status`, `title`, `createdAt`, `thumbnailUrl`
- `User` model with `id`, `email`, `name`

### Recommended index (if not exists):

```prisma
@@index([userId, createdAt(sort: Desc)])
```

Verify this index exists in `packages/db/prisma/schema.prisma`. If missing, add it as a separate migration before the dashboard enhancement.

---

## Rollout Plan

1. **Development:** Implement all components and tests on `feat/dashboard-enhancement` branch
2. **Testing:** Run full test suite (`npm run test`, `npm run test:e2e`, `npm run typecheck`)
3. **Review:** Code review + brutal-honesty-review (Phase 4)
4. **Merge:** Squash merge to `develop`, verify on staging
5. **Deploy:** Merge `develop` → `main`, auto-deploy to production

### Rollback Strategy

- All changes are UI-only — no database migrations to rollback
- Revert the merge commit if issues found in production
- No feature flags needed (enhancement, not new feature)

---

## Definition of Done

- [ ] Auth uses jose JWT decode (no getServerSession)
- [ ] Dashboard loads with skeleton UI (loading.tsx)
- [ ] Error boundary catches and displays errors with retry
- [ ] Stats grid shows video counts by status
- [ ] Video list displays with thumbnails, titles, status badges, dates
- [ ] Pagination works with URL params (?page=N)
- [ ] Empty state shown for users with 0 videos
- [ ] Mobile responsive at 375px, 768px, 1280px
- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] E2E test: login → dashboard → paginate → click video
- [ ] TypeScript: no type errors (`npm run typecheck`)
- [ ] Lint: no warnings (`npm run lint`)
- [ ] No new environment variables or infrastructure required
