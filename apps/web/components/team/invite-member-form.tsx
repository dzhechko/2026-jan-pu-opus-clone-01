'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { SendIcon } from 'lucide-react';

type InviteMemberFormProps = {
  teamId: string;
};

export function InviteMemberForm({ teamId }: InviteMemberFormProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const utils = trpc.useUtils();

  const invite = trpc.team.invite.useMutation({
    onSuccess: () => {
      utils.team.get.invalidate();
      setEmail('');
    },
  });

  // teamId is used to ensure the form is rendered only when a team exists
  void teamId;

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h3 className="text-base font-semibold mb-3">Пригласить участника</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) {
            invite.mutate({ email: email.trim(), role });
          }
        }}
        className="flex gap-3 items-end"
      >
        <div className="flex-1">
          <label htmlFor="invite-email" className="block text-sm text-gray-600 mb-1">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@example.com"
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="invite-role" className="block text-sm text-gray-600 mb-1">
            Роль
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as 'member' | 'admin')}
            className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="member">Участник</option>
            <option value="admin">Администратор</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={!email.trim() || invite.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <SendIcon className="h-4 w-4" />
          {invite.isPending ? 'Отправка...' : 'Пригласить'}
        </button>
      </form>
      {invite.error && (
        <p className="mt-2 text-sm text-red-600">{invite.error.message}</p>
      )}
      {invite.isSuccess && (
        <p className="mt-2 text-sm text-green-600">Приглашение отправлено!</p>
      )}
    </div>
  );
}
