'use client';

type DateRangeOption = {
  label: string;
  days: number;
};

const OPTIONS: DateRangeOption[] = [
  { label: '7 дней', days: 7 },
  { label: '14 дней', days: 14 },
  { label: '30 дней', days: 30 },
  { label: '90 дней', days: 90 },
];

type DateRangePickerProps = {
  value: number;
  onChange: (days: number) => void;
};

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-white p-1 shadow-sm">
      {OPTIONS.map((opt) => (
        <button
          key={opt.days}
          type="button"
          onClick={() => onChange(opt.days)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === opt.days
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
