import { PLATFORM_LABELS, formatNumber } from './format-utils';

type PlatformRow = {
  platform: string;
  publicationCount: number;
  totalViews: number;
  totalLikes: number;
  totalShares: number;
};

type PlatformTableProps = {
  data: PlatformRow[];
};

export function PlatformTable({ data }: PlatformTableProps) {
  if (data.length === 0) return null;

  return (
    <section aria-label="Статистика по платформам">
      <h2 className="text-lg font-semibold mb-4">По платформам</h2>
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500">Платформа</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Публикаций</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Просмотры</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Лайки</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Репосты</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.platform} className="border-b last:border-b-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">
                  {PLATFORM_LABELS[row.platform] ?? row.platform}
                </td>
                <td className="text-right px-4 py-3 tabular-nums">
                  {formatNumber(row.publicationCount)}
                </td>
                <td className="text-right px-4 py-3 tabular-nums">
                  {formatNumber(row.totalViews)}
                </td>
                <td className="text-right px-4 py-3 tabular-nums">
                  {formatNumber(row.totalLikes)}
                </td>
                <td className="text-right px-4 py-3 tabular-nums">
                  {formatNumber(row.totalShares)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
