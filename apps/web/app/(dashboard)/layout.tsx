import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { jwtVerify } from 'jose';
import { DashboardNav } from '@/components/layout/dashboard-nav';

type DashboardUser = {
  id: string;
  email: string;
  planId: string;
};

const JWT_SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token')?.value;

  if (!accessToken) {
    redirect('/login');
  }

  let user: DashboardUser;
  try {
    const { payload } = await jwtVerify(accessToken, JWT_SECRET);
    user = {
      id: payload.sub as string,
      email: payload.email as string,
      planId: payload.planId as string,
    };
  } catch {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav user={user} />
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
