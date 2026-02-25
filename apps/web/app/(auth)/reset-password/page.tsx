'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';

const emailSchema = z.object({
  email: z.string().min(1, 'Введите email').email('Некорректный email'),
});

const newPasswordSchema = z
  .object({
    password: z.string().min(8, 'Минимум 8 символов').max(128, 'Пароль слишком длинный'),
    confirmPassword: z.string().min(1, 'Подтвердите пароль'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  });

function RequestResetForm() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError('');
    setServerError('');

    const result = emailSchema.safeParse({ email });
    if (!result.success) {
      setEmailError(result.error.issues[0]?.message ?? 'Ошибка валидации');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setSent(true);
      } else {
        const data = await response.json().catch(() => null);
        setServerError(data?.message ?? 'Произошла ошибка. Попробуйте позже.');
      }
    } catch {
      setServerError('Ошибка соединения. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
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
              d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Ссылка отправлена
        </h2>
        <p className="text-gray-600 text-sm mb-6">
          Если аккаунт с таким email существует, мы отправили ссылку для сброса пароля
          на <span className="font-medium text-gray-900">{email}</span>.
        </p>
        <Link
          href="/login"
          className="text-brand-600 font-medium hover:text-brand-700 hover:underline text-sm"
        >
          Вернуться к входу
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 text-center mb-2">
        Сброс пароля
      </h2>
      <p className="text-gray-500 text-sm text-center mb-6">
        Введите email, связанный с вашим аккаунтом. Мы отправим ссылку для сброса
        пароля.
      </p>

      {serverError && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-200">
          {serverError}
        </div>
      )}

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
            autoComplete="email"
            placeholder="you@example.com"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-colors ${
              emailError ? 'border-red-400' : 'border-gray-300'
            }`}
          />
          {emailError && (
            <p className="mt-1 text-sm text-red-500">{emailError}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Отправка...' : 'Отправить ссылку'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Вспомнили пароль?{' '}
        <Link
          href="/login"
          className="text-brand-600 font-medium hover:text-brand-700 hover:underline"
        >
          Войти
        </Link>
      </p>
    </div>
  );
}

function SetNewPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<'password' | 'confirmPassword', string>>
  >({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setServerError('');

    const result = newPasswordSchema.safeParse({ password, confirmPassword });
    if (!result.success) {
      const errors: Partial<Record<'password' | 'confirmPassword', string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as 'password' | 'confirmPassword';
        if (!errors[field]) {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/new-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      if (response.ok) {
        setSuccess(true);
      } else {
        const data = await response.json().catch(() => null);
        if (data?.code === 'TOKEN_EXPIRED') {
          setServerError('Ссылка устарела. Запросите новую.');
        } else {
          setServerError(data?.message ?? 'Произошла ошибка. Попробуйте позже.');
        }
      }
    } catch {
      setServerError('Ошибка соединения. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
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
          Пароль изменен
        </h2>
        <p className="text-gray-600 text-sm mb-6">
          Ваш пароль успешно обновлен. Теперь вы можете войти с новым паролем.
        </p>
        <Link
          href="/login?reset=success"
          className="inline-block px-6 py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 transition-colors"
        >
          Войти
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 text-center mb-2">
        Новый пароль
      </h2>
      <p className="text-gray-500 text-sm text-center mb-6">
        Придумайте новый пароль для вашего аккаунта.
      </p>

      {serverError && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-200">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Новый пароль
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="Минимум 8 символов"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-colors ${
              fieldErrors.password ? 'border-red-400' : 'border-gray-300'
            }`}
          />
          {fieldErrors.password && (
            <p className="mt-1 text-sm text-red-500">{fieldErrors.password}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Подтвердите пароль
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="Повторите пароль"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-colors ${
              fieldErrors.confirmPassword ? 'border-red-400' : 'border-gray-300'
            }`}
          />
          {fieldErrors.confirmPassword && (
            <p className="mt-1 text-sm text-red-500">
              {fieldErrors.confirmPassword}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Сохранение...' : 'Сохранить пароль'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        <Link
          href="/reset-password"
          className="text-brand-600 font-medium hover:text-brand-700 hover:underline"
        >
          Запросить новую ссылку
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  if (token) {
    return <SetNewPasswordForm token={token} />;
  }

  return <RequestResetForm />;
}
