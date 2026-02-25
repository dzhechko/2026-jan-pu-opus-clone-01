'use client';

import { signIn } from 'next-auth/react';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { registerSchema } from '@/lib/auth/schemas';
import { trpc } from '@/lib/trpc/client';

type RegisterFormData = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};
type FieldErrors = Partial<Record<keyof RegisterFormData, string>>;

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

function RegisterForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState('');
  const [registered, setRegistered] = useState(false);

  const registerMutation = trpc.user.register.useMutation({
    onSuccess: () => {
      setRegistered(true);
    },
    onError: (err) => {
      // Don't expose raw tRPC errors — show generic message
      if (err.data?.code === 'TOO_MANY_REQUESTS') {
        setServerError('Слишком много попыток. Подождите и попробуйте снова.');
      } else {
        setServerError('Произошла ошибка. Попробуйте снова.');
      }
    },
  });

  function validateAndSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setServerError('');

    // Reuse shared schema from lib/auth/schemas
    const result = registerSchema.safeParse({
      name,
      email,
      password,
      confirmPassword,
    });

    if (!result.success) {
      const errors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof RegisterFormData;
        if (!errors[field]) {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    registerMutation.mutate({
      name: result.data.name,
      email: result.data.email,
      password: result.data.password,
      confirmPassword: result.data.confirmPassword,
    });
  }

  function handleVkRegister() {
    signIn('vk', { callbackUrl: '/api/auth/session-bridge?callbackUrl=/dashboard' });
  }

  if (registered) {
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
          Проверьте почту
        </h2>
        <p className="text-gray-600 text-sm mb-6">
          Мы отправили письмо для подтверждения на{' '}
          <span className="font-medium text-gray-900">{email}</span>.
          Перейдите по ссылке в письме, чтобы активировать аккаунт.
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

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 text-center mb-6">
        Создать аккаунт
      </h2>

      {serverError && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-200">
          {serverError}
        </div>
      )}

      <button
        type="button"
        onClick={handleVkRegister}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium text-white transition-colors bg-[#0077FF] hover:bg-[#0066DD]"
      >
        <VkIcon className="w-5 h-5" />
        Зарегистрироваться через VK
      </button>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-gray-400">или</span>
        </div>
      </div>

      <form onSubmit={validateAndSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Имя
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Ваше имя"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-colors ${
              fieldErrors.name ? 'border-red-400' : 'border-gray-300'
            }`}
          />
          {fieldErrors.name && (
            <p className="mt-1 text-sm text-red-500">{fieldErrors.name}</p>
          )}
        </div>

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
              fieldErrors.email ? 'border-red-400' : 'border-gray-300'
            }`}
          />
          {fieldErrors.email && (
            <p className="mt-1 text-sm text-red-500">{fieldErrors.email}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Пароль
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
          disabled={registerMutation.isPending}
          className="w-full py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {registerMutation.isPending
            ? 'Регистрация...'
            : 'Зарегистрироваться'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Уже есть аккаунт?{' '}
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

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="text-center text-gray-400">Загрузка...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
