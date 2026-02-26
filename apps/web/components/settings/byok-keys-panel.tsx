'use client';

import { useState, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  isVaultAvailable,
  isVaultUnlocked,
  unlockVault,
  lockVault,
  storeKey,
  deleteKey,
  getAllKeysMeta,
  onVaultLock,
} from '@/lib/crypto/byok-vault';
import type { ByokProvider } from '@clipmaker/types';
import { BYOK_PROVIDERS } from '@clipmaker/types';

type KeyMeta = {
  provider: ByokProvider;
  keyPreview: string;
  createdAt: number;
};

type ProviderCardProps = {
  provider: ByokProvider;
  info: (typeof BYOK_PROVIDERS)[ByokProvider];
  keyMeta: KeyMeta | null;
  vaultUnlocked: boolean;
  onAdd: (provider: ByokProvider, key: string) => Promise<void>;
  onRemove: (provider: ByokProvider) => Promise<void>;
};

function ProviderCard({
  provider,
  info,
  keyMeta,
  vaultUnlocked,
  onAdd,
  onRemove,
}: ProviderCardProps) {
  const [keyInput, setKeyInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const testMutation = trpc.user.testByokKey.useMutation();

  const handleAdd = useCallback(async () => {
    if (!keyInput.trim()) return;
    setError(null);
    setSuccess(false);
    setTesting(true);

    try {
      const result = await testMutation.mutateAsync({
        provider,
        apiKey: keyInput.trim(),
      });

      if (!result.valid) {
        setError(result.error || 'Key validation failed');
        setTesting(false);
        return;
      }

      await onAdd(provider, keyInput.trim());
      setSuccess(true);
      setKeyInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setTesting(false);
    }
  }, [keyInput, provider, onAdd, testMutation]);

  const handleRemove = useCallback(async () => {
    if (!window.confirm(`Удалить ключ ${info.name}?`)) return;
    setSuccess(false);
    setError(null);
    await onRemove(provider);
  }, [provider, info.name, onRemove]);

  const isConnected = !!keyMeta;

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{info.name}</h3>
          <p className="text-sm text-gray-500">{info.description}</p>
        </div>
        <span
          className={`text-xs font-medium px-2 py-1 rounded-full ${
            isConnected
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {isConnected ? 'Подключен' : 'Не подключен'}
        </span>
      </div>

      {isConnected && keyMeta ? (
        <div className="flex items-center justify-between bg-gray-50 rounded p-3">
          <div>
            <p className="text-sm font-mono">{keyMeta.keyPreview}</p>
            <p className="text-xs text-gray-400">
              Добавлен {new Date(keyMeta.createdAt).toLocaleDateString('ru-RU')}
            </p>
          </div>
          <button
            onClick={handleRemove}
            disabled={!vaultUnlocked}
            className="text-sm text-red-600 hover:text-red-800 disabled:text-gray-400"
          >
            Удалить
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="password"
              placeholder={`${info.keyPrefix}...`}
              value={keyInput}
              onChange={(e) => {
                setKeyInput(e.target.value);
                setError(null);
                setSuccess(false);
              }}
              disabled={!vaultUnlocked || testing}
              className="flex-1 border rounded px-3 py-2 text-sm font-mono disabled:bg-gray-50"
            />
            <button
              onClick={handleAdd}
              disabled={!vaultUnlocked || !keyInput.trim() || testing}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-300 whitespace-nowrap"
            >
              {testing ? 'Проверка...' : 'Проверить'}
            </button>
          </div>
          <a
            href={info.helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            Где взять ключ?
          </a>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
      {success && (
        <p className="text-sm text-green-600">Ключ {info.name} подключен</p>
      )}
    </div>
  );
}

export default function ByokKeysPanel() {
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [keysMeta, setKeysMeta] = useState<KeyMeta[]>([]);
  const [available, setAvailable] = useState(true);

  // Check vault availability on mount
  useEffect(() => {
    setAvailable(isVaultAvailable());
    setVaultUnlocked(isVaultUnlocked());
    if (isVaultUnlocked()) {
      loadKeysMeta();
    }
  }, []);

  // Listen for vault lock events
  useEffect(() => {
    onVaultLock(() => {
      setVaultUnlocked(false);
    });
  }, []);

  const loadKeysMeta = useCallback(async () => {
    try {
      const meta = await getAllKeysMeta();
      setKeysMeta(meta);
    } catch {
      // IndexedDB might be unavailable
    }
  }, []);

  const handleUnlock = useCallback(async () => {
    if (!password) return;
    setPasswordError(null);
    setUnlocking(true);

    try {
      await unlockVault(password);
      setVaultUnlocked(true);
      setPassword('');
      await loadKeysMeta();
    } catch {
      setPasswordError('Неверный пароль или ошибка хранилища');
    } finally {
      setUnlocking(false);
    }
  }, [password, loadKeysMeta]);

  const handleLock = useCallback(() => {
    lockVault();
    setVaultUnlocked(false);
  }, []);

  const handleAddKey = useCallback(
    async (provider: ByokProvider, apiKey: string) => {
      await storeKey(provider, apiKey);
      await loadKeysMeta();
    },
    [loadKeysMeta],
  );

  const handleRemoveKey = useCallback(
    async (provider: ByokProvider) => {
      await deleteKey(provider);
      await loadKeysMeta();
    },
    [loadKeysMeta],
  );

  if (!available) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          Хранилище ключей недоступно в этом браузере. Убедитесь, что используете HTTPS и современный браузер.
        </p>
      </div>
    );
  }

  const providers = Object.values(BYOK_PROVIDERS);

  return (
    <div className="space-y-6">
      {/* Vault Lock/Unlock */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">API Ключи</h2>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                vaultUnlocked ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-sm text-gray-600">
              {vaultUnlocked ? 'Хранилище открыто' : 'Хранилище заблокировано'}
            </span>
            {vaultUnlocked && (
              <button
                onClick={handleLock}
                className="ml-2 text-sm text-gray-500 hover:text-gray-700 border rounded px-2 py-1"
              >
                Заблокировать
              </button>
            )}
          </div>
        </div>

        {!vaultUnlocked ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Введите пароль для доступа к сохраненным API ключам.
              Ключи зашифрованы AES-256 и хранятся только в вашем браузере.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="Пароль хранилища"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUnlock();
                }}
                disabled={unlocking}
                className="flex-1 border rounded px-3 py-2 text-sm"
              />
              <button
                onClick={handleUnlock}
                disabled={!password || unlocking}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-300"
              >
                {unlocking ? 'Открытие...' : 'Открыть'}
              </button>
            </div>
            {passwordError && (
              <p className="text-sm text-red-600">{passwordError}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Хранилище автоматически заблокируется через 30 минут бездействия.
          </p>
        )}
      </div>

      {/* Provider Cards */}
      <div className="space-y-4">
        {providers.map((info) => {
          const meta = keysMeta.find((k) => k.provider === info.id) || null;
          return (
            <ProviderCard
              key={info.id}
              provider={info.id}
              info={info}
              keyMeta={meta}
              vaultUnlocked={vaultUnlocked}
              onAdd={handleAddKey}
              onRemove={handleRemoveKey}
            />
          );
        })}
      </div>

      {/* Info note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          Ваши API ключи зашифрованы в браузере (AES-GCM 256-bit) и никогда не сохраняются на сервере.
          При обработке видео ключи передаются серверу через защищенное HTTPS-соединение,
          используются для одного запроса и сразу удаляются.
        </p>
      </div>
    </div>
  );
}
