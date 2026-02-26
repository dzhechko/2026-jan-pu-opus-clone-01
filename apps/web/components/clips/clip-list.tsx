'use client';

import { useMemo } from 'react';
import { ClipCard } from './clip-card';
import { useClipDownload, useDownloadAll } from '@/lib/hooks/use-clip-download';

type ClipData = {
  id: string;
  title: string;
  duration: number;
  status: string;
  viralityScore: unknown;
  cta: unknown;
  thumbnailUrl?: string;
  publications: Array<{ id: string }>;
};

type ClipListProps = {
  clips: ClipData[];
  videoId: string;
  videoStatus: string;
  userPlan?: string;
  onRetry?: () => void;
};

const STATUS_LABELS: Record<string, string> = {
  uploading: 'Загрузка...',
  downloading: 'Скачивание...',
  transcribing: 'Транскрибируем...',
  analyzing: 'Анализируем...',
  generating_clips: 'Генерируем клипы...',
};

export function ClipList({ clips, videoId, videoStatus, userPlan, onRetry }: ClipListProps) {
  const readyCount = useMemo(
    () => clips.filter((c) => c.status === 'ready').length,
    [clips],
  );

  const { download, downloadingId, error: clipDownloadError, clearError: clearClipError } = useClipDownload();
  const { downloadAll, downloading: downloadingAll, error: downloadAllError, clearError } = useDownloadAll();

  // Processing failed state
  if (videoStatus === 'failed') {
    return (
      <div className="text-center py-12 bg-white rounded-xl border">
        <div className="text-red-500 text-2xl mb-2">&times;</div>
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
            Генерируем клипы... {clips.length > 0 ? `(${readyCount}/${clips.length} готово)` : ''}
          </span>
        </div>
        {clips.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clips.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                userPlan={userPlan}
                onDownload={download}
                isDownloading={downloadingId === clip.id}
                downloadError={downloadingId === clip.id ? clipDownloadError : null}
                onClearError={clearClipError}
              />
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
        <p className="text-gray-500">{STATUS_LABELS[videoStatus] ?? 'Обработка видео...'}</p>
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

  const renderingCount = clips.length - readyCount;

  // Completed — show all clips sorted by score
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Клипы ({clips.length})</h3>
        <div className="flex items-center gap-3">
          {renderingCount > 0 && readyCount > 0 && (
            <span className="text-xs text-gray-400">
              {renderingCount} ещё рендерятся
            </span>
          )}
          <button
            onClick={() => downloadAll(videoId)}
            disabled={downloadingAll || readyCount === 0}
            title={readyCount === 0 ? 'Нет готовых клипов для скачивания' : `Скачать ${readyCount} клипов`}
            className="
              px-4 py-1.5 text-sm font-medium rounded
              bg-blue-600 text-white
              hover:bg-blue-700 transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            {downloadingAll ? 'Подготовка архива...' : `Скачать все (${readyCount})`}
          </button>
        </div>
      </div>

      {downloadAllError && (
        <div className="mb-4 flex items-center gap-2 p-2 bg-red-50 rounded text-sm text-red-600" role="alert">
          <span>{downloadAllError}</span>
          <button onClick={clearError} className="ml-auto hover:text-red-800">&times;</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clips.map((clip) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            userPlan={userPlan}
            onDownload={download}
            isDownloading={downloadingId === clip.id}
            downloadError={downloadingId === clip.id ? clipDownloadError : null}
            onClearError={clearClipError}
          />
        ))}
      </div>
    </div>
  );
}
