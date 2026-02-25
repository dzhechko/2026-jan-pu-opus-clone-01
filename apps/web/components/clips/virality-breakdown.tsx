'use client';

import { useState } from 'react';

type ViralityScore = {
  total: number;
  hook: number;
  engagement: number;
  flow: number;
  trend: number;
  tips?: string[];
};

type ViralityBreakdownProps = {
  score: ViralityScore;
};

const DIMENSIONS = [
  { key: 'hook' as const, label: 'Хук', description: 'Сила первых 3 секунд' },
  { key: 'engagement' as const, label: 'Вовлечение', description: 'Потенциал взаимодействия' },
  { key: 'flow' as const, label: 'Нарратив', description: 'Самодостаточность фрагмента' },
  { key: 'trend' as const, label: 'Тренд', description: 'Актуальность темы' },
];

function getScoreColor(total: number): string {
  if (total >= 70) return 'text-green-700';
  if (total >= 40) return 'text-yellow-700';
  return 'text-gray-500';
}

function getBarColor(value: number): string {
  if (value >= 18) return 'bg-green-500';
  if (value >= 10) return 'bg-yellow-500';
  return 'bg-gray-400';
}

export function ScoreBadge({ score }: { score: ViralityScore }) {
  const [isOpen, setIsOpen] = useState(false);

  const badgeClass = score.total >= 70
    ? 'bg-green-100 text-green-700'
    : score.total >= 40
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-gray-100 text-gray-500';

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`text-sm font-medium px-2 py-0.5 rounded cursor-pointer hover:opacity-80 transition ${badgeClass}`}
      >
        {score.total}/100
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-white rounded-xl border shadow-lg p-4">
            <ViralityBreakdown score={score} />
          </div>
        </>
      )}
    </div>
  );
}

export function ViralityBreakdown({ score }: ViralityBreakdownProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">Вирусный потенциал</span>
        <span className={`text-lg font-bold ${getScoreColor(score.total)}`}>
          {score.total}/100
        </span>
      </div>

      <div className="space-y-3">
        {DIMENSIONS.map(({ key, label, description }) => {
          const value = score[key];
          return (
            <div key={key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600" title={description}>{label}</span>
                <span className="text-gray-500 font-medium">{value}/25</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getBarColor(value)}`}
                  style={{ width: `${(value / 25) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {score.tips && score.tips.length > 0 && (
        <div className="mt-3 pt-3 border-t">
          <p className="text-xs font-medium text-gray-600 mb-1">Советы по улучшению:</p>
          <ul className="text-xs text-gray-500 space-y-1">
            {score.tips.map((tip, i) => (
              <li key={i}>• {tip}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
