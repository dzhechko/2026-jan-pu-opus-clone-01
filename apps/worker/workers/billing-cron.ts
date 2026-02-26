import { Worker, type Job } from 'bullmq';
import { prisma } from '@clipmaker/db';
import { PLAN_CONFIG } from '@clipmaker/types';
import type { PlanId } from '@clipmaker/types';
import { QUEUE_NAMES } from '@clipmaker/queue';
import { createLogger } from '../lib/logger';
import { getRedisConnection } from '../lib/redis';

const logger = createLogger('billing-cron');

const GRACE_PERIOD_DAYS = 7;
const BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// Worker Registration
// ---------------------------------------------------------------------------

const connection = getRedisConnection();

const worker = new Worker(
  QUEUE_NAMES.BILLING_CRON,
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
  // Case 1: User cancelled — downgrade to free
  if (sub.cancelAtPeriodEnd) {
    await downgradeToFree(sub, now);
    logger.info({ event: 'subscription_expired_cancelled', userId: sub.userId });
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
      return;
    }

    // Within grace period — no action (user must renew manually or wait for retry)
    logger.info({ event: 'subscription_in_grace_period', userId: sub.userId, daysSincePastDue });
    return;
  }

  // Case 3: Active subscription expired — check if auto-renewal is possible
  const savedMethodId = sub.externalSubscriptionId;
  if (!savedMethodId) {
    // No saved method (СБП) — mark past_due
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'past_due', statusChangedAt: now },
    });
    logger.info({ event: 'subscription_past_due_no_method', userId: sub.userId });
    // TODO: Send renewal reminder email
    return;
  }

  // Auto-renewal would create a ЮKassa payment here.
  // Since we don't have ЮKassa credentials in the worker process,
  // we mark as past_due and let the user renew via the billing page.
  // In production, this would call the ЮKassa API directly.
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: 'past_due', statusChangedAt: now },
  });
  logger.info({ event: 'subscription_renewal_pending', userId: sub.userId });
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

export { worker };
