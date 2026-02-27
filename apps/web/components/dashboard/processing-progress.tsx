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
};

export function ProcessingProgress({ progress, stage }: ProcessingProgressProps) {
  const pct = progress ?? 0;
  const label = stage ? (STAGE_LABELS[stage] ?? stage) : 'Обработка...';

  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between text-xs text-gray-500 mb-0.5">
        <span>{label}</span>
        <span>{pct}%</span>
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
