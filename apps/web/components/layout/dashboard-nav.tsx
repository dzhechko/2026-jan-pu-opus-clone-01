'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LogOutIcon, VideoIcon, SettingsIcon, UploadIcon } from 'lucide-react';

type DashboardUser = {
  id: string;
  email: string;
  planId: string;
};

type DashboardNavProps = {
  user: DashboardUser;
};

export function DashboardNav({ user }: DashboardNavProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      window.location.href = '/login';
    }
  }

  return (
    <nav className="border-b bg-white">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-lg font-bold">
            КлипМейкер
          </Link>
          <Link href="/dashboard" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900">
            <VideoIcon className="h-4 w-4" />
            Видео
          </Link>
          <Link href="/dashboard/upload" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900">
            <UploadIcon className="h-4 w-4" />
            Загрузить
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user.email}</span>
          <Link href="/dashboard/settings" className="text-gray-500 hover:text-gray-900">
            <SettingsIcon className="h-5 w-5" />
          </Link>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="text-gray-500 hover:text-gray-900 disabled:opacity-50"
            title="Выйти"
          >
            <LogOutIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </nav>
  );
}
