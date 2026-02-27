'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { OverviewCards } from '@/components/analytics/overview-cards';
import { PlatformTable } from '@/components/analytics/platform-table';
import { TopClipsTable } from '@/components/analytics/top-clips-table';
import { TimelineChart } from '@/components/analytics/timeline-chart';
import { AnalyticsEmpty } from '@/components/analytics/analytics-empty';
import { DateRangePicker } from '@/components/analytics/date-range-picker';
import { RefreshCwIcon } from 'lucide-react';

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);

  const utils = trpc.useUtils();

  const overview = trpc.analytics.overview.useQuery();
  const byPlatform = trpc.analytics.byPlatform.useQuery();
  const topClips = trpc.analytics.topClips.useQuery({ limit: 10 });
  const timeline = trpc.analytics.timeline.useQuery({ days });

  const isLoading =
    overview.isLoading || byPlatform.isLoading || topClips.isLoading || timeline.isLoading;

  const isEmpty = !overview.data || overview.data.publishedCount === 0;

  function handleRefresh() {
    utils.analytics.invalidate();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Аналитика</h1>
        <div className="flex items-center gap-3">
          <DateRangePicker value={days} onChange={setDays} />
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCwIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Обновить
          </button>
        </div>
      </div>

      {isLoading && !overview.data ? (
        <div className="space-y-4">
          {/* Skeleton cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border bg-white p-6 shadow-sm animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-20 mb-3" />
                <div className="h-8 bg-gray-200 rounded w-16" />
              </div>
            ))}
          </div>
          <div className="rounded-xl border bg-white p-6 shadow-sm h-48 animate-pulse" />
        </div>
      ) : isEmpty ? (
        <AnalyticsEmpty />
      ) : (
        <>
          <OverviewCards
            totalViews={overview.data!.totalViews}
            totalLikes={overview.data!.totalLikes}
            totalShares={overview.data!.totalShares}
            publishedCount={overview.data!.publishedCount}
          />

          {byPlatform.data && <PlatformTable data={byPlatform.data} />}

          {topClips.data && <TopClipsTable clips={topClips.data} />}

          {timeline.data && <TimelineChart data={timeline.data} days={days} />}
        </>
      )}
    </div>
  );
}
