'use client';

import { useState, useCallback, useRef } from 'react';
import { trpc } from '@/lib/trpc/client';

const ALLOWED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
const MAX_SIZE = 4 * 1024 * 1024 * 1024; // 4GB
const CONCURRENT_PARTS = 3;

// Magic bytes signatures for client-side pre-check
const MAGIC_CHECKS = [
  { format: 'webm', checks: [{ offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }] },
  { format: 'mov', checks: [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70, 0x71, 0x74] }] },
  { format: 'mp4', checks: [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }] },
  {
    format: 'avi',
    checks: [
      { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
      { offset: 8, bytes: [0x41, 0x56, 0x49, 0x20] },
    ],
  },
];

type UploadProgress = {
  percentage: number;
  speedMBps: number;
  etaSeconds: number;
};

type UploadState = 'idle' | 'validating' | 'uploading' | 'confirming' | 'done' | 'error';

function validateClientMagicBytes(bytes: Uint8Array): boolean {
  for (const entry of MAGIC_CHECKS) {
    let allPass = true;
    for (const check of entry.checks) {
      for (let i = 0; i < check.bytes.length; i++) {
        if (bytes[check.offset + i] !== check.bytes[i]) {
          allPass = false;
          break;
        }
      }
      if (!allPass) break;
    }
    if (allPass) return true;
  }
  return false;
}

async function readFileHeader(file: File): Promise<Uint8Array> {
  const slice = file.slice(0, 16);
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}

