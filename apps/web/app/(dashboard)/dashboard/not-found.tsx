import Link from 'next/link';
import { FileQuestionIcon } from 'lucide-react';

export default function DashboardNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <FileQuestionIcon className="h-12 w-12 text-gray-400" />

      <h2 className="text-xl font-semibold">Страница не найдена</h2>

      <p className="text-gray-500 text-center max-w-md">
        Запрашиваемая страница не существует или была удалена.
      </p>

      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
      >
        Вернуться на дашборд
      </Link>
    </div>
  );
}
