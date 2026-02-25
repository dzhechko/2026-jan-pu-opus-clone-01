'use client';

type ActionBarProps = {
  isDirty: boolean;
  isSaving: boolean;
  isRendering: boolean;
  onSave: () => void;
  onPreview: () => void;
  onReset: () => void;
};

export function ActionBar({
  isDirty,
  isSaving,
  isRendering,
  onSave,
  onPreview,
  onReset,
}: ActionBarProps) {
  const saveDisabled = !isDirty || isSaving || isRendering;
  const resetDisabled = !isDirty || isSaving;

  return (
    <div className="flex flex-col gap-2 pt-4 border-t border-border">
      {isRendering && (
        <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded text-sm text-amber-700 dark:text-amber-400">
          <svg
            className="animate-spin h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span>Рендеринг...</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onPreview}
          className="
            flex-1 px-4 py-2 text-sm font-medium rounded
            border border-border
            bg-secondary text-secondary-foreground
            hover:bg-secondary/80
            transition-colors
          "
        >
          Предпросмотр
        </button>

        <button
          onClick={onReset}
          disabled={resetDisabled}
          className="
            px-4 py-2 text-sm font-medium rounded
            border border-border
            text-muted-foreground
            hover:bg-muted
            transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          Отмена
        </button>

        <button
          onClick={onSave}
          disabled={saveDisabled}
          className="
            flex-1 px-4 py-2 text-sm font-medium rounded
            bg-primary text-primary-foreground
            hover:bg-primary/90
            transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {isSaving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}