function uploadPartXhr(
  url: string,
  blob: Blob,
  onProgress: (loaded: number) => void,
  abortSignal: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.timeout = 300_000; // 5 min per part

    abortSignal.addEventListener('abort', () => xhr.abort());

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.getResponseHeader('ETag') ?? '');
      } else if (xhr.status === 403) {
        reject(new Error('URL_EXPIRED'));
      } else {
        reject(new Error(`Upload failed: HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('NETWORK_ERROR'));
    xhr.ontimeout = () => reject(new Error('TIMEOUT'));
    xhr.send(blob);
  });
}

function splitFile(file: File, partSize: number): Blob[] {
  const blobs: Blob[] = [];
  let offset = 0;
  while (offset < file.size) {
    blobs.push(file.slice(offset, Math.min(offset + partSize, file.size)));
    offset += partSize;
  }
  return blobs;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export function VideoUploader() {
  const [mode, setMode] = useState<'file' | 'url'>('file');
  const [url, setUrl] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState<UploadProgress>({
    percentage: 0,
    speedMBps: 0,
    etaSeconds: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const videoIdRef = useRef<string>('');

  const createMutation = trpc.video.createFromUpload.useMutation();
  const completeMutation = trpc.video.completeMultipart.useMutation();
  const confirmMutation = trpc.video.confirmUpload.useMutation();
  const abortMutation = trpc.video.abortMultipart.useMutation();

  const urlMutation = trpc.video.createFromUrl.useMutation({
    onError: (err) => setError(err.message),
  });

  const updateProgress = useCallback((loaded: number, total: number, startTime: number) => {
    const elapsedSec = (Date.now() - startTime) / 1000;
    const speedMBps = elapsedSec > 0 ? loaded / 1024 / 1024 / elapsedSec : 0;
    const remaining = total - loaded;
    const etaSeconds = speedMBps > 0 ? remaining / 1024 / 1024 / speedMBps : 0;
    setProgress({
      percentage: Math.round((loaded / total) * 100),
      speedMBps: Math.round(speedMBps * 10) / 10,
      etaSeconds: Math.round(etaSeconds),
    });
  }, []);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setUploadState('idle');
    setProgress({ percentage: 0, speedMBps: 0, etaSeconds: 0 });
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setError('');
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError('Формат не поддерживается. Используйте MP4, WebM, MOV или AVI');
        return;
      }
      if (file.size > MAX_SIZE) {
        setError('Файл слишком большой. Максимум 4 ГБ');
        return;
      }
      if (file.size === 0) {
        setError('Файл пустой');
        return;
      }

      // Client-side magic bytes pre-check
      setUploadState('validating');
      try {
        const header = await readFileHeader(file);
        if (!validateClientMagicBytes(header)) {
          setError('Неподдерживаемый формат файла');
          setUploadState('idle');
          return;
        }
      } catch {
        // If we can't read the header, let server-side validation handle it
      }

      // Create video record + get presigned URL(s)
      setUploadState('uploading');
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      let result;
      try {
        result = await createMutation.mutateAsync({
          title: file.name.replace(/\.[^.]+$/, ''),
          fileName: file.name,
          fileSize: file.size,
        });
      } catch (err) {
        setError((err as Error).message);
        setUploadState('error');
        return;
      }

      videoIdRef.current = result.video.id;
      const startTime = Date.now();

      // Register beforeunload warning
      const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
        e.preventDefault();
      };
      window.addEventListener('beforeunload', beforeUnloadHandler);

      try {
        if ('uploadUrl' in result.upload) {
          // Simple upload
          await uploadPartXhr(
            result.upload.uploadUrl,
            file,
            (loaded) => updateProgress(loaded, file.size, startTime),
            abortController.signal,
          );
        } else {
          // Multipart upload
          const { partUrls, partSize, uploadId, videoId } = result.upload as {
            partUrls: { partNumber: number; url: string }[];
            partSize: number;
            uploadId: string;
            videoId: string;
          };

          const blobs = splitFile(file, partSize);
          const completedParts: { partNumber: number; etag: string }[] = [];
          const partLoaded = new Map<number, number>();

          for (const batch of chunks(partUrls, CONCURRENT_PARTS)) {
            if (abortController.signal.aborted) break;

            await Promise.all(
              batch.map(async ({ partNumber, url: partUrl }) => {
                const blob = blobs[partNumber - 1];
                if (!blob) return;

                let lastError: Error | null = null;
                for (let attempt = 1; attempt <= 3; attempt++) {
                  try {
                    const etag = await uploadPartXhr(
                      partUrl,
                      blob,
                      (loaded) => {
                        partLoaded.set(partNumber, loaded);
                        let totalLoaded = 0;
                        partLoaded.forEach((v) => (totalLoaded += v));
                        updateProgress(totalLoaded, file.size, startTime);
                      },
                      abortController.signal,
                    );
                    completedParts.push({ partNumber, etag });
                    return;
                  } catch (err) {
                    lastError = err as Error;
                    if ((err as Error).message === 'URL_EXPIRED' || attempt === 3) throw err;
                    await new Promise((r) => setTimeout(r, 1000 * attempt));
                  }
                }
                throw lastError;
              }),
            );
          }

          if (!abortController.signal.aborted) {
            await completeMutation.mutateAsync({
              videoId,
              uploadId,
              parts: completedParts.sort((a, b) => a.partNumber - b.partNumber),
            });
          }
        }

        if (abortController.signal.aborted) {
          setUploadState('idle');
          return;
        }

        // Confirm upload → start processing
        setUploadState('confirming');
        await confirmMutation.mutateAsync({ videoId: result.video.id });
        setUploadState('done');
      } catch (err) {
        if (abortController.signal.aborted) {
          // User cancelled multipart — try to abort on server
          if ('uploadId' in result.upload) {
            const upload = result.upload as { uploadId: string; videoId: string };
            abortMutation.mutate({ videoId: upload.videoId, uploadId: upload.uploadId });
          }
          setUploadState('idle');
          return;
        }

        const message = (err as Error).message;
        if (message === 'URL_EXPIRED') {
          setError('Ссылка загрузки истекла. Попробуйте снова');
        } else if (message === 'NETWORK_ERROR') {
          setError('Ошибка сети. Проверьте подключение');
        } else {
          setError(message || 'Ошибка загрузки');
        }
        setUploadState('error');
      } finally {
        window.removeEventListener('beforeunload', beforeUnloadHandler);
        abortControllerRef.current = null;
      }
    },
    [createMutation, completeMutation, confirmMutation, abortMutation, updateProgress],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    urlMutation.mutate({ url });
  };

  const isUploading = uploadState === 'uploading' || uploadState === 'validating' || uploadState === 'confirming';

  return (
    <div className="max-w-2xl">
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode('file')}
          disabled={isUploading}
          className={`px-4 py-2 rounded-lg ${mode === 'file' ? 'bg-brand-600 text-white' : 'bg-gray-100'} disabled:opacity-50`}
        >
          Загрузить файл
        </button>
        <button
          onClick={() => setMode('url')}
          disabled={isUploading}
          className={`px-4 py-2 rounded-lg ${mode === 'url' ? 'bg-brand-600 text-white' : 'bg-gray-100'} disabled:opacity-50`}
        >
          Вставить ссылку
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

      {uploadState === 'done' && (
        <div className="mb-4 p-3 bg-green-50 text-green-600 rounded-lg text-sm">
          Видео загружено и отправлено на обработку
        </div>
      )}

      {mode === 'file' ? (
        <>
          {isUploading ? (
            <div className="border-2 border-brand-200 rounded-xl p-8">
              <div className="mb-2 flex justify-between text-sm text-gray-600">
                <span>
                  {uploadState === 'validating' && 'Проверка файла...'}
                  {uploadState === 'uploading' && `Загрузка: ${progress.percentage}%`}
                  {uploadState === 'confirming' && 'Подтверждение...'}
                </span>
                {uploadState === 'uploading' && (
                  <span>
                    {progress.speedMBps} МБ/с
                    {progress.etaSeconds > 0 && ` — ${Math.ceil(progress.etaSeconds / 60)} мин`}
                  </span>
                )}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                <div
                  className="bg-brand-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
              <button
                onClick={handleCancel}
                className="px-4 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
              >
                Отменить
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-12 text-center transition ${
                dragActive ? 'border-brand-500 bg-brand-50' : 'border-gray-300'
              }`}
            >
              <p className="text-gray-600 mb-2">Перетащите видео сюда</p>
              <p className="text-sm text-gray-400 mb-4">MP4, WebM, MOV, AVI до 4 ГБ</p>
              <label className="inline-block px-6 py-2 bg-brand-600 text-white rounded-lg cursor-pointer hover:bg-brand-700">
                Выбрать файл
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </label>
            </div>
          )}
        </>
      ) : (
        <form onSubmit={handleUrlSubmit} className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=... или VK видео"
            className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500"
          />
          <button
            type="submit"
            disabled={urlMutation.isPending}
            className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            Загрузить
          </button>
        </form>
      )}
    </div>
  );
}
