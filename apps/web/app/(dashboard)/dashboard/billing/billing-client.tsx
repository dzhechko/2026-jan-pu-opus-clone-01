'use client';

import { useState, useCallback } from 'react';
import { trpc } from '@/lib/trpc/client';
import { PLAN_CONFIG, PLAN_DISPLAY_NAMES, EXTRA_MINUTES_PRICE_KOPECKS } from '@clipmaker/types';
import type { PlanId } from '@clipmaker/types';

type BillingClientProps = {
  initialPlan: string;
};

const PLAN_ORDER: PlanId[] = ['free', 'start', 'pro', 'business'];

function formatPrice(kopecks: number): string {
  if (kopecks === 0) return '0₽';
  return `${(kopecks / 100).toLocaleString('ru-RU')}₽`;
}

function formatDate(date: Date | string | null): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

// ---------------------------------------------------------------------------
// Plan Comparison Table
// ---------------------------------------------------------------------------

function PlanComparisonTable({
  currentPlan,
  onUpgrade,
  isLoading,
}: {
  currentPlan: string;
  onUpgrade: (planId: PlanId) => void;
  isLoading: boolean;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {PLAN_ORDER.map((planId) => {
        const plan = PLAN_CONFIG[planId];
        const isCurrent = planId === currentPlan;
        const isUpgrade = PLAN_ORDER.indexOf(planId) > PLAN_ORDER.indexOf(currentPlan as PlanId);

        return (
          <div
            key={planId}
            className={`rounded-xl border p-6 ${isCurrent ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'}`}
          >
            <h3 className="text-lg font-semibold mb-1">{PLAN_DISPLAY_NAMES[planId]}</h3>
            <div className="text-2xl font-bold mb-4">
              {plan.price === 0 ? 'Бесплатно' : `${formatPrice(plan.price)}/мес`}
            </div>

            <ul className="space-y-2 text-sm text-gray-600 mb-6">
              <li>{plan.minutesLimit >= 99999 ? '∞' : plan.minutesLimit} мин/мес</li>
              <li>До {plan.maxClips} клипов/видео</li>
              <li>{plan.watermark ? 'С водяным знаком' : 'Без водяного знака'}</li>
              <li>Хранение: {plan.storageDays} дн.</li>
            </ul>

            {isCurrent ? (
              <div className="w-full py-2 text-center text-sm font-medium text-blue-600 bg-blue-50 rounded">
                Текущий план
              </div>
            ) : isUpgrade ? (
              <button
                onClick={() => onUpgrade(planId)}
                disabled={isLoading}
                className="w-full py-2 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Перейти на {PLAN_DISPLAY_NAMES[planId]}
              </button>
            ) : (
              <div className="w-full py-2 text-center text-sm text-gray-400">—</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subscription Card
// ---------------------------------------------------------------------------

function SubscriptionCard({
  plan,
  status,
  paymentMethod,
  currentPeriodEnd,
  cancelAtPeriodEnd,
  onCancel,
  onReactivate,
  isCancelling,
}: {
  plan: string;
  status: string;
  paymentMethod: string | null;
  currentPeriodEnd: Date | string | null;
  cancelAtPeriodEnd: boolean;
  onCancel: () => void;
  onReactivate: () => void;
  isCancelling: boolean;
}) {
  if (plan === 'free') return null;

  const methodLabel = paymentMethod === 'sbp' ? 'СБП' : 'Карта';

  return (
    <section className="rounded-xl border bg-white p-6 mt-6">
      <h2 className="text-lg font-semibold mb-4">Текущая подписка</h2>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Тариф</span>
          <span className="font-medium">{PLAN_DISPLAY_NAMES[plan as PlanId] ?? plan}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Статус</span>
          <span className={status === 'past_due' ? 'text-red-600 font-medium' : 'font-medium'}>
            {status === 'active' ? 'Активна' : status === 'past_due' ? 'Проблема с оплатой' : status}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Способ оплаты</span>
          <span>{methodLabel}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Следующее списание</span>
          <span>{cancelAtPeriodEnd ? '—' : formatDate(currentPeriodEnd)}</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t">
        {cancelAtPeriodEnd ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Активна до {formatDate(currentPeriodEnd)}
            </span>
            <button
              onClick={onReactivate}
              disabled={isCancelling}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
            >
              Возобновить подписку
            </button>
          </div>
        ) : (
          <button
            onClick={onCancel}
            disabled={isCancelling}
            className="text-sm text-red-500 hover:text-red-600 disabled:opacity-50"
          >
            Отменить подписку
          </button>
        )}
      </div>

      {status === 'past_due' && (
        <div className="mt-3 p-3 bg-red-50 rounded text-sm text-red-600" role="alert">
          Оплата не прошла. Обновите способ оплаты или продлите подписку вручную.
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Checkout Modal
// ---------------------------------------------------------------------------

function CheckoutModal({
  planId,
  onClose,
}: {
  planId: PlanId;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<'card' | 'sbp'>('card');
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);

  const checkoutMutation = trpc.billing.checkout.useMutation();

  const statusQuery = trpc.billing.checkPaymentStatus.useQuery(
    { paymentId: paymentId! },
    {
      enabled: !!paymentId,
      refetchInterval: 3000,
    },
  );

  // Close modal when SBP payment succeeds
  if (statusQuery.data?.status === 'succeeded') {
    window.location.reload();
  }

  const handleCheckout = useCallback(async () => {
    const result = await checkoutMutation.mutateAsync({
      planId: planId as 'start' | 'pro' | 'business',
      paymentMethod: method,
      returnUrl: `${window.location.origin}/dashboard/billing?status=success`,
    });

    if (result.type === 'redirect') {
      window.location.href = result.confirmationUrl;
    } else {
      setQrUrl(result.qrUrl);
      setPaymentId(result.paymentId);
    }
  }, [planId, method, checkoutMutation]);

  const plan = PLAN_CONFIG[planId];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" aria-modal="true">
      <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            Оплата: {PLAN_DISPLAY_NAMES[planId]}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
            &times;
          </button>
        </div>

        <div className="text-2xl font-bold mb-4">{formatPrice(plan.price)}/мес</div>

        {!qrUrl ? (
          <>
            <div className="space-y-3 mb-6">
              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="method"
                  value="card"
                  checked={method === 'card'}
                  onChange={() => setMethod('card')}
                />
                <div>
                  <p className="font-medium">Банковская карта</p>
                  <p className="text-xs text-gray-500">Visa, Mastercard, МИР</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="method"
                  value="sbp"
                  checked={method === 'sbp'}
                  onChange={() => setMethod('sbp')}
                />
                <div>
                  <p className="font-medium">СБП</p>
                  <p className="text-xs text-gray-500">Оплата по QR-коду</p>
                </div>
              </label>
            </div>

            {checkoutMutation.error && (
              <div className="mb-4 p-2 bg-red-50 rounded text-sm text-red-600" role="alert">
                {checkoutMutation.error.message}
              </div>
            )}

            <button
              onClick={handleCheckout}
              disabled={checkoutMutation.isPending}
              className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {checkoutMutation.isPending ? 'Создаём платёж...' : `Оплатить ${formatPrice(plan.price)}`}
            </button>
          </>
        ) : (
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-4">
              Отсканируйте QR-код в приложении банка
            </p>
            <div className="bg-gray-100 rounded-lg p-4 mb-4">
              <img src={qrUrl} alt="QR-код для оплаты через СБП" className="mx-auto max-w-48" />
            </div>
            {statusQuery.isFetching && (
              <p className="text-sm text-gray-500">Ожидаем подтверждение...</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Extra Minutes Card
// ---------------------------------------------------------------------------

function ExtraMinutesCard({
  minutesUsed,
  minutesLimit,
}: {
  minutesUsed: number;
  minutesLimit: number;
}) {
  const remaining = minutesLimit - minutesUsed;
  if (remaining > 10) return null;

  const pricePerMin = EXTRA_MINUTES_PRICE_KOPECKS / 100;

  return (
    <section className="rounded-xl border bg-amber-50 border-amber-200 p-6 mt-6">
      <h2 className="text-lg font-semibold text-amber-800 mb-2">Минуты заканчиваются</h2>
      <p className="text-sm text-amber-700 mb-3">
        Осталось {remaining} мин. Докупите минуты по {pricePerMin}₽/мин.
      </p>
      <div className="flex gap-2">
        {([30, 60, 120] as const).map((mins) => (
          <a
            key={mins}
            href={`/dashboard/billing?buy=${mins}`}
            className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
          >
            {mins} мин — {formatPrice(mins * EXTRA_MINUTES_PRICE_KOPECKS)}
          </a>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main Client Component
// ---------------------------------------------------------------------------

export function BillingClient({ initialPlan }: BillingClientProps) {
  const [checkoutPlan, setCheckoutPlan] = useState<PlanId | null>(null);

  const subscriptionQuery = trpc.billing.subscription.useQuery();
  const cancelMutation = trpc.billing.cancel.useMutation({
    onSuccess: () => subscriptionQuery.refetch(),
  });
  const reactivateMutation = trpc.billing.reactivate.useMutation({
    onSuccess: () => subscriptionQuery.refetch(),
  });

  const sub = subscriptionQuery.data;
  const currentPlan = sub?.plan ?? initialPlan;

  const handleCancel = useCallback(() => {
    const confirmed = window.confirm(
      `Ваш план будет активен до ${formatDate(sub?.currentPeriodEnd ?? null)}. Подтвердить отмену?`,
    );
    if (confirmed) {
      cancelMutation.mutate();
    }
  }, [sub?.currentPeriodEnd, cancelMutation]);

  const handleReactivate = useCallback(() => {
    reactivateMutation.mutate();
  }, [reactivateMutation]);

  return (
    <>
      <PlanComparisonTable
        currentPlan={currentPlan}
        onUpgrade={(planId) => setCheckoutPlan(planId)}
        isLoading={false}
      />

      {sub && (
        <SubscriptionCard
          plan={currentPlan}
          status={sub.status}
          paymentMethod={sub.paymentMethod}
          currentPeriodEnd={sub.currentPeriodEnd}
          cancelAtPeriodEnd={sub.cancelAtPeriodEnd}
          onCancel={handleCancel}
          onReactivate={handleReactivate}
          isCancelling={cancelMutation.isPending || reactivateMutation.isPending}
        />
      )}

      {sub && (
        <ExtraMinutesCard
          minutesUsed={sub.minutesUsed}
          minutesLimit={sub.minutesLimit}
        />
      )}

      {cancelMutation.error && (
        <div className="mt-4 p-3 bg-red-50 rounded text-sm text-red-600" role="alert">
          {cancelMutation.error.message}
        </div>
      )}

      {checkoutPlan && (
        <CheckoutModal
          planId={checkoutPlan}
          onClose={() => setCheckoutPlan(null)}
        />
      )}
    </>
  );
}
