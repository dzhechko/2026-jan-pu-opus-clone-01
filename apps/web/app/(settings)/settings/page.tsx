'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';

export default function SettingsPage() {
  const { data: user } = trpc.user.me.useQuery();
  const [provider, setProvider] = useState(user?.llmProviderPreference ?? 'ru');

  const updateSettings = trpc.user.updateSettings.useMutation();

  function handleProviderChange(newProvider: 'ru' | 'global') {
    if (newProvider === 'global') {
      const confirmed = window.confirm(
        'При выборе Global стратегии транскрипты будут обрабатываться за пределами РФ. Продолжить?',
      );
      if (!confirmed) return;
    }
    setProvider(newProvider);
    updateSettings.mutate({ llmProviderPreference: newProvider });
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Настройки</h1>

      <section className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">AI-провайдер</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="provider"
              value="ru"
              checked={provider === 'ru'}
              onChange={() => handleProviderChange('ru')}
            />
            <div>
              <p className="font-medium">Cloud.ru (Россия)</p>
              <p className="text-sm text-gray-500">Все данные в РФ. ~21 руб за 60 мин</p>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="provider"
              value="global"
              checked={provider === 'global'}
              onChange={() => handleProviderChange('global')}
            />
            <div>
              <p className="font-medium">Global (Gemini, Claude, OpenAI)</p>
              <p className="text-sm text-gray-500">Транскрипты в US/EU. ~55 руб за 60 мин</p>
            </div>
          </label>
        </div>
      </section>

      {/* BYOK API Keys Section */}
      <section className="bg-white rounded-xl border p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">API Ключи (BYOK)</h2>
            <p className="text-sm text-gray-500 mt-1">
              {provider === 'global'
                ? 'Используйте свои API ключи для экономии на обработке'
                : 'Доступно при выборе Global стратегии'}
            </p>
          </div>
          <a
            href="/settings/api-keys"
            className={`text-sm px-4 py-2 rounded ${
              provider === 'global'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
            onClick={(e) => {
              if (provider !== 'global') e.preventDefault();
            }}
          >
            Управление ключами
          </a>
        </div>
      </section>
    </div>
  );
}
