import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-blue-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            <span className="text-brand-600">Клип</span>Мейкер
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            AI-шортсы из вебинаров за 5 минут
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
