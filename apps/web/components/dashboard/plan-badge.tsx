import { SparklesIcon } from 'lucide-react';

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-700',
  start: 'bg-blue-100 text-blue-700',
  pro: 'bg-purple-100 text-purple-700',
  business: 'bg-amber-100 text-amber-700',
};

const PLAN_DISPLAY_NAMES: Record<string, string> = {
  free: 'Бесплатный',
  start: 'Стартовый',
  pro: 'Профессионал',
  business: 'Бизнес',
};

type PlanBadgeProps = {
  planId: string;
  subscription: { currentPeriodEnd: Date } | null;
};

export function PlanBadge({ planId, subscription }: PlanBadgeProps) {
  const colorClass = PLAN_COLORS[planId] ?? PLAN_COLORS.free;
  const planName = PLAN_DISPLAY_NAMES[planId] ?? planId;

  const billingText = subscription
    ? `до ${new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(subscription.currentPeriodEnd))}`
    : 'Бесплатный план';

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm" aria-label={`Тарифный план: ${planName}`}>
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
    </div>
  );
}
