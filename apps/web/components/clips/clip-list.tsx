'use client';

import type { Clip, Publication } from '@clipmaker/db';
import { ClipCard } from './clip-card';

type ClipWithPublications = Clip & { publications: Publication[] };

type ClipListProps = {
  clips: ClipWithPublications[];
  videoStatus: string;
  onRetry?: () => void;
};

export function ClipList({ clips, videoStatus, onRetry }: ClipListProps) {
  // Processing failed state
  if (videoStatus === 'failed') {
    return (
      <div className="text-center py-12 bg-white rounded-xl border">
        <div className="text-red-500 text-2xl mb-2">✕</div>
        <p className="text-gray-700 font-medium">Ошибка обработки</p>
        <p className="text-sm text-gray-400 mt-1">Не удалось проанализировать видео</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
          >
            Повторить
          </button>
        )}
      </div>
    );
  }

  // Analyzing state — spinner + placeholder
  if (videoStatus === 'analyzing' && clips.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border" data-testid="clips-placeholder">
        <div
          className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto mb-3"
          data-testid="processing-spinner"
        />
        <p className="text-gray-700 font-medium">Анализируем моменты...</p>
        <p className="text-sm text-gray-400 mt-1">AI ищет лучшие фрагменты для шортсов</p>
      </div>
    );
  }

  // Generating clips state — spinner + available clips
  if (videoStatus === 'generating_clips') {
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div
            className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"
            data-testid="processing-spinner"
          />
          <span className="text-sm text-gray-600">
            Генерируем клипы... {clips.length > 0 ? `(${clips.filter(c => c.status === 'ready').length}/${clips.length} готово)` : ''}
          </span>
        </div>
        {clips.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clips.map((clip) => (
              <ClipCard key={clip.id} clip={clip} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Transcribing state
  if (videoStatus === 'transcribing' && clips.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto mb-3" />
        <p className="text-gray-700 font-medium">Транскрибируем...</p>
        <p className="text-sm text-gray-400 mt-1">Распознаём речь из видео</p>
      </div>
    );
  }

  // Other processing states
  if (clips.length === 0 && videoStatus !== 'completed') {
    return (
      <div className="text-center py-12 bg-white rounded-xl border" data-testid="clips-placeholder">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto mb-3" />
        <p className="text-gray-500">Обработка видео...</p>
        <p className="text-sm text-gray-400 mt-1">Статус: {videoStatus}</p>
      </div>
    );
  }

  // No clips found (completed but empty)
  if (clips.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border">
        <p className="text-gray-500">Клипы не найдены</p>
      </div>
    );
  }

  // Completed — show all clips sorted by score
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {clips.map((clip) => (
        <ClipCard key={clip.id} clip={clip} />
      ))}
    </div>
  );
}
