# Dashboard Analytics — Architecture

## Overview

The analytics feature follows the existing Distributed Monolith pattern. It adds a tRPC router (`analytics`) and a Next.js Server Component page within the dashboard route group.

## Component Architecture

```
apps/web/
├── app/(dashboard)/dashboard/analytics/
│   └── page.tsx                    # Server Component (main page)
├── components/analytics/
│   ├── overview-cards.tsx          # Summary cards (views, likes, shares, count)
│   ├── platform-table.tsx          # Platform breakdown table
│   ├── top-clips-table.tsx         # Top performing clips table
│   ├── timeline-chart.tsx          # CSS-based bar chart (client component)
│   └── analytics-empty.tsx         # Empty state
└── lib/trpc/routers/
    ├── analytics.ts                # New analytics tRPC router
    └── index.ts                    # Register analytics router
```

## Data Flow

```
[Browser] → GET /dashboard/analytics
         → [Next.js Server Component]
         → [tRPC Server-Side Call or Direct Prisma]
         → [PostgreSQL: publications JOIN clips]
         → [Aggregate data]
         → [Render HTML with Tailwind]
         → [Return to browser]
```

## Technology Choices

| Choice | Rationale |
|--------|-----------|
| Server Component page | Data is read-only, no client interactivity for initial render |
| Direct Prisma in page | Simpler than tRPC for server-only reads (follows dashboard/page.tsx pattern) |
| tRPC analytics router | For future client-side refetch, polling, or SPA navigation |
| CSS bar chart | Zero dependency, works everywhere, sufficient for MVP |
| No chart library | Avoids bundle bloat for a simple bar chart |

## Database Access Pattern

All queries follow the user isolation pattern:

```sql
-- Conceptual SQL (executed via Prisma)
SELECT platform, SUM(views), SUM(likes), SUM(shares), COUNT(*)
FROM publications p
JOIN clips c ON p.clip_id = c.id
WHERE c.user_id = $userId AND p.status = 'published'
GROUP BY platform;
```

### Existing Indexes Used
- `publications.clip_id` — `@@index([clipId])` on Publication model
- `clips.userId_createdAt` — `@@index([userId, createdAt(sort: Desc)])` on Clip model

### Index Consideration
The existing `clipId` index on publications is sufficient for the JOIN. The `userId` filter is applied through the clips table which has an index on `userId`.

## Security Architecture

1. **Authentication**: Dashboard layout already checks `x-user-id` header and redirects to `/login`
2. **Authorization**: All Prisma queries include `clip: { userId: session.user.id }` filter
3. **Data isolation**: No query returns data from other users' publications
4. **Rate limiting**: Not needed for read-only analytics (existing middleware handles abuse)
5. **Input validation**: Zod schemas for optional limit/days parameters

## Consistency with Project Architecture

- Follows `apps/web/app/(dashboard)/` route group pattern
- Uses existing component patterns (StatCard, section layout)
- Uses Prisma ORM (no raw SQL)
- Uses Zod for input validation
- Uses TypeScript strict mode
- Follows kebab-case file naming
