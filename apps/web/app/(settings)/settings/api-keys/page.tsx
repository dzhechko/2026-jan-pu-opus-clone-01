'use client';

import { trpc } from '@/lib/trpc/client';
import ByokKeysPanel from '@/components/settings/byok-keys-panel';

export default function ApiKeysPage() {
  const { data: user } = trpc.user.me.useQuery();

  const isGlobalStrategy = user?.llmProviderPreference === 'global';

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">API Ключи</h1>
      <p className="text-gray-600 mb-6">
        Используйте собственные API ключи для обработки видео через Global AI провайдеров.
      </p>

      {!isGlobalStrategy ? (
        <div className="bg-gray-50 border rounded-xl p-6">
          <h2 className="font-semibold mb-2">Global стратегия не активна</h2>
          <p className="text-sm text-gray-600 mb-4">
            API ключи доступны только при использовании Global AI стратегии (Gemini, Claude, OpenAI).
            Сейчас у вас выбрана Cloud.ru (Россия) -- все ключи предоставляются платформой.
          </p>
          <a
            href="/settings"
            className="text-sm text-blue-600 hover:underline"
          >
            Переключить на Global в настройках AI-провайдера
          </a>
        </div>
      ) : (
        <ByokKeysPanel />
      )}
    </div>
  );
}
