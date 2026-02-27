import type { PlanId } from '@clipmaker/types';
import { PLAN_DISPLAY_NAMES } from '@clipmaker/types';

// ---------------------------------------------------------------------------
// ЮKassa Configuration
// ---------------------------------------------------------------------------

const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID ?? '';
const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY ?? '';
const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3';

const isConfigured = Boolean(YOOKASSA_SHOP_ID && YOOKASSA_SECRET_KEY);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert kopecks (integer) to rubles string: 99000 → "990.00". */
export function formatRubles(kopecks: number): string {
  return (kopecks / 100).toFixed(2);
}

function authHeader(): string {
  return (
    'Basic ' +
    Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`).toString(
      'base64',
    )
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type YookassaPaymentResponse = {
  id: string;
  status: string;
  paid: boolean;
  amount: { value: string; currency: string };
  payment_method?: {
    id: string;
    type: string;
    saved: boolean;
  };
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AutoRenewalParams = {
  paymentMethodId: string;
  amount: number; // kopecks
  userId: string;
  planId: PlanId;
  email: string;
};

// ---------------------------------------------------------------------------
// Receipt Builder (54-ФЗ)
// ---------------------------------------------------------------------------

function buildReceipt(email: string, planId: PlanId, amountKopecks: number) {
  return {
    customer: { email },
    items: [
      {
        description: `Подписка КлипМейкер ${PLAN_DISPLAY_NAMES[planId]} (1 мес)`,
        quantity: '1.00',
        amount: { value: formatRubles(amountKopecks), currency: 'RUB' },
        vat_code: 1,
        payment_subject: 'service',
        payment_mode: 'full_payment',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Auto-Renewal Payment
// ---------------------------------------------------------------------------

/**
 * Create a recurring payment using a saved payment method.
 * Used by the subscription-renewal worker to charge users automatically.
 *
 * Idempotence key: `renewal-{userId}-{planId}-{YYYY-MM-DD}` ensures at most
 * one charge per user per plan per day.
 */
export async function createAutoRenewalPayment(
  params: AutoRenewalParams,
): Promise<YookassaPaymentResponse> {
  if (!isConfigured) {
    throw new Error('ЮKassa credentials not configured');
  }

  const { paymentMethodId, amount, userId, planId, email } = params;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const idempotenceKey = `renewal-${userId}-${planId}-${today}`;

  const planName = PLAN_DISPLAY_NAMES[planId];

  const body = {
    payment_method_id: paymentMethodId,
    capture: true,
    amount: {
      value: formatRubles(amount),
      currency: 'RUB',
    },
    description: `Автопродление подписки КлипМейкер ${planName} (1 мес)`,
    metadata: {
      userId,
      planId,
      type: 'subscription',
    },
    receipt: buildReceipt(email, planId, amount),
  };

  const response = await fetch(`${YOOKASSA_API_URL}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
      'Idempotence-Key': idempotenceKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ЮKassa API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<YookassaPaymentResponse>;
}
