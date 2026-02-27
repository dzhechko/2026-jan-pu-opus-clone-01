const STAGE_LABELS: Record<string, string> = {
  downloading: 'Скачивание...',
  transcribing: 'Транскрибация...',
  analyzing: 'Анализ...',
  moment_selection: 'Выбор моментов...',
  enrichment: 'Оценка и заголовки...',
  generating_clips: 'Рендеринг клипов...',
};

type ProcessingProgressProps = {
  progress: number | null;
  stage: string | null;
  onCancel?: () => void;
  isCancelling?: boolean;
};

export function ProcessingProgress({ progress, stage, onCancel, isCancelling }: ProcessingProgressProps) {
  const pct = progress ?? 0;
  const label = stage ? (STAGE_LABELS[stage] ?? stage) : 'Обработка...';

  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between text-xs text-gray-500 mb-0.5">
        <span>{label}</span>
        <div className="flex items-center gap-2">
          <span>{pct}%</span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isCancelling}
              className="px-1.5 py-0.5 text-xs rounded bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-50 transition-colors"
              title="Остановить обработку"
            >
              {isCancelling ? '...' : 'Стоп'}
            </button>
          )}
        </div>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
