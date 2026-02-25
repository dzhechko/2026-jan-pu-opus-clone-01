'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';

type DashboardNavProps = {
  user: { name?: string | null; email?: string | null };
};

export function DashboardNav({ user }: DashboardNavProps) {
  return (
    <nav className="bg-white border-b">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-lg font-bold text-brand-700">
            КлипМейкер
          </Link>
          <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
            Видео
          </Link>
          <Link href="/dashboard/upload" className="text-sm text-gray-600 hover:text-gray-900">
            Загрузить
          </Link>
          <Link href="/settings" className="text-sm text-gray-600 hover:text-gray-900">
            Настройки
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user.name || user.email}</span>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="text-sm text-gray-500 hover:text-red-500"
          >
            Выйти
          </button>
        </div>
      </div>
    </nav>
  );
}
