# Billing — Pseudocode

## Data Structures

### Payment Model (new — add to Prisma schema)

```prisma
model Payment {
  id                String        @id @default(uuid()) @db.Uuid
  userId            String        @map("user_id") @db.Uuid
  externalId        String        @unique @map("external_id")  // ЮKassa payment ID
  idempotenceKey    String        @unique @map("idempotence_key")
  type              PaymentType   @default(subscription)
  planId            PlanId?       @map("plan_id")
  amount            Int           // kopecks (99000 = 990₽)
  currency          String        @default("RUB")
  status            PaymentStatus @default(pending)
  paymentMethod     PaymentMethod @map("payment_method")
  paymentMethodId   String?       @map("payment_method_id")  // saved method for recurring
  description       String
  metadata          Json?
  createdAt         DateTime      @default(now()) @map("created_at")
  updatedAt         DateTime      @updatedAt @map("updated_at")
  confirmedAt       DateTime?     @map("confirmed_at")

  user              User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("payments")
}

enum PaymentType {
  subscription
  extra_minutes
}

enum PaymentStatus {
  pending
  succeeded
  cancelled
  refunded
}
```

### Plan Config (constants)

```typescript
// packages/types/src/billing.ts
export const PLAN_CONFIG = {
  free:     { price: 0,     minutesLimit: 30,    maxClips: 3,   watermark: true,  storageDays: 3  },
  start:    { price: 99000, minutesLimit: 120,   maxClips: 10,  watermark: false, storageDays: 30 },
  pro:      { price: 299000, minutesLimit: 1000, maxClips: 100, watermark: false, storageDays: 90 },
  business: { price: 999000, minutesLimit: 99999, maxClips: 100, watermark: false, storageDays: 90 },
} as const satisfies Record<string, PlanDefinition>;

export type PlanDefinition = {
  price: number;       // kopecks
  minutesLimit: number;
  maxClips: number;
  watermark: boolean;
  storageDays: number;
};

export const EXTRA_MINUTES_PRICE_KOPECKS = 1500; // 15₽/min
```

## Core Algorithms

### 1. billing.checkout Mutation

```typescript
// Input
type CheckoutInput = {
  planId: 'start' | 'pro' | 'business';
  paymentMethod: 'card' | 'sbp';
  returnUrl: string;
};

// Algorithm
async function checkout(userId: string, input: CheckoutInput) {
  // 1. Validate: user not already on target plan
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.planId === input.planId) {
    throw TRPCError('BAD_REQUEST', 'Вы уже на этом тарифе');
  }

  // 2. Get plan price
  const plan = PLAN_CONFIG[input.planId];
  if (!plan || plan.price === 0) {
    throw TRPCError('BAD_REQUEST', 'Недопустимый тариф');
  }

  // 3. Generate idempotence key
  const idempotenceKey = `sub-${userId}-${input.planId}-${Date.now()}`;

  // 4. Create ЮKassa payment
  const confirmation = input.paymentMethod === 'sbp'
    ? { type: 'qr' }
    : { type: 'redirect', return_url: input.returnUrl };

  const yooPayment = await yookassa.createPayment({
    amount: { value: formatRubles(plan.price), currency: 'RUB' },
    confirmation,
    capture: true,
    save_payment_method: true,
    description: `КлипМейкер: тариф ${input.planId} (1 мес)`,
    metadata: { userId, planId: input.planId, type: 'subscription' },
    receipt: buildReceipt(user.email, input.planId, plan.price),
  }, idempotenceKey);

  // 5. Create local Payment record (pending)
  await prisma.payment.create({
    data: {
      userId,
      externalId: yooPayment.id,
      idempotenceKey,
      type: 'subscription',
      planId: input.planId,
      amount: plan.price,
      status: 'pending',
      paymentMethod: input.paymentMethod,
      description: yooPayment.description,
    },
  });

  // 6. Return confirmation data
  if (input.paymentMethod === 'sbp') {
    return {
      type: 'qr' as const,
      qrUrl: yooPayment.confirmation.confirmation_url,
      paymentId: yooPayment.id,
    };
  }
  return {
    type: 'redirect' as const,
    confirmationUrl: yooPayment.confirmation.confirmation_url,
    paymentId: yooPayment.id,
  };
}
```

### 2. billing.buyMinutes Mutation

