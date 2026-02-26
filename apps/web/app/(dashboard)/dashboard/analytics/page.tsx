import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@clipmaker/db';
import { OverviewCards } from '@/components/analytics/overview-cards';
import { PlatformTable } from '@/components/analytics/platform-table';
import { TopClipsTable } from '@/components/analytics/top-clips-table';
import { TimelineChart } from '@/components/analytics/timeline-chart';
import { AnalyticsEmpty } from '@/components/analytics/analytics-empty';

const TIMELINE_DAYS = 30;
const TOP_CLIPS_LIMIT = 10;

export default async function AnalyticsPage() {
  const headerStore = await headers();
  const userId = headerStore.get('x-user-id');

  if (!userId) {
    redirect('/login');
  }

  // Parallel queries for all analytics data
  const [overview, byPlatform, topClips, timelineRaw] = await Promise.all([
    // 1. Aggregate overview
    prisma.publication.aggregate({
      where: {
        status: 'published',
        clip: { userId },
      },
      _sum: {
        views: true,
        likes: true,
        shares: true,
      },
      _count: true,
    }),

    // 2. Per-platform breakdown
    prisma.publication.groupBy({
      by: ['platform'],
      where: {
        status: 'published',
        clip: { userId },
      },
      _sum: {
        views: true,
        likes: true,
        shares: true,
      },
      _count: true,
      orderBy: {
        _sum: {
          views: 'desc',
        },
      },
    }),

    // 3. Top clips
    prisma.publication.findMany({
      where: {
        status: 'published',
        clip: { userId },
      },
      orderBy: {
        views: 'desc',
      },
      take: TOP_CLIPS_LIMIT,
      select: {
        id: true,
        platform: true,
        views: true,
        likes: true,
        shares: true,
        publishedAt: true,
        platformUrl: true,
        clip: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    }),

    // 4. Timeline data
    (() => {
      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - TIMELINE_DAYS + 1);
      startDate.setHours(0, 0, 0, 0);

      return prisma.publication.findMany({
        where: {
          status: 'published',
          clip: { userId },
          publishedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          publishedAt: true,
          views: true,
        },
      });
    })(),
  ]);

  const totalViews = overview._sum.views ?? 0;
  const totalLikes = overview._sum.likes ?? 0;
  const totalShares = overview._sum.shares ?? 0;
  const publishedCount = overview._count;
  const isEmpty = publishedCount === 0;

  // Build platform data
  const platformData = byPlatform.map((g) => ({
    platform: g.platform,
    publicationCount: g._count,
    totalViews: g._sum.views ?? 0,
    totalLikes: g._sum.likes ?? 0,
    totalShares: g._sum.shares ?? 0,
  }));

  // Build top clips data
  const topClipsData = topClips.map((p) => ({
    publicationId: p.id,
    clipId: p.clip.id,
    clipTitle: p.clip.title,
    platform: p.platform,
    views: p.views,
    likes: p.likes,
    shares: p.shares,
    publishedAt: p.publishedAt,
    platformUrl: p.platformUrl,
  }));

  // Build timeline data with day fill
  const timelineData = buildTimeline(timelineRaw, TIMELINE_DAYS);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Аналитика</h1>

      {isEmpty ? (
        <AnalyticsEmpty />
      ) : (
        <>
          <OverviewCards
            totalViews={totalViews}
            totalLikes={totalLikes}
            totalShares={totalShares}
            publishedCount={publishedCount}
          />

          <PlatformTable data={platformData} />

          <TopClipsTable clips={topClipsData} />

          <TimelineChart data={timelineData} />
        </>
      )}
    </div>
  );
}

/**
 * Build a complete timeline array with all days filled (missing days get 0 views).
 */
function buildTimeline(
  publications: Array<{ publishedAt: Date | null; views: number }>,
  days: number,
): Array<{ date: string; views: number }> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days + 1);

  const byDay = new Map<string, number>();

  // Initialize all days with 0
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, 0);
  }

  // Sum views per day
  for (const pub of publications) {
    if (!pub.publishedAt) continue;
    const key = pub.publishedAt.toISOString().slice(0, 10);
    if (byDay.has(key)) {
      byDay.set(key, (byDay.get(key) ?? 0) + pub.views);
    }
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, views]) => ({ date, views }));
}
