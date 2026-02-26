'use client';

import { useState, useCallback, useRef } from 'react';

function triggerDownload(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function safeFilename(title: string | undefined, ext: string): string {
  const name = title?.trim().slice(0, 200) || 'clip';
  return `${name}.${ext}`;
}

export function useClipDownload() {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = useCallback(
    async (clipId: string, clipTitle?: string) => {
      try {
        setDownloadingId(clipId);
        setError(null);
        triggerDownload(`/api/clips/${clipId}/file`, safeFilename(clipTitle, 'mp4'));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Ошибка скачивания';
        setError(message);
      } finally {
        // Short delay so button stays disabled during download initiation
        setTimeout(() => setDownloadingId(null), 2000);
      }
    },
    [],
  );

  const clearError = useCallback(() => setError(null), []);

  return { download, downloadingId, error, clearError };
}

export function useDownloadAll() {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const downloadAll = useCallback(async (videoId: string) => {
    if (!videoId || busyRef.current) return;
    busyRef.current = true;
    setDownloading(true);
    setError(null);

    try {
      triggerDownload(`/api/videos/${videoId}/download-all`, 'clips.zip');
    } finally {
      setTimeout(() => {
        busyRef.current = false;
        setDownloading(false);
      }, 3000);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { downloadAll, downloading, error, clearError };
}
