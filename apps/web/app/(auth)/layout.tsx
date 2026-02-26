import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            <span className="text-primary">Клип</span>Мейкер
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            AI-шортсы из вебинаров за 5 минут
          </p>
        </div>
        <Card className="p-8">
          {children}
        </Card>
      </div>
    </div>
  );
}
