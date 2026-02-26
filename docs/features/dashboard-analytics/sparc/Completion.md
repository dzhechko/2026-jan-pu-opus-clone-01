# Dashboard Analytics — Completion

## Deployment Plan

### Pre-Deployment Checklist
- [ ] All tRPC router procedures have Zod input validation
- [ ] All queries scoped to authenticated user
- [ ] TypeScript compiles with no errors (`npm run typecheck`)
- [ ] Linting passes (`npm run lint`)
- [ ] Analytics router registered in main router
- [ ] Navigation link added
- [ ] Empty state handled

### Deployment Sequence
1. Deploy code (no migration needed — uses existing Publication model)
2. Verify analytics page loads on staging
3. Verify data accuracy against manual publication checks
4. Monitor query performance in production

### Rollback Plan
- Remove analytics route from navigation
- Feature is additive (no schema changes), safe to roll back by reverting code

## Monitoring & Alerting

| Metric | Threshold | Action |
|--------|-----------|--------|
| Page load time | > 2s | Check query performance, add indexes |
| Error rate | > 1% | Check Prisma query failures |
| 404 on /analytics | Any | Check route registration |

## Logging Strategy

- Log analytics page access (user_id, load_time_ms) via existing Pino logger
- No additional logging needed (read-only feature)

## Handoff Checklist

### Dev
- [ ] tRPC router with 4 procedures: overview, byPlatform, topClips, timeline
- [ ] Analytics page with 4 sections + empty state
- [ ] Navigation link with icon
- [ ] Responsive layout (mobile + desktop)

### QA
- [ ] Verify data matches individual clip publication stats
- [ ] Test with 0 publications (empty state)
- [ ] Test with many publications (performance)
- [ ] Test user isolation (user A cannot see user B data)
- [ ] Test responsive layout on mobile
