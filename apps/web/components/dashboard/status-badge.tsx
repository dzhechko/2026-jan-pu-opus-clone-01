type StatusConfig = {
  label: string;
  className: string;
};

const STATUS_MAP: Record<string, StatusConfig> = {
  uploading: {
    label: 'Загрузка',
    className: 'bg-blue-100 text-blue-700',
  },
  transcribing: {
    label: 'Транскрибация',
    className: 'bg-blue-100 text-blue-700',
  },
  analyzing: {
    label: 'Анализ',
    className: 'bg-purple-100 text-purple-700',
  },
  generating_clips: {
    label: 'Генерация',
    className: 'bg-purple-100 text-purple-700',
  },
  completed: {
    label: 'Готово',
    className: 'bg-green-100 text-green-700',
  },
  failed: {
    label: 'Ошибка',
    className: 'bg-red-100 text-red-700',
  },
};

const FALLBACK_STATUS: StatusConfig = {
  label: 'Неизвестно',
  className: 'bg-gray-100 text-gray-700',
};

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_MAP[status] ?? FALLBACK_STATUS;

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