```typescript
// Input
type BuyMinutesInput = {
  minutes: 30 | 60 | 120;
  paymentMethod: 'card' | 'sbp';
  returnUrl: string;
};

// Algorithm
async function buyMinutes(userId: string, input: BuyMinutesInput) {
  const amount = input.minutes * EXTRA_MINUTES_PRICE_KOPECKS;
  const idempotenceKey = `extra-${userId}-${input.minutes}-${Date.now()}`;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const confirmation = input.paymentMethod === 'sbp'
    ? { type: 'qr' }
    : { type: 'redirect', return_url: input.returnUrl };

  const yooPayment = await yookassa.createPayment({
    amount: { value: formatRubles(amount), currency: 'RUB' },
    confirmation,
    capture: true,
    description: `КлипМейкер: ${input.minutes} доп. минут`,
    metadata: { userId, minutes: input.minutes, type: 'extra_minutes' },
    receipt: buildExtraMinutesReceipt(user.email, input.minutes, amount),
  }, idempotenceKey);

  await prisma.payment.create({
    data: {
      userId,
      externalId: yooPayment.id,
      idempotenceKey,
      type: 'extra_minutes',
      amount,
      status: 'pending',
      paymentMethod: input.paymentMethod,
      description: yooPayment.description,
      metadata: { minutes: input.minutes },
    },
  });

  if (input.paymentMethod === 'sbp') {
    return { type: 'qr' as const, qrUrl: yooPayment.confirmation.confirmation_url, paymentId: yooPayment.id };
  }
  return { type: 'redirect' as const, confirmationUrl: yooPayment.confirmation.confirmation_url, paymentId: yooPayment.id };
}
```

### 3. Webhook Handler — /api/webhooks/yookassa

```typescript
// POST /api/webhooks/yookassa
async function handleWebhook(request: NextRequest) {
  // 1. Verify source IP
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (!isYookassaIp(clientIp)) {
    return NextResponse(403);
  }

  // 2. Parse body
  const body = await request.json();
  const event = body.event;  // 'payment.succeeded' | 'payment.canceled' | 'refund.succeeded'
  const paymentData = body.object;

  // 3. Idempotency: check if already processed
  const existingPayment = await prisma.payment.findUnique({
    where: { externalId: paymentData.id },
  });
  if (!existingPayment) {
    // Payment not found — might be from different system, ignore
    return NextResponse(200);
  }
  if (existingPayment.status === 'succeeded' && event === 'payment.succeeded') {
    // Already processed — idempotent response
    return NextResponse(200);
  }

  // 4. Handle event
  switch (event) {
    case 'payment.succeeded':
      await handlePaymentSucceeded(existingPayment, paymentData);
      break;
    case 'payment.canceled':
      await handlePaymentCancelled(existingPayment);
      break;
    case 'refund.succeeded':
      await handleRefund(existingPayment);
      break;
  }

  return NextResponse(200);
}

async function handlePaymentSucceeded(payment: Payment, yooData: YooPaymentObject) {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await prisma.$transaction(async (tx) => {
    // Update payment status
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'succeeded',
        confirmedAt: now,
        paymentMethodId: yooData.payment_method?.id ?? null,
      },
    });

    if (payment.type === 'subscription') {
      // Upsert subscription
      await tx.subscription.upsert({
        where: { userId: payment.userId },
        create: {
          userId: payment.userId,
          planId: payment.planId!,
          status: 'active',
          paymentProvider: 'yookassa',
          paymentMethod: payment.paymentMethod,
          externalSubscriptionId: yooData.payment_method?.id ?? null,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        },
        update: {
          planId: payment.planId!,
          status: 'active',
          paymentMethod: payment.paymentMethod,
          externalSubscriptionId: yooData.payment_method?.id ?? null,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        },
      });

      // Update user plan
      const planConfig = PLAN_CONFIG[payment.planId!];
      await tx.user.update({
        where: { id: payment.userId },
        data: {
          planId: payment.planId!,
          minutesLimit: planConfig.minutesLimit,
          minutesUsed: 0,
          billingPeriodStart: now,
        },
      });
    } else if (payment.type === 'extra_minutes') {
      // Add extra minutes
      const minutes = (payment.metadata as { minutes: number }).minutes;
      await tx.user.update({
        where: { id: payment.userId },
        data: {
          minutesLimit: { increment: minutes },
        },
      });
    }
  });
}

async function handlePaymentCancelled(payment: Payment) {
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'cancelled' },
  });
}

async function handleRefund(payment: Payment) {
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'refunded' },
  });
  // Note: admin-initiated refunds only. Plan stays active until period end.
}
```

