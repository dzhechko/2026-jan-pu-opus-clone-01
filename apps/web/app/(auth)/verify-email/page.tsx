'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

type VerifyState = 'loading' | 'success' | 'error' | 'no-token';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<VerifyState>(token ? 'loading' : 'no-token');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('no-token');
      return;
    }

    async function verifyEmail() {
      try {
        const response = await fetch(
          `/api/auth/verify-email?token=${encodeURIComponent(token!)}`,
        );

        if (response.ok) {
          setState('success');
        } else {
          const data = await response.json().catch(() => null);
          setErrorMessage(
            data?.message ?? 'Ссылка устарела или недействительна',
          );
          setState('error');
        }
      } catch {
        setErrorMessage('Ошибка соединения. Попробуйте позже.');
        setState('error');
      }
    }

    verifyEmail();
  }, [token]);

  if (state === 'loading') {
    return (
      <div className="text-center py-4">
        <div className="mx-auto w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Подтверждение email...
        </h2>
        <p className="text-gray-500 text-sm">Подождите, идет проверка.</p>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="text-center">
        <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <svg
            className="w-6 h-6 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Email подтвержден
        </h2>
        <p className="text-gray-600 text-sm mb-6">
          Ваш email успешно подтвержден. Теперь вы можете войти в аккаунт.
        </p>
        <Link
          href="/login?verified=true"
          className="inline-block px-6 py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 transition-colors"
        >
          Войти
        </Link>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="text-center">
        <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
          <svg
            className="w-6 h-6 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Ошибка подтверждения
        </h2>
        <p className="text-gray-600 text-sm mb-6">{errorMessage}</p>
        <Link
          href="/login"
          className="text-brand-600 font-medium hover:text-brand-700 hover:underline text-sm"
        >
          Перейти на страницу входа
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="mx-auto w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
        <svg
          className="w-6 h-6 text-yellow-600"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        Отсутствует токен
      </h2>
      <p className="text-gray-600 text-sm mb-6">
        Ссылка для подтверждения некорректна. Проверьте письмо и попробуйте
        снова.
      </p>
      <Link
        href="/login"
        className="text-brand-600 font-medium hover:text-brand-700 hover:underline text-sm"
      >
        Перейти на страницу входа
      </Link>
    </div>
  );
}
