# Dashboard Analytics — Pseudocode

## Data Structures

### AnalyticsOverview
```typescript
type AnalyticsOverview = {
  totalViews: number;
  totalLikes: number;
  totalShares: number;
  publishedCount: number;
};
```

### PlatformStats
```typescript
type PlatformStats = {
  platform: 'vk' | 'rutube' | 'dzen' | 'telegram';
  publicationCount: number;
  totalViews: number;
  totalLikes: number;
  totalShares: number;
};
```

### TopClip
```typescript
type TopClip = {
  clipId: string;
  clipTitle: string;
  platform: string;
  views: number;
  likes: number;
  shares: number;
  publishedAt: Date | null;
  platformUrl: string | null;
};
```

### TimelinePoint
```typescript
type TimelinePoint = {
  date: string; // YYYY-MM-DD
  views: number;
};
```

## API Contracts

### analytics.overview
```
Input: (none — uses session user)
Output: AnalyticsOverview

Algorithm:
1. Get all publications for user's clips (JOIN clip ON clip.userId = session.user.id)
2. Filter: status = 'published'
3. Aggregate: SUM(views), SUM(likes), SUM(shares), COUNT(*)
4. Return aggregated result
```

### analytics.byPlatform
```
Input: (none — uses session user)
Output: PlatformStats[]

Algorithm:
1. Get all published publications for user's clips
2. GROUP BY platform
3. For each group: COUNT(*), SUM(views), SUM(likes), SUM(shares)
4. Sort by totalViews DESC
5. Return array
```

### analytics.topClips
```
Input: { limit?: number } (default 10, max 50)
Output: TopClip[]

Algorithm:
1. Get all published publications for user's clips
2. JOIN clip to get title
3. ORDER BY views DESC
4. TAKE limit
5. Return with clip title, platform, views, likes, shares, publishedAt, platformUrl
```

### analytics.timeline
```
Input: { days?: number } (default 30, max 90)
Output: TimelinePoint[]

Algorithm:
1. Calculate date range: [today - days, today]
2. Get all published publications for user's clips where publishedAt within range
3. GROUP BY DATE(publishedAt)
4. SUM(views) per day
5. Fill missing days with 0 views
6. Return sorted by date ASC
```

## Query Patterns (Prisma)

### User-Scoped Publication Query
```typescript
// All analytics queries follow this pattern:
prisma.publication.findMany({
  where: {
    status: 'published',
    clip: { userId: session.user.id },
  },
  // ... specific select/groupBy
});

// For aggregation, use groupBy:
prisma.publication.groupBy({
  by: ['platform'],
  where: {
    status: 'published',
    clip: { userId: session.user.id },
  },
  _sum: { views: true, likes: true, shares: true },
  _count: true,
});
```

### Timeline Aggregation
```typescript
// Prisma doesn't support DATE() grouping natively.
// Strategy: Fetch raw publications with publishedAt, aggregate in JS.
// For MVP this is acceptable since we limit to 30 days.
// Optimization path: raw SQL query with DATE_TRUNC.

const publications = await prisma.publication.findMany({
  where: {
    status: 'published',
    clip: { userId },
    publishedAt: { gte: startDate, lte: endDate },
  },
  select: { publishedAt: true, views: true },
});

// Aggregate in JS
const byDay = new Map<string, number>();
for (const pub of publications) {
  const day = pub.publishedAt.toISOString().slice(0, 10);
  byDay.set(day, (byDay.get(day) ?? 0) + pub.views);
}
```

## Error Handling

| Error | Response | HTTP Code |
|-------|----------|-----------|
| Not authenticated | UNAUTHORIZED | 401 |
| Invalid input (limit < 0) | BAD_REQUEST | 400 |
| No publications found | Return empty/zero values | 200 |

## State Transitions

This feature is read-only. No state transitions.
