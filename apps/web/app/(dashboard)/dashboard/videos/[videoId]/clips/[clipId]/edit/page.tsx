import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { prisma } from '@clipmaker/db';
import { generateDownloadUrl } from '@clipmaker/s3';
import { ClipEditor } from './clip-editor';
import type { ClipData } from '@/lib/stores/clip-editor-store';
import type { ViralityScore, SubtitleSegment, CTA, ClipFormat, ClipStatus } from '@clipmaker/types';

type PageProps = {
  params: Promise<{ videoId: string; clipId: string }>;
};

export default async function ClipEditorPage({ params }: PageProps) {
  const { videoId, clipId } = await params;
  const headerStore = await headers();
  const userId = headerStore.get('x-user-id');

  if (!userId) {
    redirect('/login');
  }

  const clip = await prisma.clip.findFirst({
    where: {
      id: clipId,
      videoId: videoId,
      userId,
    },
    include: {
      video: {
        select: {
          id: true,
          title: true,
          filePath: true,
          durationSeconds: true,
          status: true,
        },
      },
    },
  });

  if (!clip) {
    notFound();
  }

  // Generate presigned URL for video source playback
  const videoSourceUrl = await generateDownloadUrl(clip.video.filePath);

  // Generate presigned URL for rendered clip (if ready)
  const clipPreviewUrl = clip.filePath
    ? await generateDownloadUrl(clip.filePath)
    : null;

  const clipData: ClipData = {
    id: clip.id,
    videoId: clip.videoId,
    title: clip.title,
    description: clip.description,
    startTime: clip.startTime,
    endTime: clip.endTime,
    duration: clip.duration,
    format: clip.format as ClipFormat,
    subtitleSegments: (clip.subtitleSegments as SubtitleSegment[]) ?? [],
    cta: (clip.cta as CTA) ?? null,
    viralityScore: clip.viralityScore as ViralityScore,
    status: clip.status as ClipStatus,
    thumbnailPath: clip.thumbnailPath,
  };

  return (
    <div className="flex flex-col h-full">
      <nav className="px-6 py-3 text-sm text-muted-foreground">
        <a href="/dashboard" className="hover:text-foreground transition-colors">
          Дашборд
        </a>
        <span className="mx-2">/</span>
        <a
          href={`/dashboard/videos/${videoId}`}
          className="hover:text-foreground transition-colors"
        >
          {clip.video.title}
        </a>
        <span className="mx-2">/</span>
        <span className="text-foreground">Редактор клипа</span>
      </nav>

      <ClipEditor
        clip={clipData}
        video={{
          id: clip.video.id,
          title: clip.video.title,
          durationSeconds: clip.video.durationSeconds,
        }}
        videoSourceUrl={videoSourceUrl}
        clipPreviewUrl={clipPreviewUrl}
      />
    </div>
  );
}
