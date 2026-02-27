import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@clipmaker/db';
import { PLAN_CONFIG, PLAN_DISPLAY_NAMES } from '@clipmaker/types';
import type { PlanId } from '@clipmaker/types';
import { isYookassaIp, formatRubles } from '@/lib/yookassa';
import { sendEmail, paymentSucceededEmail } from '@/lib/auth/email';

// ---------------------------------------------------------------------------
// Webhook Payload Schema (Zod)
// ---------------------------------------------------------------------------

const WebhookSchema = z.object({
  event: z.enum([
    'payment.succeeded',
    'payment.canceled',
    'payment.waiting_for_capture',
    'refund.succeeded',
  ]),
  object: z.object({
    id: z.string(),
    amount: z.object({ value: z.string(), currency: z.string() }),
    payment_method: z
      .object({ id: z.string(), type: z.string().optional() })
      .optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse rubles string to kopecks without floating-point arithmetic. */
function parseRublesToKopecks(value: string): number {
  const [rubles, kopecks = '00'] = value.split('.');
  return parseInt(rubles!, 10) * 100 + parseInt(kopecks.padEnd(2, '0').slice(0, 2), 10);
}

/** Add 30 days (avoids JS setMonth overflow for months like Jan 31). */
function addOneMonth(date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + 30);
  return result;
}

function isValidPlanId(value: string | null): value is PlanId {
  return value !== null && value in PLAN_CONFIG;
}

// ---------------------------------------------------------------------------
// POST /api/webhooks/yookassa
// ---------------------------------------------------------------------------

const MAX_BODY_SIZE = 65536;

export async function POST(request: NextRequest) {
  // 1. Verify source IP (prefer x-real-ip set by nginx, fallback to x-forwarded-for)
  const clientIp =
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (!isYookassaIp(clientIp)) {
    console.warn('Webhook IP rejected:', clientIp);
    return new NextResponse('Forbidden', { status: 403 });
  }

  // 2. Parse and validate body (with size limit)
  const rawText = await request.text();
  if (rawText.length > MAX_BODY_SIZE) {
    return new NextResponse('Payload too large', { status: 413 });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch {
    return new NextResponse('OK', { status: 200 });
  }

  const parsed = WebhookSchema.safeParse(raw);
  if (!parsed.success) {
    return new NextResponse('OK', { status: 200 });
  }

  const { event, object: paymentData } = parsed.data;

  // 3. Look up local payment record
  const existingPayment = await prisma.payment.findUnique({
    where: { externalId: paymentData.id },
  });
  if (!existingPayment) {
    // Not our payment — ignore
    return new NextResponse('OK', { status: 200 });
  }

  // 4. Idempotency: reject events on terminal-state payments
  const terminalStatuses = ['succeeded', 'cancelled', 'refunded'];
  if (terminalStatuses.includes(existingPayment.status)) {
    return new NextResponse('OK', { status: 200 });
  }

  // 5. Amount + currency validation (security)
  if (event === 'payment.succeeded') {
    const webhookAmount = parseRublesToKopecks(paymentData.amount.value);
    if (webhookAmount !== existingPayment.amount) {
      console.error('Amount mismatch', {
        paymentId: existingPayment.id,
        expected: existingPayment.amount,
        got: webhookAmount,
      });
      return new NextResponse('OK', { status: 200 });
    }
    if (paymentData.amount.currency !== 'RUB') {
      console.error('Currency mismatch', {
        paymentId: existingPayment.id,
        currency: paymentData.amount.currency,
      });
      return new NextResponse('OK', { status: 200 });
    }
  }

  // 6. Handle event — return 500 for transient errors so ЮKassa retries
  try {
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
  } catch (err) {
    console.error('Webhook processing error:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  return new NextResponse('OK', { status: 200 });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

type PaymentRecord = {
  id: string;
  userId: string;
  type: string;
  planId: string | null;
  amount: number;
  paymentMethod: string;
  metadata: unknown;
};

type PaymentObject = z.infer<typeof WebhookSchema>['object'];

async function handlePaymentSucceeded(
  payment: PaymentRecord,
  yooData: PaymentObject,
) {
  const now = new Date();
  const periodEnd = addOneMonth(now);

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

    if (payment.type === 'subscription' && isValidPlanId(payment.planId)) {
      const planId = payment.planId;
      const planConfig = PLAN_CONFIG[planId];

      // Upsert subscription
      await tx.subscription.upsert({
        where: { userId: payment.userId },
        create: {
          userId: payment.userId,
          planId,
          status: 'active',
          paymentProvider: 'yookassa',
          paymentMethod: payment.paymentMethod as 'card' | 'sbp',
          externalSubscriptionId: yooData.payment_method?.id ?? null,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          statusChangedAt: now,
        },
        update: {
          planId,
          status: 'active',
          paymentMethod: payment.paymentMethod as 'card' | 'sbp',
          externalSubscriptionId: yooData.payment_method?.id ?? null,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          statusChangedAt: now,
        },
      });

      // Update user plan and reset minutes
      await tx.user.update({
        where: { id: payment.userId },
        data: {
          planId,
          minutesLimit: planConfig.minutesLimit,
          minutesUsed: 0,
          billingPeriodStart: now,
        },
      });
    } else if (payment.type === 'extra_minutes') {
      const meta = payment.metadata as { minutes?: number } | null;
      const minutes = meta?.minutes ?? 0;
      if (minutes > 0) {
        await tx.user.update({
          where: { id: payment.userId },
          data: { minutesLimit: { increment: minutes } },
        });
      }
    }
  });

  // Send payment confirmation email (fire-and-forget, outside transaction)
  try {
    const user = await prisma.user.findUnique({
      where: { id: payment.userId },
      select: { email: true },
    });
    if (user?.email && payment.type === 'subscription' && isValidPlanId(payment.planId)) {
      const planName = PLAN_DISPLAY_NAMES[payment.planId];
      const amountRubles = Math.round(payment.amount / 100);
      await sendEmail(paymentSucceededEmail(user.email, planName, amountRubles));
    }
  } catch {
    // Non-critical: don't fail the webhook for email errors
  }
}

async function handlePaymentCancelled(payment: PaymentRecord) {
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'cancelled' },
  });
}

async function handleRefund(payment: PaymentRecord) {
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'refunded' },
    });

    if (payment.type === 'subscription' && isValidPlanId(payment.planId)) {
      // Downgrade user to free and expire subscription
      await tx.subscription.updateMany({
        where: { userId: payment.userId, status: 'active' },
        data: { status: 'expired', statusChangedAt: new Date() },
      });
      await tx.user.update({
        where: { id: payment.userId },
        data: {
          planId: 'free',
          minutesLimit: PLAN_CONFIG.free.minutesLimit,
          minutesUsed: 0,
        },
      });
    } else if (payment.type === 'extra_minutes') {
      const meta = payment.metadata as { minutes?: number } | null;
      const minutes = meta?.minutes ?? 0;
      if (minutes > 0) {
        await tx.user.update({
          where: { id: payment.userId },
          data: { minutesLimit: { decrement: minutes } },
        });
      }
    }
  });
}
