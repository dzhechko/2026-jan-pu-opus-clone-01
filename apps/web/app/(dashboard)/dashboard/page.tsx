import { headers } from 'next/headers';
import { prisma } from '@clipmaker/db';
import { StatsGrid } from '@/components/dashboard/stats-grid';
import { VideoList } from '@/components/dashboard/video-list';
import { EmptyState } from '@/components/dashboard/empty-state';

const PAGE_SIZE = 10;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const headerStore = await headers();
  const userId = headerStore.get('x-user-id');

  if (!userId) return null;

  const rawPage = (await searchParams).page;
  const page = Math.max(1, parseInt(rawPage ?? '') || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [user, videoCount, clipCount, videos] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        minutesUsed: true,
        minutesLimit: true,
        planId: true,
        subscription: { select: { currentPeriodEnd: true } },
      },
    }),

    prisma.video.count({
      where: { userId },
    }),

    prisma.clip.count({
      where: { userId },
    }),

    prisma.video.findMany({
      where: { userId },
      take: PAGE_SIZE + 1,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        durationSeconds: true,
        createdAt: true,
        _count: { select: { clips: true } },
      },
    }),
  ]);

  const hasMore = videos.length > PAGE_SIZE;
  const displayVideos = videos.slice(0, PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(videoCount / PAGE_SIZE));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Дашборд</h1>

      <StatsGrid
        user={user}
        videoCount={videoCount}
        clipCount={clipCount}
      />

      {videoCount === 0 ? (
        <EmptyState />
      ) : (
        <VideoList
          videos={displayVideos}
          currentPage={page}
          totalPages={totalPages}
          hasMore={hasMore}
        />
      )}
    </div>
  );
}
