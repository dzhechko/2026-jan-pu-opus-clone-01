'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

type VideoHeaderProps = {
  videoId: string;
  title: string;
  status: string;
  durationSeconds: number | null;
  sttModel: string | null;
};

export function VideoHeader({ videoId, title, status, durationSeconds, sttModel }: VideoHeaderProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  const deleteMutation = trpc.video.delete.useMutation({
    onSuccess: () => {
      router.push('/dashboard');
    },
  });

  return (
    <div className="mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <div className="flex gap-4 mt-2 text-sm text-gray-500">
            <span>Статус: {status}</span>
            {durationSeconds != null && <span>{Math.round(durationSeconds / 60)} мин</span>}
            {sttModel && <span>STT: {sttModel}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="px-3 py-1.5 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
            >
              Удалить
            </button>
          ) : (
            <>
              <span className="text-sm text-red-600">Удалить видео и все клипы?</span>
              <button
                type="button"
                onClick={() => deleteMutation.mutate({ id: videoId })}
                disabled={deleteMutation.isPending}
                className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleteMutation.isPending ? 'Удаление...' : 'Да, удалить'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleteMutation.isPending}
                className="px-3 py-1.5 text-sm rounded-lg border text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Отмена
              </button>
            </>
          )}
        </div>
      </div>

      {deleteMutation.isError && (
        <p className="mt-2 text-sm text-red-500">
          Ошибка удаления: {deleteMutation.error.message}
        </p>
      )}
    </div>
  );
}
