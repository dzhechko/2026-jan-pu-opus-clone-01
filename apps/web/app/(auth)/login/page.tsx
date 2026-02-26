'use client';

import { signIn } from 'next-auth/react';
import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { loginSchema } from '@/lib/auth/schemas';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

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

function LoginForm() {
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

    const parsed = loginSchema.safeParse({ email, password, rememberMe });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Некорректные данные');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'RATE_LIMIT') {
          setError('Слишком много попыток. Подождите минуту.');
        } else if (data.error === 'EMAIL_NOT_VERIFIED') {
          setError('Подтвердите email. Проверьте почту.');
        } else {
          setError('Неверный email или пароль');
        }
      } else {
        window.location.href = '/dashboard';
      }
    } catch {
      setError('Ошибка сети. Попробуйте снова.');
    }

    setLoading(false);
  }

  function handleVkLogin() {
    signIn('vk', { callbackUrl: '/api/auth/session-bridge?callbackUrl=/dashboard' });
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-foreground text-center mb-6">
        Вход в аккаунт
      </h2>

      {successMessage && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm border border-destructive/20">
          {error}
        </div>
      )}

      <Button
        type="button"
        onClick={handleVkLogin}
        className="w-full bg-[#0077FF] hover:bg-[#0066DD] text-white"
      >
        <VkIcon className="w-5 h-5 mr-2" />
        Войти через VK
      </Button>

      <div className="relative my-6">
        <Separator />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="bg-card px-4 text-sm text-muted-foreground">или</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">
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
            className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-ring outline-none transition-colors"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="password" className="block text-sm font-medium text-foreground">
              Пароль
            </label>
            <Link href="/reset-password" className="text-sm text-primary hover:underline">
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
            className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-ring outline-none transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="rememberMe"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
          />
          <label htmlFor="rememberMe" className="text-sm text-muted-foreground select-none">
            Запомнить меня
          </label>
        </div>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Вход...' : 'Войти'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Нет аккаунта?{' '}
        <Link href="/register" className="text-primary font-medium hover:underline">
          Зарегистрироваться
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-center text-muted-foreground">Загрузка...</div>}>
      <LoginForm />
    </Suspense>
  );
}
