'use client';

import { type RefObject, useMemo } from 'react';
import type { SubtitleSegment, CTA, ClipFormat } from '@clipmaker/types';

type VideoPreviewProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  videoSourceUrl: string;
  format: ClipFormat;
  subtitleSegments: SubtitleSegment[];
  cta: CTA | null;
  currentTime: number;
  clipStartTime: number;
  clipEndTime: number;
  onTimeUpdate: () => void;
};

const FORMAT_ASPECT_RATIOS: Record<ClipFormat, string> = {
  portrait: 'aspect-[9/16]',
  square: 'aspect-square',
  landscape: 'aspect-video',
};

const FORMAT_MAX_DIMENSIONS: Record<ClipFormat, string> = {
  portrait: 'max-h-[60vh] max-w-[340px]',
  square: 'max-h-[50vh] max-w-[50vh]',
  landscape: 'max-h-[50vh] max-w-[90%]',
};

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoPreview({
  videoRef,
  videoSourceUrl,
  format,
  subtitleSegments,
  cta,
  currentTime,
  clipStartTime,
  clipEndTime,
  onTimeUpdate,
}: VideoPreviewProps) {
  const activeSubtitle = useMemo(() => {
    return subtitleSegments.find(
      (seg) => currentTime >= seg.start && currentTime < seg.end,
    );
  }, [subtitleSegments, currentTime]);

  const showCta = useMemo(() => {
    if (!cta) return false;
    const ctaStart = clipEndTime - cta.duration;
    return currentTime >= ctaStart && currentTime <= clipEndTime;
  }, [cta, currentTime, clipEndTime]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`
          relative bg-black rounded-lg overflow-hidden
          ${FORMAT_ASPECT_RATIOS[format]}
          ${FORMAT_MAX_DIMENSIONS[format]}
          w-full
        `}
      >
        <video
          ref={videoRef}
          src={videoSourceUrl}
          className="absolute inset-0 w-full h-full object-contain"
          onTimeUpdate={onTimeUpdate}
          playsInline
          preload="metadata"
        />

        {activeSubtitle && (
          <div className="absolute bottom-[10%] left-0 right-0 flex justify-center px-4 pointer-events-none">
            <span className="inline-block px-3 py-1.5 bg-black/70 text-white text-lg font-medium rounded leading-tight text-center max-w-[90%]">
              {activeSubtitle.text}
            </span>
          </div>
        )}

        {showCta && cta && (
          <div
            className={`
              absolute inset-0 flex items-center justify-center
              pointer-events-none
              ${cta.position === 'end' ? 'bg-black/80' : 'bg-black/40'}
            `}
          >
            <p className="text-white text-xl font-bold text-center px-6 max-w-[80%]">
              {cta.text}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <button
          onClick={() => {
            const video = videoRef.current;
            if (!video) return;
            if (video.paused) {
              video.play();
            } else {
              video.pause();
            }
          }}
          className="px-3 py-1 rounded bg-secondary hover:bg-secondary/80"
        >
          {videoRef.current?.paused !== false
            ? '\u25B6 \u0412\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0441\u0442\u0438'
            : '\u23F8 \u041F\u0430\u0443\u0437\u0430'}
        </button>
        <span>
          {formatTimestamp(currentTime)} /{' '}
          {formatTimestamp(clipEndTime - clipStartTime)}
        </span>
      </div>
    </div>
  );
}
