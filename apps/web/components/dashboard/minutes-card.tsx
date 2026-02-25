import { ClockIcon } from 'lucide-react';

type MinutesCardProps = {
  minutesUsed: number;
  minutesLimit: number;
};

export function MinutesCard({ minutesUsed, minutesLimit }: MinutesCardProps) {
  const percentage = minutesLimit > 0
    ? Math.round((minutesUsed / minutesLimit) * 100)
    : 0;

  const progressColor =
    percentage > 80 ? 'bg-red-500'
    : percentage >= 50 ? 'bg-yellow-500'
    : 'bg-green-500';

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <ClockIcon className="h-5 w-5 text-gray-400" />
        <span className="text-sm text-gray-500">Минуты обработки</span>
      </div>

      <div className="text-2xl font-bold mb-2">
        {minutesUsed} из {minutesLimit} мин
      </div>

      <div
        className="w-full h-2 bg-gray-100 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={minutesUsed}
        aria-valuemin={0}
        aria-valuemax={minutesLimit}
        aria-label={`Использовано ${minutesUsed} из ${minutesLimit} минут`}
      >
        <div
          className={`h-full rounded-full transition-all ${progressColor}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>

      <div className="mt-1 text-xs text-gray-500 text-right">
        {percentage}% использовано
      </div>
    </div>
  );
}
