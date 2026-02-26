# Dashboard Analytics — Research Findings

## Existing Codebase Analysis

### Publication Model (schema.prisma)
The Publication model already contains all needed metrics:
- `views: Int @default(0)` — collected by stats-collector
- `likes: Int @default(0)` — collected by stats-collector
- `shares: Int @default(0)` — collected by stats-collector
- `platform: PublicationPlatform` — enum: vk, rutube, dzen, telegram
- `status: PublicationStatus` — filter by 'published'
- `publishedAt: DateTime?` — for timeline aggregation
- `lastStatsSync: DateTime?` — to show data freshness

### Stats Collector Worker
- Runs via BullMQ job per publication
- Calls platform-specific `getStats()` API
- Updates views, likes, shares, lastStatsSync
- Handles nullable likes/shares (Telegram doesn't support all metrics)
- Concurrency: 5 parallel jobs

### Existing Dashboard Pattern
- `dashboard/page.tsx` uses Server Components with direct Prisma calls
- Uses `Promise.all()` for parallel queries
- Components: StatsGrid, StatCard, MinutesCard, PlanBadge
- Pattern: RSC fetches data, passes to presentation components

### Existing tRPC Pattern
- `clip.ts` already includes publications in CLIP_PUBLIC_SELECT
- `protectedProcedure` middleware handles auth
- Zod for input validation
- TRPCError for error responses

## Technology Research

### Chart Options Considered
| Option | Bundle Size | Decision |
|--------|------------|----------|
| Recharts | ~200KB | Too heavy for MVP |
| Chart.js | ~170KB | Too heavy for MVP |
| CSS-only bars | 0KB | Selected — sufficient for daily bar chart |
| SVG hand-rolled | 0KB | Considered — CSS bars simpler |

### Prisma Aggregation Capabilities
- `groupBy` supports GROUP BY with `_sum`, `_count`, `_avg`, `_min`, `_max`
- `aggregate` supports SUM/COUNT on full result set
- No native DATE_TRUNC — need JS aggregation for timeline or raw SQL
- Decision: JS aggregation for MVP (30-day window = max ~30 publications per day per user)

## Competitor Analysis

| Feature | Opus Clip | Vidyo.ai | KlipMeiker (planned) |
|---------|-----------|----------|---------------------|
| Views tracking | Yes | No | Yes |
| Platform breakdown | Limited | No | Yes |
| Timeline chart | Yes (7d) | No | Yes (30d) |
| Export analytics | Yes (Pro) | No | Out of scope |
