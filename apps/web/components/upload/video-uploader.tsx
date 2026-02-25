'use client';

import { useState, useCallback } from 'react';
import { trpc } from '@/lib/trpc/client';

const ALLOWED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
const MAX_SIZE = 4 * 1024 * 1024 * 1024; // 4GB

export function VideoUploader() {
  const [mode, setMode] = useState<'file' | 'url'>('file');
  const [url, setUrl] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');

  const uploadMutation = trpc.video.createFromUpload.useMutation({
    onError: (err) => setError(err.message),
  });

  const urlMutation = trpc.video.createFromUrl.useMutation({
    onError: (err) => setError(err.message),
  });

  const handleFile = useCallback(
    (file: File) => {
      setError('');
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError('Формат не поддерживается. Используйте MP4, WebM, MOV или AVI');
        return;
      }
      if (file.size > MAX_SIZE) {
        setError('Файл слишком большой. Максимум 4 ГБ');
        return;
      }
      uploadMutation.mutate({
        title: file.name.replace(/\.[^.]+$/, ''),
        fileName: file.name,
        fileSize: file.size,
      });
    },
    [uploadMutation],
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

  return (
    <div className="max-w-2xl">
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode('file')}
          className={`px-4 py-2 rounded-lg ${mode === 'file' ? 'bg-brand-600 text-white' : 'bg-gray-100'}`}
        >
          Загрузить файл
        </button>
        <button
          onClick={() => setMode('url')}
          className={`px-4 py-2 rounded-lg ${mode === 'url' ? 'bg-brand-600 text-white' : 'bg-gray-100'}`}
        >
          Вставить ссылку
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

      {mode === 'file' ? (
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
