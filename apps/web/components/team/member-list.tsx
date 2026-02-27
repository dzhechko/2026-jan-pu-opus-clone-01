'use client';

import { trpc } from '@/lib/trpc/client';
import { ShieldIcon, UserIcon, CrownIcon, TrashIcon, XIcon } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  member: 'Участник',
};

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner: <CrownIcon className="h-4 w-4 text-amber-500" />,
  admin: <ShieldIcon className="h-4 w-4 text-blue-500" />,
  member: <UserIcon className="h-4 w-4 text-gray-400" />,
};

type Member = {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: string;
  joinedAt: Date;
};

type Invite = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
};

type MemberListProps = {
  members: Member[];
  invites: Invite[];
  currentUserId: string;
  isOwnerOrAdmin: boolean;
};

export function MemberList({ members, invites, currentUserId, isOwnerOrAdmin }: MemberListProps) {
  const utils = trpc.useUtils();

  const removeMember = trpc.team.removeMember.useMutation({
    onSuccess: () => utils.team.get.invalidate(),
  });

  const updateRole = trpc.team.updateRole.useMutation({
    onSuccess: () => utils.team.get.invalidate(),
  });

  const cancelInvite = trpc.team.cancelInvite.useMutation({
    onSuccess: () => utils.team.get.invalidate(),
  });

  const currentMember = members.find((m) => m.userId === currentUserId);
  const isOwner = currentMember?.role === 'owner';

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b bg-gray-50">
        <h3 className="text-base font-semibold">Участники ({members.length})</h3>
      </div>
      <ul className="divide-y">
        {members.map((member) => (
          <li key={member.id} className="px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {ROLE_ICONS[member.role]}
              <div>
                <div className="text-sm font-medium">
                  {member.name ?? member.email}
                  {member.userId === currentUserId && (
                    <span className="ml-2 text-xs text-gray-400">(вы)</span>
                  )}
                </div>
                {member.name && (
                  <div className="text-xs text-gray-500">{member.email}</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isOwner && member.role !== 'owner' && (
                <select
                  value={member.role}
                  onChange={(e) =>
                    updateRole.mutate({
                      memberId: member.id,
                      role: e.target.value as 'admin' | 'member',
                    })
                  }
                  className="text-xs rounded border px-2 py-1"
                >
                  <option value="member">Участник</option>
                  <option value="admin">Администратор</option>
                </select>
              )}
              {!isOwner && (
                <span className="text-xs text-gray-400">{ROLE_LABELS[member.role]}</span>
              )}
              {isOwnerOrAdmin && member.role !== 'owner' && member.userId !== currentUserId && (
                <button
                  type="button"
                  onClick={() => removeMember.mutate({ memberId: member.id })}
                  disabled={removeMember.isPending}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  title="Удалить из команды"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {invites.length > 0 && (
        <>
          <div className="px-6 py-3 border-t bg-gray-50">
            <h4 className="text-sm font-medium text-gray-500">Ожидают приглашения ({invites.length})</h4>
          </div>
          <ul className="divide-y">
            {invites.map((invite) => (
              <li key={invite.id} className="px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-4 w-4 rounded-full border-2 border-dashed border-gray-300" />
                  <div>
                    <div className="text-sm text-gray-600">{invite.email}</div>
                    <div className="text-xs text-gray-400">
                      {ROLE_LABELS[invite.role]} — истекает{' '}
                      {new Date(invite.expiresAt).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                </div>
                {isOwnerOrAdmin && (
                  <button
                    type="button"
                    onClick={() => cancelInvite.mutate({ inviteId: invite.id })}
                    disabled={cancelInvite.isPending}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    title="Отменить приглашение"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
