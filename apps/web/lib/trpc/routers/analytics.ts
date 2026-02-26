import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';

export const analyticsRouter = router({
  /**
   * Aggregate overview: total views, likes, shares, published count
   */
  overview: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const result = await ctx.prisma.publication.aggregate({
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
    });

    return {
      totalViews: result._sum.views ?? 0,
      totalLikes: result._sum.likes ?? 0,
      totalShares: result._sum.shares ?? 0,
      publishedCount: result._count,
    };
  }),

  /**
   * Per-platform aggregation: publication count, views, likes, shares per platform
   */
  byPlatform: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const groups = await ctx.prisma.publication.groupBy({
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
    });

    return groups.map((g) => ({
      platform: g.platform,
      publicationCount: g._count,
      totalViews: g._sum.views ?? 0,
      totalLikes: g._sum.likes ?? 0,
      totalShares: g._sum.shares ?? 0,
    }));
  }),

  /**
   * Top clips by views
   */
  topClips: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(50).default(10),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const limit = input?.limit ?? 10;

      const publications = await ctx.prisma.publication.findMany({
        where: {
          status: 'published',
          clip: { userId },
        },
        orderBy: {
          views: 'desc',
        },
        take: limit,
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
      });

      return publications.map((p) => ({
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
    }),

  /**
   * Timeline: daily views over the last N days
   */
  timeline: protectedProcedure
    .input(
      z
        .object({
          days: z.number().int().min(7).max(90).default(30),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const days = input?.days ?? 30;

      const endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days + 1);
      startDate.setHours(0, 0, 0, 0);

      const publications = await ctx.prisma.publication.findMany({
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

      // Aggregate views by day
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

      // Convert to sorted array
      const timeline = Array.from(byDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, views]) => ({ date, views }));

      return timeline;
    }),
});
