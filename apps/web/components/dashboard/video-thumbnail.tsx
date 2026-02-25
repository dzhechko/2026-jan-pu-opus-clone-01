import { FilmIcon } from 'lucide-react';

type VideoThumbnailProps = {
  alt: string;
};

export function VideoThumbnail({ alt }: VideoThumbnailProps) {
  return (
    <div
      className="h-12 w-20 rounded bg-gray-100 flex items-center justify-center flex-shrink-0"
      aria-label={alt}
    >
      <FilmIcon className="h-5 w-5 text-gray-300" />
    </div>
  );
}
