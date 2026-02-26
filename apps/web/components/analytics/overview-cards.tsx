import { EyeIcon, HeartIcon, Share2Icon, SendIcon } from 'lucide-react';
import { StatCard } from '../dashboard/stat-card';
import { formatNumber } from './format-utils';

type OverviewCardsProps = {
  totalViews: number;
  totalLikes: number;
  totalShares: number;
  publishedCount: number;
};

export function OverviewCards({
  totalViews,
  totalLikes,
  totalShares,
  publishedCount,
}: OverviewCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        icon={<EyeIcon className="h-5 w-5" />}
        label="Просмотры"
        value={formatNumber(totalViews)}
        aria-label={`Всего ${totalViews} просмотров`}
      />
      <StatCard
        icon={<HeartIcon className="h-5 w-5" />}
        label="Лайки"
        value={formatNumber(totalLikes)}
        aria-label={`Всего ${totalLikes} лайков`}
      />
      <StatCard
        icon={<Share2Icon className="h-5 w-5" />}
        label="Репосты"
        value={formatNumber(totalShares)}
        aria-label={`Всего ${totalShares} репостов`}
      />
      <StatCard
        icon={<SendIcon className="h-5 w-5" />}
        label="Опубликовано"
        value={formatNumber(publishedCount)}
        aria-label={`${publishedCount} публикаций`}
      />
    </div>
  );
}
