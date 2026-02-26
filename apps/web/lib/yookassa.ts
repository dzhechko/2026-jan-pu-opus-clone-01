import type { PlanId } from '@clipmaker/types';
import { PLAN_CONFIG } from '@clipmaker/types';

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
  return 'Basic ' + Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`).toString('base64');
}

// ---------------------------------------------------------------------------
// Payment Creation
// ---------------------------------------------------------------------------

export type YookassaConfirmation =
  | { type: 'redirect'; return_url: string }
  | { type: 'qr' };

export type YookassaPaymentResponse = {
  id: string;
  status: string;
  confirmation?: {
    type: string;
    confirmation_url?: string;
    confirmation_data?: string;
  };
  payment_method?: {
    id: string;
    type: string;
  };
  description: string;
};

type CreatePaymentParams = {
  amount: { value: string; currency: string };
  confirmation?: YookassaConfirmation;
  payment_method_id?: string;
  capture: boolean;
  save_payment_method?: boolean;
  description: string;
  metadata: Record<string, unknown>;
  receipt: ReturnType<typeof buildReceipt>;
};

export async function createPayment(
  params: CreatePaymentParams,
  idempotenceKey: string,
): Promise<YookassaPaymentResponse> {
  if (!isConfigured) {
    throw new Error('ЮKassa credentials not configured');
  }

  const response = await fetch(`${YOOKASSA_API_URL}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader(),
      'Idempotence-Key': idempotenceKey,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ЮKassa API error ${response.status}: ${body}`);
  }

  return response.json() as Promise<YookassaPaymentResponse>;
}

// ---------------------------------------------------------------------------
// Receipt Builders (54-ФЗ)
// ---------------------------------------------------------------------------

export function buildReceipt(email: string, planId: PlanId, amountKopecks: number) {
  const planNames: Record<PlanId, string> = {
    free: 'Free',
    start: 'Start',
    pro: 'Pro',
    business: 'Business',
  };

  return {
    customer: { email },
    items: [
      {
        description: `Подписка КлипМейкер ${planNames[planId]} (1 мес)`,
        quantity: '1.00',
        amount: { value: formatRubles(amountKopecks), currency: 'RUB' },
        vat_code: 1,
        payment_subject: 'service',
        payment_mode: 'full_payment',
      },
    ],
  };
}

export function buildExtraMinutesReceipt(
  email: string,
  minutes: number,
  amountKopecks: number,
) {
  return {
    customer: { email },
    items: [
      {
        description: `КлипМейкер: ${minutes} доп. минут обработки`,
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
// IP Validation
// ---------------------------------------------------------------------------

const YOOKASSA_IP_RANGES = [
  '185.71.76.0/27',
  '185.71.77.0/27',
  '77.75.153.0/25',
  '77.75.156.11',
  '77.75.156.35',
];

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => ((acc << 8) >>> 0) + parseInt(octet, 10), 0);
}

function ipInRange(ip: string, cidr: string): boolean {
  if (!cidr.includes('/')) return ip === cidr;
  const [rangeIp, bits] = cidr.split('/');
  const mask = ~((1 << (32 - parseInt(bits!, 10))) - 1) >>> 0;
  const ipNum = ipToInt(ip);
  const rangeNum = ipToInt(rangeIp!);
  return (ipNum & mask) === (rangeNum & mask);
}

export function isYookassaIp(ip: string | undefined | null): boolean {
  if (!ip) return false;
  return YOOKASSA_IP_RANGES.some((range) => ipInRange(ip, range));
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export { PLAN_CONFIG, EXTRA_MINUTES_PRICE_KOPECKS } from '@clipmaker/types';
