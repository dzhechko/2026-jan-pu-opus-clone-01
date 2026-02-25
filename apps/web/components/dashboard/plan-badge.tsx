import { SparklesIcon } from 'lucide-react';
import type { PlanId } from '@clipmaker/types';

const PLAN_COLORS: Record<PlanId, string> = {
  free: 'bg-gray-100 text-gray-700',
  start: 'bg-blue-100 text-blue-700',
  pro: 'bg-purple-100 text-purple-700',
  business: 'bg-amber-100 text-amber-700',
};

const PLAN_DISPLAY_NAMES: Record<PlanId, string> = {
  free: 'Бесплатный',
  start: 'Стартовый',
  pro: 'Профессионал',
  business: 'Бизнес',
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

type PlanBadgeProps = {
  planId: string;
  subscription: { currentPeriodEnd: Date } | null;
};

export function PlanBadge({ planId, subscription }: PlanBadgeProps) {
  const colorClass = PLAN_COLORS[planId as PlanId] ?? PLAN_COLORS.free;
  const planName = PLAN_DISPLAY_NAMES[planId as PlanId] ?? planId;

  const billingText = subscription
    ? `до ${dateFormatter.format(new Date(subscription.currentPeriodEnd))}`
    : 'Бесплатный план';

  return (
    <section className="rounded-xl border bg-white p-6 shadow-sm" aria-label={`Тарифный план: ${planName}`}>
      <div className="flex items-center gap-3 mb-4">
        <SparklesIcon className="h-5 w-5 text-gray-400" />
        <span className="text-sm text-gray-500">Тарифный план</span>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${colorClass}`}>
          {planName}
        </span>
      </div>

      <div className="text-xs text-gray-500">
        {billingText}
      </div>
    </section>
  );
}
