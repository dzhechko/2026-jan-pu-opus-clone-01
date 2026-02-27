'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';

export function CreateTeamForm() {
  const [name, setName] = useState('');
  const utils = trpc.useUtils();

  const createTeam = trpc.team.create.useMutation({
    onSuccess: () => {
      utils.team.get.invalidate();
      setName('');
    },
  });

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold mb-4">Создать команду</h2>
      <p className="text-sm text-gray-500 mb-4">
        Создайте команду, чтобы совместно работать над видео и клипами.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) {
            createTeam.mutate({ name: name.trim() });
          }
        }}
        className="flex gap-3"
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название команды"
          className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          maxLength={100}
        />
        <button
          type="submit"
          disabled={!name.trim() || createTeam.isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {createTeam.isPending ? 'Создание...' : 'Создать'}
        </button>
      </form>
      {createTeam.error && (
        <p className="mt-2 text-sm text-red-600">{createTeam.error.message}</p>
      )}
    </div>
  );
}