### 4. ЮKassa IP Validation

```typescript
// Known ЮKassa webhook IP ranges
const YOOKASSA_IP_RANGES = [
  '185.71.76.0/27',
  '185.71.77.0/27',
  '77.75.153.0/25',
  '77.75.156.11',
  '77.75.156.35',
];

function isYookassaIp(ip: string | undefined): boolean {
  if (!ip) return false;
  return YOOKASSA_IP_RANGES.some((range) => ipInRange(ip, range));
}

// ipInRange: checks if IP is in CIDR range
function ipInRange(ip: string, cidr: string): boolean {
  if (!cidr.includes('/')) return ip === cidr;
  const [rangeIp, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits)) - 1);
  const ipNum = ipToInt(ip);
  const rangeNum = ipToInt(rangeIp);
  return (ipNum & mask) === (rangeNum & mask);
}

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
}
```

### 5. billing.checkPaymentStatus Query (for СБП polling)

```typescript
async function checkPaymentStatus(userId: string, paymentId: string) {
  const payment = await prisma.payment.findFirst({
    where: { externalId: paymentId, userId },
    select: { status: true },
  });
  if (!payment) throw TRPCError('NOT_FOUND');
  return { status: payment.status };
}
```

### 6. Billing Period Reset Cron Job

```typescript
// BullMQ repeatable job: runs daily at 03:00 UTC
async function billingPeriodReset() {
  const now = new Date();

  // 1. Find subscriptions with expired periods
  const expiredSubs = await prisma.subscription.findMany({
    where: {
      currentPeriodEnd: { lte: now },
      status: { in: ['active', 'past_due'] },
    },
    include: { user: true },
  });

  for (const sub of expiredSubs) {
    if (sub.cancelAtPeriodEnd || sub.status === 'past_due') {
      // Downgrade to free
      await prisma.$transaction([
        prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'expired' },
        }),
        prisma.user.update({
          where: { id: sub.userId },
          data: {
            planId: 'free',
            minutesLimit: PLAN_CONFIG.free.minutesLimit,
            minutesUsed: 0,
            billingPeriodStart: now,
          },
        }),
      ]);
    } else {
      // Auto-renew: create payment using saved method
      const savedMethodId = sub.externalSubscriptionId;
      if (!savedMethodId) {
        // No saved method (СБП) — mark past_due, send email
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'past_due' },
        });
        // TODO: Send renewal reminder email
        continue;
      }

      try {
        const plan = PLAN_CONFIG[sub.planId];
        const idempotenceKey = `renew-${sub.userId}-${sub.planId}-${now.toISOString().slice(0, 10)}`;

        const yooPayment = await yookassa.createPayment({
          amount: { value: formatRubles(plan.price), currency: 'RUB' },
          payment_method_id: savedMethodId,
          capture: true,
          description: `Авто-продление: КлипМейкер ${sub.planId}`,
          metadata: { userId: sub.userId, planId: sub.planId, type: 'subscription' },
          receipt: buildReceipt(sub.user.email, sub.planId, plan.price),
        }, idempotenceKey);

        await prisma.payment.create({
          data: {
            userId: sub.userId,
            externalId: yooPayment.id,
            idempotenceKey,
            type: 'subscription',
            planId: sub.planId,
            amount: plan.price,
            status: 'pending',
            paymentMethod: sub.paymentMethod,
            description: yooPayment.description,
          },
        });
        // Webhook will handle activation
      } catch (err) {
        console.error(`Auto-renewal failed for user ${sub.userId}:`, err);
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'past_due' },
        });
      }
    }
  }
}
```

### 7. ЮKassa Client (server-side)

