'use client';

import { trpc } from '@/lib/trpc/client';
import { VideoHeader } from './video-header';
import { TranscriptViewer } from '@/components/transcript/transcript-viewer';
import { ClipList } from '@/components/clips/clip-list';
import { ProcessingProgress } from '@/components/dashboard/processing-progress';

const TERMINAL_STATUSES = new Set(['completed', 'failed']);
const PROCESSING_STATUSES = new Set(['downloading', 'transcribing', 'analyzing', 'generating_clips']);
const PROXY_ENABLED = process.env.NEXT_PUBLIC_USE_S3_PROXY === 'true';

type VideoDetailProps = {
  videoId: string;
  userPlan: string;
};

export function VideoDetail({ videoId, userPlan }: VideoDetailProps) {
  const { data: video, isLoading } = trpc.video.get.useQuery(
    { id: videoId },
    {
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status && TERMINAL_STATUSES.has(status)) return false;
        return 3000;
      },
    },
  );

  if (isLoading || !video) {
    return (
      <div className="animate-pulse">
        <div className="h-8 w-72 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-48 bg-gray-200 rounded" />
      </div>
    );
  }

  const isProcessing = PROCESSING_STATUSES.has(video.status);

  const clipsWithUrls = video.clips.map((clip) => {
    let thumbnailUrl: string | undefined;
    let videoUrl: string | undefined;
    if (clip.thumbnailPath) {
      thumbnailUrl = PROXY_ENABLED
        ? `/api/clips/${clip.id}/thumbnail`
        : undefined; // presigned URLs need server-side generation
    }
    if (clip.filePath && clip.status === 'ready') {
      videoUrl = PROXY_ENABLED
        ? `/api/clips/${clip.id}/file`
        : undefined;
    }
    return { ...clip, thumbnailUrl, videoUrl };
  });

  return (
    <div>
      <VideoHeader
        videoId={video.id}
        title={video.title}
        status={video.status}
        durationSeconds={video.durationSeconds}
        sttModel={video.transcript?.sttModel ?? null}
      />

      {isProcessing && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <ProcessingProgress
            progress={video.processingProgress}
            stage={video.processingStage}
          />
        </div>
      )}

      {video.status === 'failed' && video.errorMessage && (
        <div className="mb-6 p-4 bg-red-50 rounded-lg">
          <p className="text-sm text-red-700">
            <span className="font-medium">Ошибка обработки:</span>{' '}
            {video.errorMessage}
          </p>
        </div>
      )}

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
