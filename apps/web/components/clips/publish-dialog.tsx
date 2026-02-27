'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';

type PublishDialogProps = {
  clipId: string;
  clipTitle: string;
  onClose: () => void;
  onPublished: () => void;
};

const PLATFORM_LABELS: Record<string, { name: string; icon: string }> = {
  vk: { name: 'VK Клипы', icon: '🎬' },
  rutube: { name: 'Rutube', icon: '📺' },
  dzen: { name: 'Дзен', icon: '📰' },
  telegram: { name: 'Telegram', icon: '✈️' },
};

export function PublishDialog({ clipId, clipTitle, onClose, onPublished }: PublishDialogProps) {
  const { data: connections } = trpc.platform.list.useQuery();
  const publishMutation = trpc.clip.publish.useMutation({
    onSuccess: () => {
      onPublished();
      onClose();
    },
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scheduleMode, setScheduleMode] = useState<'now' | 'schedule'>('now');
  const [scheduleAt, setScheduleAt] = useState('');

  const connectedPlatforms = connections ?? [];

  const togglePlatform = (platform: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  };

  const handlePublish = () => {
    if (selected.size === 0) return;
    publishMutation.mutate({
      id: clipId,
      platforms: Array.from(selected) as ('vk' | 'rutube' | 'dzen' | 'telegram')[],
      ...(scheduleMode === 'schedule' && scheduleAt ? { scheduleAt } : {}),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl border shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-1">Опубликовать клип</h2>
        <p className="text-sm text-gray-500 mb-4 truncate">{clipTitle}</p>

        {connectedPlatforms.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-gray-500 mb-3">Нет подключённых платформ</p>
            <a
              href="/dashboard/settings/platforms"
              className="text-sm text-blue-600 hover:underline"
            >
              Подключить платформу
            </a>
          </div>
        ) : (
          <>
            <div className="space-y-2 mb-4">
              {connectedPlatforms.map((conn) => {
                const info = PLATFORM_LABELS[conn.platform];
                if (!info) return null;
                return (
                  <label
                    key={conn.platform}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      selected.has(conn.platform)
                        ? 'border-blue-500 bg-blue-50'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(conn.platform)}
                      onChange={() => togglePlatform(conn.platform)}
                      className="accent-blue-600"
                    />
                    <span>{info.icon}</span>
                    <span className="text-sm font-medium">{info.name}</span>
                  </label>
                );
              })}
            </div>

            <div className="mb-4">
              <div className="flex gap-3 mb-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="schedule"
                    checked={scheduleMode === 'now'}
                    onChange={() => setScheduleMode('now')}
                  />
                  Сейчас
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="schedule"
                    checked={scheduleMode === 'schedule'}
                    onChange={() => setScheduleMode('schedule')}
                  />
                  Запланировать
                </label>
              </div>
              {scheduleMode === 'schedule' && (
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)}
                  className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              )}
            </div>

            {publishMutation.isError && (
              <p className="text-sm text-red-500 mb-3">{publishMutation.error.message}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePublish}
                disabled={selected.size === 0 || publishMutation.isPending}
                className="flex-1 px-4 py-2 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {publishMutation.isPending
                  ? 'Публикация...'
                  : scheduleMode === 'schedule'
                    ? 'Запланировать'
                    : `Опубликовать (${selected.size})`}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm rounded border hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
