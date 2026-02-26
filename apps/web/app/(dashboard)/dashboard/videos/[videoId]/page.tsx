import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { prisma } from '@clipmaker/db';
import { generateDownloadUrl } from '@clipmaker/s3';
import { ClipList } from '@/components/clips/clip-list';
import { TranscriptViewer } from '@/components/transcript/transcript-viewer';

const useS3Proxy = process.env.NEXT_PUBLIC_USE_S3_PROXY === 'true';

export default async function VideoDetailPage({ params }: { params: Promise<{ videoId: string }> }) {
  const { videoId: id } = await params;
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

  // Generate thumbnail & video URLs: proxy path (dev) or presigned S3 URL (prod)
  const clipsWithUrls = await Promise.all(
    video.clips.map(async (clip) => {
      let thumbnailUrl: string | undefined;
      let videoUrl: string | undefined;
      if (clip.thumbnailPath) {
        thumbnailUrl = useS3Proxy
          ? `/api/clips/${clip.id}/thumbnail`
          : await generateDownloadUrl(clip.thumbnailPath);
      }
      if (clip.filePath && clip.status === 'ready') {
        videoUrl = useS3Proxy
          ? `/api/clips/${clip.id}/file`
          : await generateDownloadUrl(clip.filePath);
      }
      return { ...clip, thumbnailUrl, videoUrl };
    }),
  );

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
          clips={clipsWithUrls}
          videoId={video.id}
          videoStatus={video.status}
          userPlan={userPlan}
        />
      </div>
    </div>
  );
}
