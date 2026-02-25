'use client';

import type { Clip, Publication } from '@clipmaker/db';
import { ScoreBadge } from './virality-breakdown';

type ClipWithPublications = Clip & { publications: Publication[] };

type ClipCardProps = {
  clip: ClipWithPublications;
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'В очереди',
  rendering: 'Рендеринг...',
  ready: 'Готов',
  published: 'Опубликован',
  failed: 'Ошибка',
};

export function ClipCard({ clip }: ClipCardProps) {
  const score = clip.viralityScore as { total?: number; hook?: number; engagement?: number; flow?: number; trend?: number; tips?: string[] } | null;
  const viralityScore = {
    total: score?.total ?? 0,
    hook: score?.hook ?? 0,
    engagement: score?.engagement ?? 0,
    flow: score?.flow ?? 0,
    trend: score?.trend ?? 0,
    tips: score?.tips ?? [],
  };

  const cta = clip.cta as { text?: string; position?: string; duration?: number } | null;

  return (
    <div className="bg-white rounded-xl border overflow-hidden hover:shadow-sm transition">
      <div className="aspect-[9/16] bg-gray-100 flex items-center justify-center relative">
        <span className="text-gray-400">Preview</span>
        {clip.status === 'rendering' && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent" />
          </div>
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
      </div>
    </div>
  );
}
