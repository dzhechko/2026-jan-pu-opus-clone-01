import { VideoIcon, ScissorsIcon } from 'lucide-react';
import { StatCard } from './stat-card';
import { MinutesCard } from './minutes-card';
import { PlanBadge } from './plan-badge';

type StatsGridProps = {
  user: {
    minutesUsed: number;
    minutesLimit: number;
    planId: string;
    subscription: { currentPeriodEnd: Date } | null;
  };
  videoCount: number;
  clipCount: number;
};

export function StatsGrid({ user, videoCount, clipCount }: StatsGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
      <MinutesCard
        minutesUsed={user.minutesUsed}
        minutesLimit={user.minutesLimit}
      />

      <StatCard
        icon={<VideoIcon className="h-5 w-5" />}
        label="Видео загружено"
        value={videoCount}
        aria-label={`Загружено ${videoCount} видео`}
      />

      <StatCard
        icon={<ScissorsIcon className="h-5 w-5" />}
        label="Клипов создано"
        value={clipCount}
        aria-label={`Создано ${clipCount} клипов`}
      />

      <PlanBadge
        planId={user.planId}
        subscription={user.subscription}
      />
    </div>
  );
}