```typescript
// apps/web/lib/yookassa.ts
import { YooCheckout } from '@yookassa/sdk';

const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID;
const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY;

if (!YOOKASSA_SHOP_ID || !YOOKASSA_SECRET_KEY) {
  console.warn('ЮKassa credentials not configured — billing disabled');
}

export const yookassa = new YooCheckout({
  shopId: YOOKASSA_SHOP_ID ?? '',
  secretKey: YOOKASSA_SECRET_KEY ?? '',
});

export function formatRubles(kopecks: number): string {
  return (kopecks / 100).toFixed(2);
}

export function buildReceipt(email: string, planId: string, amountKopecks: number) {
  return {
    customer: { email },
    items: [{
      description: `Подписка КлипМейкер ${planId} (1 мес)`,
      quantity: '1.00',
      amount: { value: formatRubles(amountKopecks), currency: 'RUB' },
      vat_code: 1,
      payment_subject: 'service',
      payment_mode: 'full_payment',
    }],
  };
}

export function buildExtraMinutesReceipt(email: string, minutes: number, amountKopecks: number) {
  return {
    customer: { email },
    items: [{
      description: `КлипМейкер: ${minutes} доп. минут обработки`,
      quantity: '1.00',
      amount: { value: formatRubles(amountKopecks), currency: 'RUB' },
      vat_code: 1,
      payment_subject: 'service',
      payment_mode: 'full_payment',
    }],
  };
}
```

### 8. Billing Page UI Hooks

```typescript
// useCheckout hook
function useCheckout() {
  const checkoutMutation = trpc.billing.checkout.useMutation();
  const [checkoutState, setCheckoutState] = useState<'idle' | 'loading' | 'qr' | 'error'>('idle');
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);

  async function startCheckout(planId: PlanId, paymentMethod: PaymentMethod) {
    setCheckoutState('loading');
    try {
      const result = await checkoutMutation.mutateAsync({
        planId,
        paymentMethod,
        returnUrl: `${window.location.origin}/dashboard/billing?status=success`,
      });

      if (result.type === 'redirect') {
        window.location.href = result.confirmationUrl;
      } else {
        setQrUrl(result.qrUrl);
        setPaymentId(result.paymentId);
        setCheckoutState('qr');
      }
    } catch (err) {
      setCheckoutState('error');
    }
  }

  return { startCheckout, checkoutState, qrUrl, paymentId };
}

// useSbpPolling hook (polls payment status for QR flow)
function useSbpPolling(paymentId: string | null) {
  const statusQuery = trpc.billing.checkPaymentStatus.useQuery(
    { paymentId: paymentId! },
    {
      enabled: !!paymentId,
      refetchInterval: 3000,       // Poll every 3s
      refetchIntervalInBackground: false,
    },
  );

  // Stop polling after 5 min
  useEffect(() => {
    if (!paymentId) return;
    const timeout = setTimeout(() => {
      statusQuery.remove();
    }, 5 * 60 * 1000);
    return () => clearTimeout(timeout);
  }, [paymentId]);

  return {
    status: statusQuery.data?.status ?? 'pending',
    isPolling: statusQuery.isFetching,
  };
}
```

## API Contracts

### billing.checkout
- **Input**: `{ planId: 'start' | 'pro' | 'business', paymentMethod: 'card' | 'sbp', returnUrl: string }`
- **Output**: `{ type: 'redirect', confirmationUrl: string, paymentId: string }` | `{ type: 'qr', qrUrl: string, paymentId: string }`
- **Errors**: `BAD_REQUEST` (same plan), `FORBIDDEN` (rate limit)

### billing.buyMinutes
- **Input**: `{ minutes: 30 | 60 | 120, paymentMethod: 'card' | 'sbp', returnUrl: string }`
- **Output**: same as checkout
- **Errors**: `BAD_REQUEST` (invalid minutes)

### billing.checkPaymentStatus
- **Input**: `{ paymentId: string }`
- **Output**: `{ status: 'pending' | 'succeeded' | 'cancelled' }`
- **Errors**: `NOT_FOUND`

### billing.cancel
- **Input**: none
- **Output**: `{ cancelAtPeriodEnd: true, activeUntil: Date }`
- **Errors**: `NOT_FOUND` (no subscription)

### billing.reactivate
- **Input**: none
- **Output**: `{ cancelAtPeriodEnd: false }`
- **Errors**: `NOT_FOUND`, `BAD_REQUEST` (already expired)

### POST /api/webhooks/yookassa
- **Input**: ЮKassa webhook payload (JSON)
- **Output**: 200 OK (always, to prevent ЮKassa retries on errors)
- **Auth**: IP allowlist (no JWT)

## State Transitions

```
Payment: pending → succeeded → refunded
Payment: pending → cancelled

Subscription: (none) → active → cancelled → expired
Subscription: active → past_due → active (on retry success)
Subscription: active → past_due → expired (on retry failure + grace period)
Subscription: cancelled → active (on reactivate before period end)

User.planId: free → start/pro/business (on payment.succeeded)
User.planId: start/pro/business → free (on subscription expired)
```
