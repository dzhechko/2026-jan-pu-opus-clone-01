'use client';

import { memo, useMemo, useCallback, useState } from 'react';
import Link from 'next/link';
import type { ViralityScore } from '@clipmaker/types';
import { ScoreBadge } from './virality-breakdown';
import { PublishDialog } from './publish-dialog';

type ClipCardProps = {
  clip: {
    id: string;
    title: string;
    duration: number;
    status: string;
    viralityScore: unknown;
    cta: unknown;
    thumbnailUrl?: string;
    videoUrl?: string;
    publications: Array<{ id: string; platform: string; status: string; platformUrl?: string | null }>;
  };
  userPlan?: string;
  onDownload?: (clipId: string, clipTitle: string) => void;
  isDownloading?: boolean;
  downloadError?: string | null;
  onClearError?: () => void;
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'В очереди',
  rendering: 'Рендеринг...',
  ready: 'Готов',
  published: 'Опубликован',
  failed: 'Ошибка',
};

export const ClipCard = memo(function ClipCard({
  clip,
  userPlan,
  onDownload,
  isDownloading = false,
  downloadError,
  onClearError,
}: ClipCardProps) {
  const [playing, setPlaying] = useState(false);
  const [showPublish, setShowPublish] = useState(false);

  const viralityScore = useMemo((): ViralityScore => {
    const score = clip.viralityScore as Partial<ViralityScore> | null;
    return {
      total: score?.total ?? 0,
      hook: score?.hook ?? 0,
      engagement: score?.engagement ?? 0,
      flow: score?.flow ?? 0,
      trend: score?.trend ?? 0,
      tips: score?.tips ?? [],
    };
  }, [clip.viralityScore]);

  const cta = clip.cta as { text?: string; position?: string; duration?: number } | null;

  const handleDownloadClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDownload?.(clip.id, clip.title);
    },
    [onDownload, clip.id, clip.title],
  );

  const handlePlayClick = useCallback(() => {
    if (clip.videoUrl) setPlaying(true);
  }, [clip.videoUrl]);

  return (
    <div className="bg-white rounded-xl border overflow-hidden hover:shadow-sm transition">
      <div
        className="aspect-[9/16] bg-black flex items-center justify-center relative overflow-hidden cursor-pointer"
        onClick={handlePlayClick}
      >
        {playing && clip.videoUrl ? (
          <video
            src={clip.videoUrl}
            autoPlay
            controls
            playsInline
            className="w-full h-full object-contain"
            onEnded={() => setPlaying(false)}
          />
        ) : (
          <>
            {clip.thumbnailUrl ? (
              <img
                src={clip.thumbnailUrl}
                alt={clip.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="text-gray-400">Preview</span>
            )}
            {clip.videoUrl && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/20 transition-colors">
                <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                  <svg className="w-5 h-5 text-gray-800 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            )}
          </>
        )}
        {clip.status === 'rendering' && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent" />
          </div>
        )}
        {userPlan === 'free' && (
          <Link
            href="/dashboard/billing"
            className="absolute top-2 right-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full hover:bg-amber-200 transition-colors"
            title="Уберите водяной знак на тарифе Start (990₽/мес)"
            onClick={(e) => e.stopPropagation()}
          >
            Водяной знак
          </Link>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-medium truncate" title={clip.title}>{clip.title}</h3>
        <div className="flex justify-between items-center mt-2">
          <span className="text-sm text-gray-500">
            {Math.round(clip.duration)}с
          </span>
          <ScoreBadge score={viralityScore} />
        </div>
        {cta && (
          <div className="mt-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded truncate" title={cta.text}>
            CTA: {cta.text}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between">
          <span className={`text-xs ${clip.status === 'failed' ? 'text-red-500' : 'text-gray-400'}`}>
            {STATUS_LABELS[clip.status] ?? clip.status}
          </span>
        </div>

        {clip.publications.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {clip.publications.map((pub) => (
              <PublicationBadge key={pub.id} publication={pub} />
            ))}
          </div>
        )}

        {clip.status === 'ready' && (
          <div className="mt-3 flex gap-2">
            {onDownload && (
              <button
                onClick={handleDownloadClick}
                disabled={isDownloading}
                aria-label={`Скачать клип: ${clip.title}`}
                title={userPlan === 'free' ? 'Скачать с водяным знаком' : 'Скачать MP4'}
                className="flex-1 px-3 py-1.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDownloading ? '...' : 'Скачать'}
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setShowPublish(true); }}
              className="flex-1 px-3 py-1.5 text-sm font-medium rounded border border-green-600 text-green-600 hover:bg-green-50 transition-colors"
            >
              Опубликовать
            </button>
          </div>
        )}

        {clip.status !== 'ready' && clip.status !== 'failed' && (
          <button
            disabled
            title="Клип ещё не готов"
            className="mt-3 w-full px-3 py-1.5 text-sm font-medium rounded bg-gray-100 text-gray-400 cursor-not-allowed"
          >
            Скачать
          </button>
        )}

        {downloadError && (
          <div className="mt-2 flex items-center gap-1 text-xs text-red-500" role="alert">
            <span className="truncate">{downloadError}</span>
            <button onClick={onClearError} className="shrink-0 hover:text-red-700">
              &times;
            </button>
          </div>
        )}
      </div>

      {showPublish && (
        <PublishDialog
          clipId={clip.id}
          clipTitle={clip.title}
          onClose={() => setShowPublish(false)}
          onPublished={() => setShowPublish(false)}
        />
      )}
    </div>
  );
});

const PLATFORM_ICONS: Record<string, string> = {
  vk: '🎬',
  rutube: '📺',
  dzen: '📰',
  telegram: '✈️',
};

const PUB_STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-yellow-50 text-yellow-700',
  publishing: 'bg-blue-50 text-blue-700',
  published: 'bg-green-50 text-green-700',
  failed: 'bg-red-50 text-red-700',
  cancelled: 'bg-gray-50 text-gray-500',
};

function PublicationBadge({ publication }: { publication: { platform: string; status: string; platformUrl?: string | null } }) {
  const icon = PLATFORM_ICONS[publication.platform] ?? '📌';
  const style = PUB_STATUS_STYLES[publication.status] ?? 'bg-gray-50 text-gray-500';

  const badge = (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${style}`}>
      {icon} {publication.status === 'published' ? '✓' : publication.status === 'failed' ? '✗' : '⏳'}
    </span>
  );

  if (publication.status === 'published' && publication.platformUrl) {
    return (
      <a href={publication.platformUrl} target="_blank" rel="noopener noreferrer" title={`Открыть на ${publication.platform}`}>
        {badge}
      </a>
    );
  }

  return badge;
}
