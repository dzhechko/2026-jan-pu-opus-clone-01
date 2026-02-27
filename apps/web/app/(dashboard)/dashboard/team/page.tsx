'use client';

import { trpc } from '@/lib/trpc/client';
import { CreateTeamForm } from '@/components/team/create-team-form';
import { InviteMemberForm } from '@/components/team/invite-member-form';
import { MemberList } from '@/components/team/member-list';
import { UsersIcon, LogOutIcon, TrashIcon } from 'lucide-react';

export default function TeamPage() {
  const { data: team, isLoading } = trpc.team.get.useQuery();
  const { data: me } = trpc.user.me.useQuery();
  const utils = trpc.useUtils();

  const leaveTeam = trpc.team.leave.useMutation({
    onSuccess: () => utils.team.get.invalidate(),
  });

  const deleteTeam = trpc.team.delete.useMutation({
    onSuccess: () => utils.team.get.invalidate(),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Команда</h1>
        <div className="rounded-xl border bg-white p-6 shadow-sm animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-48 mb-4" />
          <div className="h-4 bg-gray-200 rounded w-64" />
        </div>
      </div>
    );
  }

  // No team yet
  if (!team) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Команда</h1>
        <div className="rounded-xl border bg-white p-12 shadow-sm text-center">
          <UsersIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-700 mb-2">
            Нет команды
          </h2>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Создайте команду, чтобы совместно работать над видео. Доступно на тарифах Pro и Business.
          </p>
        </div>
        <CreateTeamForm />
      </div>
    );
  }

  const currentUserId = me?.id ?? '';
  const currentMember = team.members.find((m) => m.userId === currentUserId);
  const isOwner = currentMember?.role === 'owner';
  const isOwnerOrAdmin = currentMember?.role === 'owner' || currentMember?.role === 'admin';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{team.name}</h1>
          <p className="text-sm text-gray-500">Управление командой</p>
        </div>
        <div className="flex gap-2">
          {!isOwner && (
            <button
              type="button"
              onClick={() => {
                if (confirm('Вы уверены, что хотите покинуть команду?')) {
                  leaveTeam.mutate();
                }
              }}
              disabled={leaveTeam.isPending}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <LogOutIcon className="h-4 w-4" />
              Покинуть
            </button>
          )}
          {isOwner && (
            <button
              type="button"
              onClick={() => {
                if (confirm('Удалить команду? Это действие необратимо.')) {
                  deleteTeam.mutate();
                }
              }}
              disabled={deleteTeam.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <TrashIcon className="h-4 w-4" />
              Удалить команду
            </button>
          )}
        </div>
      </div>

      <MemberList
        members={team.members}
        invites={team.invites}
        currentUserId={currentUserId}
        isOwnerOrAdmin={isOwnerOrAdmin}
      />

      {isOwnerOrAdmin && <InviteMemberForm teamId={team.id} />}

      {leaveTeam.error && (
        <p className="text-sm text-red-600">{leaveTeam.error.message}</p>
      )}
      {deleteTeam.error && (
        <p className="text-sm text-red-600">{deleteTeam.error.message}</p>
      )}
    </div>
  );
}
