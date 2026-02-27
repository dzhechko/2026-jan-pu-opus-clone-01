import { Worker, type Job } from 'bullmq';
import { prisma } from '@clipmaker/db';
import { PLAN_CONFIG, PLAN_DISPLAY_NAMES } from '@clipmaker/types';
import type { PlanId } from '@clipmaker/types';
import { getRedisConnection } from '@clipmaker/queue/src/queues';
import { QUEUE_NAMES } from '@clipmaker/queue/src/constants';
import { createLogger } from '../lib/logger';
import { createAutoRenewalPayment } from '../lib/yookassa';
import {
  sendEmail,
  subscriptionRenewalReminderEmail,
  subscriptionExpiredEmail,
  subscriptionDowngradedEmail,
  paymentFailedEmail,
} from '../lib/email';

const logger = createLogger('billing-cron');

const GRACE_PERIOD_DAYS = 7;
const BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// Worker Registration
// ---------------------------------------------------------------------------

const connection = getRedisConnection();

const worker = new Worker(
  QUEUE_NAMES.BILLING_CRON!,
  async (job: Job) => {
    logger.info({ event: 'billing_cron_start', jobId: job.id });
    await billingPeriodReset();
    logger.info({ event: 'billing_cron_complete', jobId: job.id });
  },
  { connection, concurrency: 1 },
);

worker.on('failed', (job, err) => {
  logger.error({ event: 'billing_cron_failed', jobId: job?.id, error: err.message });
});

// ---------------------------------------------------------------------------
// Core Logic
// ---------------------------------------------------------------------------

async function billingPeriodReset() {
  const now = new Date();
  let cursor: string | undefined;
  let processed = 0;

  while (true) {
    const expiredSubs = await prisma.subscription.findMany({
      where: {
        currentPeriodEnd: { lte: now },
        status: { in: ['active', 'past_due'] },
      },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    });

    if (expiredSubs.length === 0) break;
    cursor = expiredSubs[expiredSubs.length - 1]!.id;

    for (const sub of expiredSubs) {
      try {
        await processExpiredSubscription(sub, now);
        processed++;
      } catch (err) {
        logger.error({
          event: 'subscription_process_failed',
          subscriptionId: sub.id,
          userId: sub.userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  logger.info({ event: 'billing_cron_summary', processed });
}

type SubscriptionRecord = Awaited<
  ReturnType<typeof prisma.subscription.findMany>
>[number];

async function processExpiredSubscription(
  sub: SubscriptionRecord,
  now: Date,
) {
  const user = await prisma.user.findUnique({
    where: { id: sub.userId },
    select: { email: true, planId: true },
  });
  const email = user?.email ?? '';
  const planId = (sub.planId ?? user?.planId ?? 'free') as PlanId;
  const planName = PLAN_DISPLAY_NAMES[planId] ?? planId;

  // Case 1: User cancelled — downgrade to free
  if (sub.cancelAtPeriodEnd) {
    await downgradeToFree(sub, now);
    logger.info({ event: 'subscription_expired_cancelled', userId: sub.userId });
    if (email) {
      await sendEmailSafe(subscriptionDowngradedEmail(email));
    }
    return;
  }

  // Case 2: Already past_due — check grace period
  if (sub.status === 'past_due') {
    const pastDueSince = sub.statusChangedAt ?? sub.currentPeriodEnd;
    const daysSincePastDue = Math.floor(
      (now.getTime() - pastDueSince.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysSincePastDue >= GRACE_PERIOD_DAYS) {
      await downgradeToFree(sub, now);
      logger.info({ event: 'subscription_grace_period_expired', userId: sub.userId, daysSincePastDue });
      if (email) {
        await sendEmailSafe(subscriptionDowngradedEmail(email));
      }
      return;
    }

    // Within grace period — send reminder if not already sent today
    logger.info({ event: 'subscription_in_grace_period', userId: sub.userId, daysSincePastDue });
    if (email && daysSincePastDue > 0) {
      const daysLeft = GRACE_PERIOD_DAYS - daysSincePastDue;
      await sendEmailSafe(subscriptionRenewalReminderEmail(email, planName, daysLeft));
    }
    return;
  }

  // Case 3: Active subscription expired — attempt auto-renewal
  const savedMethodId = sub.externalSubscriptionId;
  if (!savedMethodId) {
    // No saved payment method (СБП or first-time) — mark past_due and notify
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'past_due', statusChangedAt: now },
    });
    logger.info({ event: 'subscription_past_due_no_method', userId: sub.userId });
    if (email) {
      await sendEmailSafe(subscriptionExpiredEmail(email, planName));
    }
    return;
  }

  // Has saved payment method — try auto-renewal via ЮKassa
  const price = PLAN_CONFIG[planId]?.price;
  if (!price || !email) {
    // No price (free plan?) or no email — mark past_due
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'past_due', statusChangedAt: now },
    });
    logger.info({ event: 'subscription_renewal_skipped_no_price', userId: sub.userId, planId });
    return;
  }

  try {
    // Create local Payment record BEFORE calling ЮKassa (webhook race condition)
    const today = now.toISOString().slice(0, 10);
    const idempotenceKey = `renewal-${sub.userId}-${planId}-${today}`;

    const payment = await prisma.payment.create({
      data: {
        userId: sub.userId,
        externalId: `pending-renewal-${sub.userId}-${today}`,
        idempotenceKey,
        type: 'subscription',
        planId,
        amount: price,
        currency: 'RUB',
        status: 'pending',
        paymentMethod: 'card',
        description: `Автопродление ${planName} (1 мес)`,
        metadata: { userId: sub.userId, planId, type: 'subscription' },
      },
    });

    // Call ЮKassa API
    const yooResult = await createAutoRenewalPayment({
      paymentMethodId: savedMethodId,
      amount: price,
      userId: sub.userId,
      planId,
      email,
    });

    // Update local Payment with real ЮKassa ID
    await prisma.payment.update({
      where: { id: payment.id },
      data: { externalId: yooResult.id },
    });

    logger.info({
      event: 'subscription_auto_renewal_created',
      userId: sub.userId,
      paymentId: yooResult.id,
      status: yooResult.status,
    });

    // If payment is immediately succeeded (rare for cards, but possible)
    // The webhook will handle the actual subscription update
  } catch (err) {
    // Auto-renewal failed — mark past_due and notify user
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'past_due', statusChangedAt: now },
    });

    logger.error({
      event: 'subscription_auto_renewal_failed',
      userId: sub.userId,
      error: err instanceof Error ? err.message : String(err),
    });

    if (email) {
      await sendEmailSafe(paymentFailedEmail(email, planName));
    }
  }
}

async function downgradeToFree(sub: SubscriptionRecord, now: Date) {
  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'expired', statusChangedAt: now },
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
}

/** Fire-and-forget email — never let email failures break the billing flow. */
async function sendEmailSafe(options: { to: string; subject: string; html: string }) {
  try {
    await sendEmail(options);
  } catch (err) {
    logger.error({
      event: 'email_send_failed',
      to: options.to,
      subject: options.subject,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export { worker };
