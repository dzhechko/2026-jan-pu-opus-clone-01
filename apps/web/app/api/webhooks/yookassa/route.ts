import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@clipmaker/db';
import { PLAN_CONFIG } from '@clipmaker/types';
import type { PlanId } from '@clipmaker/types';
import { isYookassaIp, formatRubles } from '@/lib/yookassa';

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
// POST /api/webhooks/yookassa
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // 1. Verify source IP
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (!isYookassaIp(clientIp)) {
    console.warn('Webhook IP rejected:', clientIp);
    return new NextResponse('Forbidden', { status: 403 });
  }

  // 2. Parse and validate body
  const raw = await request.json();
  const parsed = WebhookSchema.safeParse(raw);
  if (!parsed.success) {
    // Don't trigger ЮKassa retries for malformed payloads
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

  // 4. Idempotency check
  if (existingPayment.status === 'succeeded' && event === 'payment.succeeded') {
    return new NextResponse('OK', { status: 200 });
  }

  // 5. Amount validation (security)
  if (event === 'payment.succeeded') {
    const webhookAmount = Math.round(parseFloat(paymentData.amount.value) * 100);
    if (webhookAmount !== existingPayment.amount) {
      console.error('Amount mismatch', {
        paymentId: existingPayment.id,
        expected: existingPayment.amount,
        got: webhookAmount,
      });
      return new NextResponse('OK', { status: 200 });
    }
  }

  // 6. Handle event
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
    // Still return 200 to prevent infinite retries
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

    if (payment.type === 'subscription' && payment.planId) {
      const planId = payment.planId as PlanId;
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
}

async function handlePaymentCancelled(payment: PaymentRecord) {
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'cancelled' },
  });
}

async function handleRefund(payment: PaymentRecord) {
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'refunded' },
  });
}
