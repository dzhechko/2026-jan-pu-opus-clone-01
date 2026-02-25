'use client';

import type { Clip, Publication } from '@clipmaker/db';

type ClipWithPublications = Clip & { publications: Publication[] };

type ClipListProps = {
  clips: ClipWithPublications[];
  videoStatus: string;
};

export function ClipList({ clips, videoStatus }: ClipListProps) {
  if (videoStatus !== 'completed' && clips.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border">
        <p className="text-gray-500">Обработка видео...</p>
        <p className="text-sm text-gray-400 mt-1">Статус: {videoStatus}</p>
      </div>
    );
  }

  if (clips.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border">
        <p className="text-gray-500">Клипы не найдены</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {clips.map((clip) => (
        <ClipCard key={clip.id} clip={clip} />
      ))}
    </div>
  );
}

function ClipCard({ clip }: { clip: ClipWithPublications }) {
  const score = (clip.viralityScore as { total?: number })?.total ?? 0;

  return (
    <div className="bg-white rounded-xl border overflow-hidden hover:shadow-sm transition">
      <div className="aspect-[9/16] bg-gray-100 flex items-center justify-center">
        <span className="text-gray-400">Preview</span>
      </div>
      <div className="p-4">
        <h3 className="font-medium truncate">{clip.title}</h3>
        <div className="flex justify-between items-center mt-2">
          <span className="text-sm text-gray-500">
            {Math.round(clip.duration)}с
          </span>
          <span
            className={`text-sm font-medium px-2 py-0.5 rounded ${
              score >= 70 ? 'bg-green-100 text-green-700' : score >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {score}/100
          </span>
        </div>
        <div className="mt-2 text-xs text-gray-400">
          {clip.status === 'ready' ? 'Готов' : clip.status}
        </div>
      </div>
    </div>
  );
}
