import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { BillingClient } from './billing-client';

export default async function BillingPage() {
  const headersList = await headers();
  const userId = headersList.get('x-user-id');

  if (!userId) {
    redirect('/login');
  }

  const userPlan = headersList.get('x-user-plan') ?? 'free';

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Тарифы и подписка</h1>
      <BillingClient initialPlan={userPlan} />
    </div>
  );
}
