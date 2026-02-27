'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { trpc } from '@/lib/trpc/client';
import { CheckCircleIcon, XCircleIcon, Loader2Icon } from 'lucide-react';
import Link from 'next/link';

function InviteAcceptContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const acceptInvite = trpc.team.acceptInvite.useMutation();

  if (!token) {
    return (
      <div className="text-center">
        <XCircleIcon className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <h1 className="text-xl font-semibold mb-2">Недействительная ссылка</h1>
        <p className="text-gray-500 mb-6">Ссылка приглашения повреждена или отсутствует.</p>
        <Link href="/dashboard" className="text-blue-600 hover:underline">
          Перейти в дашборд
        </Link>
      </div>
    );
  }

  if (acceptInvite.isSuccess) {
    return (
      <div className="text-center">
        <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h1 className="text-xl font-semibold mb-2">Добро пожаловать в команду!</h1>
        <p className="text-gray-500 mb-6">
          Вы присоединились к команде &laquo;{acceptInvite.data.teamName}&raquo;
        </p>
        <Link
          href="/dashboard/team"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Перейти к команде
        </Link>
      </div>
    );
  }

  if (acceptInvite.error) {
    return (
      <div className="text-center">
        <XCircleIcon className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <h1 className="text-xl font-semibold mb-2">Ошибка</h1>
        <p className="text-gray-500 mb-6">{acceptInvite.error.message}</p>
        <Link href="/dashboard" className="text-blue-600 hover:underline">
          Перейти в дашборд
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center">
      <h1 className="text-xl font-semibold mb-4">Приглашение в команду</h1>
      <p className="text-gray-500 mb-6">
        Нажмите кнопку ниже, чтобы принять приглашение.
      </p>
      <button
        type="button"
        onClick={() => acceptInvite.mutate({ token })}
        disabled={acceptInvite.isPending}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {acceptInvite.isPending && <Loader2Icon className="h-4 w-4 animate-spin" />}
        {acceptInvite.isPending ? 'Принимаю...' : 'Принять приглашение'}
      </button>
    </div>
  );
}

export default function InvitePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border bg-white p-8 shadow-sm">
        <Suspense
          fallback={
            <div className="text-center">
              <Loader2Icon className="h-8 w-8 animate-spin text-gray-400 mx-auto" />
            </div>
          }
        >
          <InviteAcceptContent />
        </Suspense>
      </div>
    </div>
  );
}
