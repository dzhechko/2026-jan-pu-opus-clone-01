'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <h1 className="text-2xl font-bold">Ошибка загрузки</h1>
      <p className="text-muted-foreground">
        Не удалось загрузить редактор клипа.
      </p>
      {process.env.NODE_ENV === 'development' && error.message && (
        <pre className="text-xs text-destructive max-w-lg overflow-auto">
          {error.message}
        </pre>
      )}
      <button
        onClick={reset}
        className="px-4 py-2 bg-primary text-primary-foreground rounded"
      >
        Попробовать снова
      </button>
    </div>
  );
}
