'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';

const PLATFORMS = [
  {
    id: 'vk' as const,
    name: 'VK Клипы',
    description: 'Публикация в VK Clips',
    icon: '🎬',
    authType: 'oauth' as const,
  },
  {
    id: 'rutube' as const,
    name: 'Rutube',
    description: 'Публикация на Rutube',
    icon: '📺',
    authType: 'token' as const,
    tokenLabel: 'API Token',
    tokenHelp: 'Получите токен в настройках Rutube Studio',
  },
  {
    id: 'dzen' as const,
    name: 'Дзен',
    description: 'Публикация в Яндекс Дзен',
    icon: '📰',
    authType: 'oauth' as const,
  },
  {
    id: 'telegram' as const,
    name: 'Telegram',
    description: 'Публикация через Telegram бота',
    icon: '✈️',
    authType: 'token' as const,
    tokenLabel: 'Bot Token',
    tokenHelp: 'Создайте бота через @BotFather и получите токен',
  },
] as const;

type Platform = (typeof PLATFORMS)[number];

export default function PlatformsPage() {
  const { data: connections, refetch } = trpc.platform.list.useQuery();
  const connectMutation = trpc.platform.connect.useMutation();
  const disconnectMutation = trpc.platform.disconnect.useMutation();
  const testMutation = trpc.platform.testConnection.useMutation();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Платформы</h1>
      <p className="text-gray-600 mb-6">
        Подключите платформы для автоматической публикации клипов.
      </p>

      <div className="space-y-4">
        {PLATFORMS.map((platform) => {
          const connection = connections?.find((c) => c.platform === platform.id);
          return (
            <PlatformCard
              key={platform.id}
              platform={platform}
              connected={!!connection}
              metadata={connection?.metadata as Record<string, string> | undefined}
              onConnect={async (token?: string, channelId?: string) => {
                const result = await connectMutation.mutateAsync({
                  platform: platform.id,
                  ...(token ? { token } : {}),
                  ...(channelId ? { channelId } : {}),
                });
                if ('redirectUrl' in result && result.redirectUrl) {
                  window.location.href = result.redirectUrl as string;
                } else {
                  refetch();
                }
              }}
              onDisconnect={async () => {
                await disconnectMutation.mutateAsync({ platform: platform.id });
                refetch();
              }}
              onTest={async () => {
                const result = await testMutation.mutateAsync({ platform: platform.id });
                return result;
              }}
              isConnecting={connectMutation.isPending}
              isDisconnecting={disconnectMutation.isPending}
            />
          );
        })}
      </div>
    </div>
  );
}

type PlatformCardProps = {
  platform: Platform;
  connected: boolean;
  metadata?: Record<string, string>;
  onConnect: (token?: string, channelId?: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onTest: () => Promise<{ valid: boolean; accountName?: string }>;
  isConnecting: boolean;
  isDisconnecting: boolean;
};

function PlatformCard({
  platform,
  connected,
  metadata,
  onConnect,
  onDisconnect,
  onTest,
  isConnecting,
  isDisconnecting,
}: PlatformCardProps) {
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [token, setToken] = useState('');
  const [channelId, setChannelId] = useState('');
  const [testResult, setTestResult] = useState<{ valid: boolean; accountName?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setError(null);
    try {
      if (platform.authType === 'token') {
        if (!token.trim()) return;
        await onConnect(token.trim(), channelId.trim() || undefined);
        setToken('');
        setChannelId('');
        setShowTokenForm(false);
      } else {
        await onConnect();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка подключения');
    }
  };

  const handleTest = async () => {
    setError(null);
    try {
      const result = await onTest();
      setTestResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка проверки');
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm(`Отключить ${platform.name}? Запланированные публикации будут отменены.`)) return;
    setError(null);
    setTestResult(null);
    try {
      await onDisconnect();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отключения');
    }
  };

  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{platform.icon}</span>
          <div>
            <h3 className="font-semibold">{platform.name}</h3>
            <p className="text-sm text-gray-500">{platform.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                Подключено
              </span>
              <button
                type="button"
                onClick={handleTest}
                className="text-xs px-2 py-1 border rounded hover:bg-gray-50 transition-colors"
              >
                Проверить
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                Отключить
              </button>
            </>
          ) : (
            <>
              {platform.authType === 'token' ? (
                <button
                  type="button"
                  onClick={() => setShowTokenForm(!showTokenForm)}
                  className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Подключить
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isConnecting ? 'Подключение...' : 'Подключить'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {metadata?.accountName && (
        <p className="mt-2 text-xs text-gray-400">Аккаунт: {metadata.accountName}</p>
      )}

      {testResult && (
        <p className={`mt-2 text-xs ${testResult.valid ? 'text-green-600' : 'text-red-500'}`}>
          {testResult.valid
            ? `Подключение активно${testResult.accountName ? ` (${testResult.accountName})` : ''}`
            : 'Токен недействителен. Переподключите платформу.'}
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {showTokenForm && !connected && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {'tokenLabel' in platform ? platform.tokenLabel : 'Token'}
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Вставьте токен..."
              className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            {'tokenHelp' in platform && (
              <p className="text-xs text-gray-400 mt-1">{platform.tokenHelp}</p>
            )}
          </div>
          {platform.id === 'telegram' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Channel ID (опционально)
              </label>
              <input
                type="text"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                placeholder="@channel или -100..."
                className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConnect}
              disabled={!token.trim() || isConnecting}
              className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isConnecting ? 'Подключение...' : 'Подключить'}
            </button>
            <button
              type="button"
              onClick={() => { setShowTokenForm(false); setToken(''); setChannelId(''); }}
              className="text-sm px-3 py-1.5 border rounded hover:bg-gray-50 transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
