import { BarChart3Icon } from 'lucide-react';
import Link from 'next/link';

export function AnalyticsEmpty() {
  return (
    <section
      className="rounded-xl border bg-white p-12 shadow-sm text-center"
      aria-label="Нет данных аналитики"
    >
      <BarChart3Icon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
      <h2 className="text-lg font-semibold text-gray-700 mb-2">
        Пока нет данных
      </h2>
      <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
        Аналитика появится после публикации клипов на платформы.
        Загрузите видео, создайте клипы и опубликуйте их в VK, Rutube, Дзен или Telegram.
      </p>
      <Link
        href="/dashboard/upload"
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
      >
        Загрузить видео
      </Link>
    </section>
  );
}
