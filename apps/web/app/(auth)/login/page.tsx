'use client';

import { signIn } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function VkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12.785 16.241s.288-.032.436-.194c.136-.148.132-.427.132-.427s-.02-1.304.587-1.496c.598-.189 1.366 1.26 2.18 1.816.616.42 1.084.328 1.084.328l2.178-.03s1.14-.07.6-.964c-.044-.073-.316-.661-1.624-1.868-1.37-1.264-1.186-1.06.464-3.246.995-1.314 1.394-2.116 1.27-2.46-.118-.328-.85-.242-.85-.242l-2.45.016s-.182-.025-.316.056c-.132.079-.216.264-.216.264s-.39 1.038-.91 1.92c-1.098 1.862-1.538 1.96-1.718 1.844-.418-.272-.314-1.092-.314-1.674 0-1.82.276-2.58-.536-2.778-.27-.066-.468-.11-1.156-.116-.882-.01-1.63.002-2.052.21-.282.138-.498.446-.366.464.164.022.534.1.73.366.254.344.244 1.116.244 1.116s.146 2.14-.34 2.404c-.334.182-.79-.19-1.772-1.892-.502-.872-.882-1.836-.882-1.836s-.072-.18-.202-.276c-.158-.116-.378-.154-.378-.154l-2.328.016s-.35.01-.478.162c-.114.134-.01.414-.01.414s1.838 4.3 3.92 6.468c1.908 1.99 4.074 1.858 4.074 1.858h.982z" />
    </svg>
  );
}

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (searchParams.get('verified') === 'true') {
      setSuccessMessage('Email подтвержден! Теперь вы можете войти.');
    } else if (searchParams.get('reset') === 'success') {
      setSuccessMessage('Пароль успешно изменен. Войдите с новым паролем.');
    }

    const urlError = searchParams.get('error');
    if (urlError === 'vk_cancelled') {
      setError('Авторизация через VK была отменена');
    } else if (urlError === 'vk_unavailable') {
      setError('Сервис авторизации VK временно недоступен');
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMessage('');

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      if (result.error === 'RATE_LIMIT') {
        setError('Слишком много попыток. Подождите минуту.');
      } else if (result.error === 'EMAIL_NOT_VERIFIED') {
        setError('Подтвердите email. Проверьте почту.');
      } else {
        setError('Неверный email или пароль');
      }
    } else if (result?.ok) {
      window.location.href = '/dashboard';
    }

    setLoading(false);
  }

  function handleVkLogin() {
    signIn('vk', { callbackUrl: '/dashboard' });
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 text-center mb-6">
        Вход в аккаунт
      </h2>

      {successMessage && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-200">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleVkLogin}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium text-white transition-colors"
        style={{ backgroundColor: '#0077FF' }}
        onMouseEnter={(e) => {
          (e.target as HTMLButtonElement).style.backgroundColor = '#0066DD';
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLButtonElement).style.backgroundColor = '#0077FF';
        }}
      >
        <VkIcon className="w-5 h-5" />
        Войти через VK
      </button>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-gray-400">или</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-colors"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              Пароль
            </label>
            <Link
              href="/reset-password"
              className="text-sm text-brand-600 hover:text-brand-700 hover:underline"
            >
              Забыли пароль?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="rememberMe"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <label
            htmlFor="rememberMe"
            className="text-sm text-gray-600 select-none"
          >
            Запомнить меня
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Вход...' : 'Войти'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Нет аккаунта?{' '}
        <Link
          href="/register"
          className="text-brand-600 font-medium hover:text-brand-700 hover:underline"
        >
          Зарегистрироваться
        </Link>
      </p>
    </div>
  );
}
