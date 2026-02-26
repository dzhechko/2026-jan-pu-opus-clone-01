'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
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
  if (bytes.length < 12) return false;
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
  extraHeaders?: Record<string, string>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (abortSignal.aborted) {
      reject(new Error('ABORTED'));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    // Dynamic timeout: min 5min, scales with blob size (assumes min 256 bytes/sec)
    xhr.timeout = Math.max(300_000, Math.ceil((blob.size / 256) * 1000));

    if (extraHeaders) {
      for (const [key, value] of Object.entries(extraHeaders)) {
        xhr.setRequestHeader(key, value);
      }
    }

    const onAbort = () => xhr.abort();
    abortSignal.addEventListener('abort', onAbort, { once: true });

    const cleanup = () => {
      abortSignal.removeEventListener('abort', onAbort);
    };

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.getResponseHeader('ETag') ?? xhr.responseText ?? '');
      } else if (xhr.status === 403) {
        reject(new Error('URL_EXPIRED'));
      } else {
        reject(new Error(`UPLOAD_FAILED_${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error('NETWORK_ERROR'));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(new Error('TIMEOUT'));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new Error('ABORTED'));
    };
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

  // Use refs for mutation objects to avoid recreating callbacks every render
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadStateRef = useRef<UploadState>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createMutation = trpc.video.createFromUpload.useMutation();
  const completeMutation = trpc.video.completeMultipart.useMutation();
  const confirmMutation = trpc.video.confirmUpload.useMutation();
  const abortMutation = trpc.video.abortMultipart.useMutation();

  const createMutationRef = useRef(createMutation);
  createMutationRef.current = createMutation;
  const completeMutationRef = useRef(completeMutation);
  completeMutationRef.current = completeMutation;
  const confirmMutationRef = useRef(confirmMutation);
  confirmMutationRef.current = confirmMutation;
  const abortMutationRef = useRef(abortMutation);
  abortMutationRef.current = abortMutation;

  const urlMutation = trpc.video.createFromUrl.useMutation({
    onSuccess: () => {
      // TODO: navigate to video page when routing is set up
      setUploadState('done');
    },
    onError: (err) => setError(err.message),
  });

  // Sync state ref
  const setUploadStateSync = useCallback((state: UploadState) => {
    uploadStateRef.current = state;
    setUploadState(state);
  }, []);

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
    // Only abort — let the async catch block handle state cleanup
    abortControllerRef.current?.abort();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      console.log('[upload] handleFile called', { name: file.name, size: file.size, type: file.type, state: uploadStateRef.current });
      // Guard against double uploads
      if (
        uploadStateRef.current !== 'idle' &&
        uploadStateRef.current !== 'error' &&
        uploadStateRef.current !== 'done'
      ) {
        console.log('[upload] blocked by guard, state:', uploadStateRef.current);
        return;
      }

      setError('');
      // Allow empty file.type (happens on some Linux/browser combos) — magic bytes check handles it
      if (file.type && !ALLOWED_TYPES.includes(file.type)) {
        console.log('[upload] rejected: unsupported type', file.type);
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
      setUploadStateSync('validating');
      console.log('[upload] validating magic bytes...');
      try {
        const header = await readFileHeader(file);
        if (!validateClientMagicBytes(header)) {
          console.log('[upload] magic bytes failed');
          setError('Неподдерживаемый формат файла');
          setUploadStateSync('idle');
          return;
        }
        console.log('[upload] magic bytes OK');
      } catch {
        console.log('[upload] magic bytes read error, continuing');
      }

      // Create video record + get presigned URL(s)
      setUploadStateSync('uploading');
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      let result;
      try {
        console.log('[upload] calling createFromUpload...');
        result = await createMutationRef.current.mutateAsync({
          title: file.name.replace(/\.[^.]+$/, ''),
          fileName: file.name,
          fileSize: file.size,
        });
        console.log('[upload] createFromUpload result:', JSON.stringify(result));
      } catch (err) {
        console.error('[upload] createFromUpload error:', err);
        setError((err as Error).message);
        setUploadStateSync('error');
        return;
      }

      const startTime = Date.now();

      // Register beforeunload warning
      const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
        e.preventDefault();
      };
      window.addEventListener('beforeunload', beforeUnloadHandler);

      try {
        if ('uploadUrl' in result.upload) {
          // Simple upload via server proxy (avoids presigned URL CORS/signature issues)
          await uploadPartXhr(
            '/api/upload',
            file,
            (loaded) => updateProgress(loaded, file.size, startTime),
            abortController.signal,
            { 'x-upload-key': result.upload.key },
          );
        } else {
          // Multipart upload — all parts go through /api/upload proxy
          // (Codespace proxy limits body to ~16 MB, so presigned URLs are not used)
          const { partUrls, partSize, uploadId, videoId } = result.upload as {
            partUrls: { partNumber: number; url: string }[];
            partSize: number;
            uploadId: string;
            videoId: string;
          };

          const uploadKey = (result.upload as { key: string }).key;

          const blobs = splitFile(file, partSize);
          const completedParts: { partNumber: number; etag: string }[] = [];
          const partLoaded = new Map<number, number>();

          for (const batch of chunks(partUrls, CONCURRENT_PARTS)) {
            if (abortController.signal.aborted) break;

            await Promise.all(
              batch.map(async ({ partNumber }) => {
                const blob = blobs[partNumber - 1];
                if (!blob) return;

                for (let attempt = 1; attempt <= 3; attempt++) {
                  try {
                    partLoaded.set(partNumber, 0);

                    const responseText = await uploadPartXhr(
                      '/api/upload',
                      blob,
                      (loaded) => {
                        partLoaded.set(partNumber, loaded);
                        let totalLoaded = 0;
                        partLoaded.forEach((v) => (totalLoaded += v));
                        updateProgress(totalLoaded, file.size, startTime);
                      },
                      abortController.signal,
                      {
                        'x-upload-key': uploadKey,
                        'x-upload-id': uploadId,
                        'x-upload-part': String(partNumber),
                      },
                    );
                    // Parse etag from JSON response
                    let etag = '';
                    try {
                      const json = JSON.parse(responseText);
                      etag = json.etag ?? '';
                    } catch {
                      etag = responseText;
                    }
                    completedParts.push({ partNumber, etag });
                    blobs[partNumber - 1] = null as unknown as Blob;
                    return;
                  } catch (err) {
                    const msg = (err as Error).message;
                    if (msg === 'ABORTED' || attempt === 3) throw err;
                    await new Promise((r) => setTimeout(r, 1000 * attempt));
                  }
                }
              }),
            );
          }

          if (!abortController.signal.aborted) {
            await completeMutationRef.current.mutateAsync({
              videoId,
              uploadId,
              parts: completedParts.sort((a, b) => a.partNumber - b.partNumber),
            });
          }
        }

        if (abortController.signal.aborted) {
          setUploadStateSync('idle');
          setProgress({ percentage: 0, speedMBps: 0, etaSeconds: 0 });
          return;
        }

        // Confirm upload → start processing
        setUploadStateSync('confirming');
        await confirmMutationRef.current.mutateAsync({ videoId: result.video.id });
        setUploadStateSync('done');
      } catch (err) {
        const message = (err as Error).message;

        if (abortController.signal.aborted || message === 'ABORTED') {
          // User cancelled — clean up server-side
          if ('uploadId' in result.upload) {
            const upload = result.upload as { uploadId: string; videoId: string };
            abortMutationRef.current.mutate({
              videoId: upload.videoId,
              uploadId: upload.uploadId,
            });
          }
          // TODO: For simple uploads, add a cancelUpload mutation to delete orphaned Video record
          setUploadStateSync('idle');
          setProgress({ percentage: 0, speedMBps: 0, etaSeconds: 0 });
          return;
        }

        if (message === 'URL_EXPIRED') {
          setError('Ссылка загрузки истекла. Попробуйте снова');
        } else if (message === 'NETWORK_ERROR') {
          setError('Ошибка сети. Проверьте подключение');
        } else if (message === 'TIMEOUT') {
          setError('Загрузка прервана по таймауту. Попробуйте снова');
        } else {
          setError(message || 'Ошибка загрузки');
        }
        setUploadStateSync('error');
      } finally {
        window.removeEventListener('beforeunload', beforeUnloadHandler);
        abortControllerRef.current = null;
      }
    },
    [updateProgress, setUploadStateSync],
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
    setError('');
    if (!url.trim()) return;
    urlMutation.mutate({ url });
  };

  const isUploading =
    uploadState === 'uploading' || uploadState === 'validating' || uploadState === 'confirming';

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

      {error && (
        <div role="alert" className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

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
              <div
                role="progressbar"
                aria-valuenow={progress.percentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Загрузка: ${progress.percentage}%`}
                className="w-full bg-gray-200 rounded-full h-2 mb-4"
              >
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
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragActive(false);
              }}
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
                  ref={fileInputRef}
                  type="file"
                  accept=".mp4,.webm,.mov,.avi,video/mp4,video/webm,video/quicktime,video/x-msvideo"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = '';
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
