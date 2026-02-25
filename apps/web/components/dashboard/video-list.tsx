import { Suspense } from 'react';
import { VideoRow } from './video-row';
import { PaginationControls } from './pagination-controls';

type Video = {
  id: string;
  title: string;
  status: string;
  durationSeconds: number | null;
  createdAt: Date;
  _count: { clips: number };
};

type VideoListProps = {
  videos: Video[];
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
};

export function VideoList({ videos, currentPage, totalPages, hasMore }: VideoListProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Ваши видео</h2>

      <div className="rounded-xl border bg-white shadow-sm divide-y">
        {videos.map((video) => (
          <VideoRow key={video.id} video={video} />
        ))}
      </div>

      <Suspense>
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          hasMore={hasMore}
        />
      </Suspense>
    </div>
  );
}
