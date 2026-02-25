'use client';

import { useEffect } from 'react';
import { AlertCircleIcon, RefreshCwIcon } from 'lucide-react';

type DashboardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <AlertCircleIcon className="h-12 w-12 text-red-500" />

      <h2 className="text-xl font-semibold">Произошла ошибка</h2>

      <p className="text-gray-500 text-center max-w-md">
        Не удалось загрузить данные дашборда. Попробуйте обновить страницу.
        Если проблема сохраняется, обратитесь в поддержку.
      </p>

      {error.digest && (
        <p className="text-xs text-gray-500">
          Код ошибки: {error.digest}
        </p>
      )}

      <button
        onClick={reset}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
      >
        <RefreshCwIcon className="h-4 w-4" />
        Попробовать снова
      </button>
    </div>
  );
}
