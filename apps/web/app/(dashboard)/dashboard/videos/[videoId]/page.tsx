import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { prisma } from '@clipmaker/db';
import { generateDownloadUrl } from '@clipmaker/s3';
import { ClipList } from '@/components/clips/clip-list';
import { TranscriptViewer } from '@/components/transcript/transcript-viewer';
import { VideoHeader } from '@/components/video/video-header';

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
      <VideoHeader
        videoId={video.id}
        title={video.title}
        status={video.status}
        durationSeconds={video.durationSeconds}
        sttModel={video.transcript?.sttModel ?? null}
      />

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
