import Link from 'next/link';
import { UploadCloudIcon } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] rounded-xl border border-dashed bg-white p-12 space-y-6">
      <UploadCloudIcon className="h-16 w-16 text-gray-300" />

      <h3 className="text-lg font-semibold">Загрузите первое видео</h3>

      <p className="text-gray-500 text-center max-w-sm">
        КлипМейкер превратит ваш вебинар в 10 промо-шортсов за 5 минут
      </p>

      <Link
        href="/dashboard/upload"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 transition-colors"
      >
        <UploadCloudIcon className="h-5 w-5" />
        Загрузить видео
      </Link>
    </div>
  );
}
