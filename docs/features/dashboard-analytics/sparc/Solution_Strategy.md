# Dashboard Analytics — Solution Strategy

## First Principles Analysis

### Fundamental Truths
1. Publication stats (views, likes, shares) already exist in PostgreSQL
2. Stats are collected every 6h by the stats-collector worker
3. The data model is simple: Publication belongs to Clip belongs to User
4. Aggregation queries are well-suited to SQL GROUP BY operations
5. The UI framework (Next.js + tRPC + Tailwind) is already established

### Core Problem Decomposition
- **Data Access**: How to efficiently aggregate publication stats per user
- **Data Presentation**: How to display aggregates, breakdowns, rankings, and trends
- **Performance**: How to keep queries fast as data grows
- **Security**: How to ensure strict per-user data isolation

## 5 Whys

1. Why can't users see analytics? -- No analytics page exists
2. Why no analytics page? -- F10 was partially implemented (basic counts only)
3. Why only basic counts? -- MVP prioritized the pipeline (upload-process-publish)
4. Why does this matter now? -- Users are publishing and need to evaluate ROI
5. Why not just show stats on clip cards? -- Aggregate trends and comparisons require a dedicated view

## SCQA Framework

- **Situation**: Users create and publish clips to 4 platforms. Stats are collected automatically.
- **Complication**: Aggregated performance data is not visible anywhere. Users must manually check each clip.
- **Question**: How do we surface publication performance in a clear, actionable analytics page?
- **Answer**: A new `/dashboard/analytics` page with tRPC backend, using SQL aggregation for performance, Tailwind for responsive UI, and CSS-based chart for timeline visualization (no extra dependencies).

## Solution Synthesis

### Architecture Decision: Server Components + tRPC

Use Next.js Server Components for the analytics page with tRPC queries:
- **Rationale**: Data is read-only, no client interactivity needed for initial render
- **Trade-off**: Less interactive but faster initial load, simpler code
- **Chart**: Use a lightweight CSS-based bar chart to avoid adding chart library dependencies

### Data Strategy: Prisma Aggregation

Use Prisma's `groupBy` and `aggregate` for all analytics queries:
- **Rationale**: Type-safe, no raw SQL, leverages existing indexes
- **Trade-off**: Slightly less flexible than raw SQL but safer and more maintainable
- Add database index on `publications.clip_id` + join through clips for user filtering

### Security Strategy: User Isolation via JOIN

All queries filter through the Clip model's `userId` field:
- Publication -> Clip (clipId) -> User (userId = session.user.id)
- This is already the established pattern in the codebase (see clip.ts)
