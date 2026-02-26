# Dashboard Analytics — Refinement

## Edge Cases Matrix

| # | Edge Case | Handling |
|---|-----------|----------|
| 1 | User has 0 publications | Show empty state with message |
| 2 | User has clips but none published | Show empty state (published count = 0) |
| 3 | Publications exist but all have 0 views | Show cards with 0 values, empty timeline |
| 4 | Stats sync hasn't run yet (lastStatsSync = null) | Show whatever data exists (likely 0) |
| 5 | User has 10,000+ publications | Prisma aggregation handles this; consider pagination for topClips |
| 6 | publishedAt is null (rare edge case) | Skip in timeline aggregation, still count in overview |
| 7 | Very long clip titles in top clips table | Truncate to 60 chars with ellipsis |
| 8 | Single platform only | Platform table shows 1 row; no issues |
| 9 | Timeline with all days = 0 | Show empty bars for all 30 days |
| 10 | Concurrent stats update while page loads | Acceptable: eventual consistency within 6h |

## Testing Strategy

### Unit Tests (Vitest)
- `analytics.overview`: Returns correct aggregates for mock data
- `analytics.byPlatform`: Groups correctly, sorts by views DESC
- `analytics.topClips`: Limits correctly, sorts by views DESC
- `analytics.timeline`: Fills missing days with 0, correct date range
- User isolation: Cannot see other users' publications

### Integration Tests (Vitest + testcontainers)
- Full tRPC call with seeded database
- Verify aggregation accuracy against known data

### E2E Tests (Playwright)
- Navigate to analytics page from dashboard
- Verify summary cards render
- Verify platform table shows correct platforms
- Verify empty state renders for new users

## Performance Optimizations

1. **SQL Aggregation**: Use Prisma `groupBy` and `aggregate` instead of fetching all records
2. **Limit Timeline Data**: Cap at 90 days maximum, default 30
3. **Top Clips Limit**: Cap at 50, default 10
4. **No Real-Time**: Serve cached/static data (stats are 6h stale anyway)
5. **Server Component**: No JS bundle for analytics page body

## Security Hardening

1. All queries include `clip: { userId }` — verified by type system
2. Input validation: `limit` capped at 50, `days` capped at 90
3. No sensitive data in response (no file paths, internal IDs are OK since they're UUIDs)
4. Rate limiting via existing middleware (100 req/min)

## Technical Debt Items

- [ ] Timeline aggregation in JS (should be SQL DATE_TRUNC for scale)
- [ ] No caching layer (Redis cache could reduce DB load for repeat views)
- [ ] No date range picker (hardcoded 30 days)
