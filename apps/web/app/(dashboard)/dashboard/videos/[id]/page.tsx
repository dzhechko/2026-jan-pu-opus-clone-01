import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { prisma } from '@clipmaker/db';
import { ClipList } from '@/components/clips/clip-list';
import { TranscriptViewer } from '@/components/transcript/transcript-viewer';

export default async function VideoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headerStore = await headers();
  const userId = headerStore.get('x-user-id');
  const userPlan = headerStore.get('x-user-plan') ?? 'free';

  if (!userId) return null;

  const video = await prisma.video.findFirst({
    where: { id, userId },
    include: {
      transcript: { select: { language: true, tokenCount: true, sttModel: true } },
      clips: {
        orderBy: { createdAt: 'desc' },
        include: { publications: true },
      },
    },
  });

  if (!video) notFound();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{video.title}</h1>
        <div className="flex gap-4 mt-2 text-sm text-gray-500">
          <span>Статус: {video.status}</span>
          {video.durationSeconds && <span>{Math.round(video.durationSeconds / 60)} мин</span>}
          {video.transcript && <span>STT: {video.transcript.sttModel}</span>}
        </div>
      </div>

      <div className="space-y-6">
        <TranscriptViewer videoId={video.id} videoStatus={video.status} />
        <ClipList
          clips={video.clips}
          videoId={video.id}
          videoStatus={video.status}
          userPlan={userPlan}
        />
      </div>
    </div>
  );
}
