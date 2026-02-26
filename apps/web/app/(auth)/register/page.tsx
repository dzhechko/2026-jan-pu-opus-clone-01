'use client';

import { signIn } from 'next-auth/react';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { registerSchema } from '@/lib/auth/schemas';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

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
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Регистрация завершена
        </h2>
        <p className="text-muted-foreground text-sm mb-6">
          Теперь вы можете войти с email{' '}
          <span className="font-medium text-foreground">{email}</span>.
        </p>
        <Button asChild variant="outline">
          <Link href="/login">Перейти на страницу входа</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-foreground text-center mb-6">
        Создать аккаунт
      </h2>

      {serverError && (
        <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm border border-destructive/20">
          {serverError}
        </div>
      )}

      <Button
        type="button"
        onClick={handleVkRegister}
        className="w-full bg-[#0077FF] hover:bg-[#0066DD] text-white"
      >
        <VkIcon className="w-5 h-5 mr-2" />
        Зарегистрироваться через VK
      </Button>

      <div className="relative my-6">
        <Separator />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="bg-card px-4 text-sm text-muted-foreground">или</span>
        </div>
      </div>

      <form onSubmit={validateAndSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1">
            Имя
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Ваше имя"
            className={`w-full px-3 py-2 border rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring outline-none transition-colors ${
              fieldErrors.name ? 'border-destructive' : 'border-input'
            }`}
          />
          {fieldErrors.name && (
            <p className="mt-1 text-sm text-destructive">{fieldErrors.name}</p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            className={`w-full px-3 py-2 border rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring outline-none transition-colors ${
              fieldErrors.email ? 'border-destructive' : 'border-input'
            }`}
          />
          {fieldErrors.email && (
            <p className="mt-1 text-sm text-destructive">{fieldErrors.email}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">
            Пароль
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="Минимум 8 символов"
            className={`w-full px-3 py-2 border rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring outline-none transition-colors ${
              fieldErrors.password ? 'border-destructive' : 'border-input'
            }`}
          />
          {fieldErrors.password && (
            <p className="mt-1 text-sm text-destructive">{fieldErrors.password}</p>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground mb-1">
            Подтвердите пароль
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="Повторите пароль"
            className={`w-full px-3 py-2 border rounded-md bg-background text-foreground focus:ring-2 focus:ring-ring outline-none transition-colors ${
              fieldErrors.confirmPassword ? 'border-destructive' : 'border-input'
            }`}
          />
          {fieldErrors.confirmPassword && (
            <p className="mt-1 text-sm text-destructive">{fieldErrors.confirmPassword}</p>
          )}
        </div>

        <Button type="submit" disabled={registerMutation.isPending} className="w-full">
          {registerMutation.isPending ? 'Регистрация...' : 'Зарегистрироваться'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Уже есть аккаунт?{' '}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Войти
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="text-center text-muted-foreground">Загрузка...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
