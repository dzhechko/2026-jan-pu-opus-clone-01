'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

type PaginationControlsProps = {
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
};

export function PaginationControls({ currentPage, totalPages, hasMore }: PaginationControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function navigateToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (page === 1) {
      params.delete('page');
    } else {
      params.set('page', page.toString());
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const hasPrev = currentPage > 1;

  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-gray-500">
        Страница {currentPage} из {totalPages}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => navigateToPage(currentPage - 1)}
          disabled={!hasPrev}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg border hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Назад
        </button>

        <button
          onClick={() => navigateToPage(currentPage + 1)}
          disabled={!hasMore}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg border hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          Вперёд
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
