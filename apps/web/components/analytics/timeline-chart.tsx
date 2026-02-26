'use client';

type TimelinePoint = {
  date: string;
  views: number;
};

type TimelineChartProps = {
  data: TimelinePoint[];
};

function formatNumber(n: number): string {
  return n.toLocaleString('ru-RU');
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function TimelineChart({ data }: TimelineChartProps) {
  if (data.length === 0) return null;

  const maxViews = Math.max(...data.map((d) => d.views), 1);
  const totalViews = data.reduce((sum, d) => sum + d.views, 0);

  // Show every Nth label to avoid overcrowding
  const labelInterval = data.length <= 14 ? 2 : data.length <= 30 ? 5 : 7;

  return (
    <section aria-label="Просмотры за период">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-semibold">Просмотры за 30 дней</h2>
        <span className="text-sm text-gray-500">
          Всего: {formatNumber(totalViews)}
        </span>
      </div>
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div
          className="flex items-end gap-[2px] h-40"
          role="img"
          aria-label={`График просмотров за ${data.length} дней, всего ${totalViews} просмотров`}
        >
          {data.map((point) => {
            const heightPercent = maxViews > 0 ? (point.views / maxViews) * 100 : 0;
            return (
              <div
                key={point.date}
                className="flex-1 group relative"
                title={`${formatDateLabel(point.date)}: ${formatNumber(point.views)} просм.`}
              >
                <div
                  className="w-full bg-blue-500 rounded-t-sm transition-colors group-hover:bg-blue-600"
                  style={{
                    height: `${Math.max(heightPercent, point.views > 0 ? 2 : 0)}%`,
                    minHeight: point.views > 0 ? '2px' : '0px',
                  }}
                />
                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                  <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                    {formatDateLabel(point.date)}: {formatNumber(point.views)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {/* X-axis labels */}
        <div className="flex gap-[2px] mt-2">
          {data.map((point, idx) => (
            <div key={point.date} className="flex-1 text-center">
              {idx % labelInterval === 0 ? (
                <span className="text-[10px] text-gray-400">
                  {formatDateLabel(point.date)}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
