type TopClipRow = {
  publicationId: string;
  clipId: string;
  clipTitle: string;
  platform: string;
  views: number;
  likes: number;
  shares: number;
  publishedAt: Date | null;
  platformUrl: string | null;
};

type TopClipsTableProps = {
  clips: TopClipRow[];
};

const PLATFORM_LABELS: Record<string, string> = {
  vk: 'VK',
  rutube: 'Rutube',
  dzen: 'Дзен',
  telegram: 'Telegram',
};

function formatNumber(n: number): string {
  return n.toLocaleString('ru-RU');
}

function truncateTitle(title: string, maxLen: number = 60): string {
  if (title.length <= maxLen) return title;
  return title.slice(0, maxLen - 1) + '\u2026';
}

function formatDate(date: Date | null): string {
  if (!date) return '\u2014';
  return new Date(date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

export function TopClipsTable({ clips }: TopClipsTableProps) {
  if (clips.length === 0) return null;

  return (
    <section aria-label="Топ клипы по просмотрам">
      <h2 className="text-lg font-semibold mb-4">Топ клипы</h2>
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Клип</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Платформа</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Просмотры</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Лайки</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Репосты</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Дата</th>
            </tr>
          </thead>
          <tbody>
            {clips.map((clip, idx) => (
              <tr key={clip.publicationId} className="border-b last:border-b-0 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                <td className="px-4 py-3 font-medium max-w-[200px]">
                  {clip.platformUrl ? (
                    <a
                      href={clip.platformUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                      title={clip.clipTitle}
                    >
                      {truncateTitle(clip.clipTitle)}
                    </a>
                  ) : (
                    <span title={clip.clipTitle}>{truncateTitle(clip.clipTitle)}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {PLATFORM_LABELS[clip.platform] ?? clip.platform}
                </td>
                <td className="text-right px-4 py-3 tabular-nums">
                  {formatNumber(clip.views)}
                </td>
                <td className="text-right px-4 py-3 tabular-nums">
                  {formatNumber(clip.likes)}
                </td>
                <td className="text-right px-4 py-3 tabular-nums">
                  {formatNumber(clip.shares)}
                </td>
                <td className="text-right px-4 py-3 text-gray-500 whitespace-nowrap">
                  {formatDate(clip.publishedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
