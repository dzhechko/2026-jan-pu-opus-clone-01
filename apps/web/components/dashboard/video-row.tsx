import Link from 'next/link';
import { StatusBadge } from './status-badge';
import { VideoThumbnail } from './video-thumbnail';
import { formatDuration, formatRelativeDate, pluralizeClips } from '@/lib/utils/format';

type VideoRowProps = {
  video: {
    id: string;
    title: string;
    status: string;
    durationSeconds: number | null;
    createdAt: Date;
    _count: { clips: number };
  };
};

export function VideoRow({ video }: VideoRowProps) {
  return (
    <Link
      href={`/dashboard/videos/${video.id}`}
      className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors"
    >
      <VideoThumbnail alt={video.title} />

      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{video.title}</div>
        <div className="text-sm text-gray-500">
          {video.durationSeconds ? formatDuration(video.durationSeconds) : '—'} &middot; {pluralizeClips(video._count.clips)}
        </div>
      </div>

      <StatusBadge status={video.status} />

      <div className="text-sm text-gray-500 whitespace-nowrap">
        {formatRelativeDate(video.createdAt)}
      </div>
    </Link>
  );
}
