import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { prisma } from '@clipmaker/db';
import { ClipList } from '@/components/clips/clip-list';
import { TranscriptViewer } from '@/components/transcript/transcript-viewer';

export default async function VideoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const video = await prisma.video.findFirst({
    where: { id, userId: session.user.id },
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
        <ClipList clips={video.clips} videoStatus={video.status} />
      </div>
    </div>
  );
}
