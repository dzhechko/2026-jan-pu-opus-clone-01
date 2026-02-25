'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';
import type { ViralityScore } from '@clipmaker/types';
import { ScoreBadge } from './virality-breakdown';
import { useClipDownload } from '@/lib/hooks/use-clip-download';

type ClipCardProps = {
  clip: {
    id: string;
    title: string;
    duration: number;
    status: string;
    viralityScore: unknown;
    cta: unknown;
    publications: Array<{ id: string }>;
  };
  userPlan?: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'В очереди',
  rendering: 'Рендеринг...',
  ready: 'Готов',
  published: 'Опубликован',
  failed: 'Ошибка',
};

export const ClipCard = memo(function ClipCard({ clip, userPlan }: ClipCardProps) {
  const { download, downloadingId, error, clearError } = useClipDownload();

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
  const isDownloading = downloadingId === clip.id;

  return (
    <div className="bg-white rounded-xl border overflow-hidden hover:shadow-sm transition">
      <div className="aspect-[9/16] bg-gray-100 flex items-center justify-center relative">
        <span className="text-gray-400">Preview</span>
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
          {clip.publications.length > 0 && (
            <span className="text-xs text-gray-400">
              {clip.publications.length} публ.
            </span>
          )}
        </div>

        {clip.status === 'ready' ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              download(clip.id, clip.title);
            }}
            disabled={isDownloading}
            aria-label={`Скачать клип: ${clip.title}`}
            title={userPlan === 'free' ? 'Скачать с водяным знаком' : 'Скачать MP4'}
            className="
              mt-3 w-full px-3 py-1.5 text-sm font-medium rounded
              bg-blue-600 text-white
              hover:bg-blue-700 transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            {isDownloading ? 'Скачивание...' : 'Скачать'}
          </button>
        ) : clip.status !== 'ready' && clip.status !== 'failed' ? (
          <button
            disabled
            title="Клип ещё не готов"
            className="
              mt-3 w-full px-3 py-1.5 text-sm font-medium rounded
              bg-gray-100 text-gray-400
              cursor-not-allowed
            "
          >
            Скачать
          </button>
        ) : null}

        {error && (
          <div className="mt-2 flex items-center gap-1 text-xs text-red-500" role="alert">
            <span className="truncate">{error}</span>
            <button onClick={clearError} className="shrink-0 hover:text-red-700">
              &times;
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
