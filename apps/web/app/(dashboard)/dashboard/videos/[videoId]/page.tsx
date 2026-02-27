import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { prisma } from '@clipmaker/db';
import { VideoDetail } from '@/components/video/video-detail';

export default async function VideoDetailPage({ params }: { params: Promise<{ videoId: string }> }) {
  const { videoId: id } = await params;
  const headerStore = await headers();
  const userId = headerStore.get('x-user-id');
  const userPlan = headerStore.get('x-user-plan') ?? 'free';

  if (!userId) return null;

  // Quick existence check — all data fetched client-side with polling
  const video = await prisma.video.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!video) notFound();

  return <VideoDetail videoId={id} userPlan={userPlan} />;
}
