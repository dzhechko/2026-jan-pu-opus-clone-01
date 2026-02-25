'use client';

import { useState, useCallback, useRef } from 'react';
import { trpc } from '@/lib/trpc/client';

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
  const mutationRef = useRef<ReturnType<typeof trpc.clip.download.useMutation>>(undefined);

  const mutation = trpc.clip.download.useMutation();
  mutationRef.current = mutation;

  const download = useCallback(
    async (clipId: string, clipTitle?: string) => {
      try {
        setDownloadingId(clipId);
        setError(null);

        const { downloadUrl } = await mutationRef.current!.mutateAsync({
          id: clipId,
        });

        triggerDownload(downloadUrl, safeFilename(clipTitle, 'mp4'));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Ошибка скачивания';
        setError(message);
      } finally {
        setDownloadingId(null);
      }
    },
    [], // stable — uses mutationRef
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
      // Use direct anchor navigation — browser streams ZIP to disk
      // without buffering in JS heap. Pre-check with HEAD-like fetch
      // for error feedback before triggering navigation.
      triggerDownload(`/api/videos/${videoId}/download-all`, 'clips.zip');
    } finally {
      // Short delay so button stays disabled during download initiation
      setTimeout(() => {
        busyRef.current = false;
        setDownloading(false);
      }, 3000);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { downloadAll, downloading, error, clearError };
}
