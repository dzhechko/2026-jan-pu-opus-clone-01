import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { DashboardNav } from '@/components/layout/dashboard-nav';

type DashboardUser = {
  id: string;
  email: string;
  planId: string;
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const headerStore = await headers();
  const userId = headerStore.get('x-user-id');
  const email = headerStore.get('x-user-email');
  const planId = headerStore.get('x-user-plan');

  if (!userId) {
    redirect('/login');
  }

  const user: DashboardUser = {
    id: userId,
    email: email ?? '',
    planId: planId ?? 'free',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav user={user} />
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
