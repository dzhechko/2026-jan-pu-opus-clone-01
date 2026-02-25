import { type ReactNode } from 'react';

type StatCardProps = {
  icon: ReactNode;
  label: string;
  value: number | string;
  'aria-label'?: string;
};

export function StatCard({ icon, label, value, 'aria-label': ariaLabel }: StatCardProps) {
  return (
    <section className="rounded-xl border bg-white p-6 shadow-sm" aria-label={ariaLabel}>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-gray-400">{icon}</span>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </section>
  );
}
