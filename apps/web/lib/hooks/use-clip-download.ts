'use client';

import { useState, useCallback } from 'react';
import { trpc } from '@/lib/trpc/client';

export function useClipDownload() {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const downloadMutation = trpc.clip.download.useMutation();

  const download = useCallback(
    async (clipId: string, clipTitle?: string) => {
      try {
        setDownloadingId(clipId);
        setError(null);

        const { downloadUrl } = await downloadMutation.mutateAsync({
          id: clipId,
        });

        const anchor = document.createElement('a');
        anchor.href = downloadUrl;
        anchor.download = clipTitle ? `${clipTitle}.mp4` : '';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Ошибка скачивания';
        setError(message);
      } finally {
        setDownloadingId(null);
      }
    },
    [downloadMutation],
  );

  const clearError = useCallback(() => setError(null), []);

  return { download, downloadingId, error, clearError };
}

export function useDownloadAll() {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadAll = useCallback(async (videoId: string) => {
    setDownloading(true);
    setError(null);

    try {
      const response = await fetch(`/api/videos/${videoId}/download-all`);

      if (response.status === 429) {
        setError('Слишком много запросов. Подождите минуту.');
        return;
      }

      if (response.status === 404) {
        setError('Нет готовых клипов для скачивания');
        return;
      }

      if (!response.ok) {
        setError('Ошибка создания архива. Попробуйте ещё раз');
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'clips.zip';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch {
      setError('Ошибка создания архива. Попробуйте ещё раз');
    } finally {
      setDownloading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { downloadAll, downloading, error, clearError };
}
