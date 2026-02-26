import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { PLAN_CONFIG, EXTRA_MINUTES_PRICE_KOPECKS } from '@clipmaker/types';
import type { PlanId } from '@clipmaker/types';
import {
  createPayment,
  formatRubles,
  buildReceipt,
  buildExtraMinutesReceipt,
} from '@/lib/yookassa';
import { checkRateLimit } from '@/lib/auth/rate-limit';

const PLAN_ORDER: PlanId[] = ['free', 'start', 'pro', 'business'];

const APP_ORIGIN = process.env.NEXTAUTH_URL ?? '';

export const billingRouter = router({
  /**
   * Get current subscription status (authoritative — reads from DB).
   */
  subscription: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: ctx.session.user.id },
      select: {
        planId: true,
        minutesUsed: true,
        minutesLimit: true,
        subscription: {
          select: {
            status: true,
            paymentMethod: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
          },
        },
      },
    });

    return {
      plan: user.planId,
      minutesUsed: user.minutesUsed,
      minutesLimit: user.minutesLimit,
      status: user.subscription?.status ?? 'active',
      paymentMethod: user.subscription?.paymentMethod ?? null,
      currentPeriodEnd: user.subscription?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: user.subscription?.cancelAtPeriodEnd ?? false,
    };
  }),

  /**
   * Create a ЮKassa payment to upgrade to a paid plan.
   */
  checkout: protectedProcedure
    .input(
      z.object({
        planId: z.enum(['start', 'pro', 'business']),
        paymentMethod: z.enum(['card', 'sbp']),
        returnUrl: z.string().url().refine(
          (url) => !APP_ORIGIN || url.startsWith(APP_ORIGIN),
          'URL должен принадлежать этому домену',
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      await checkRateLimit('billing:checkout', userId, 3, 600);

      const user = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });

      if (user.planId === input.planId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Вы уже на этом тарифе' });
      }

      // Prevent downgrade via checkout
      const currentIdx = PLAN_ORDER.indexOf(user.planId as PlanId);
      const targetIdx = PLAN_ORDER.indexOf(input.planId);
      if (targetIdx <= currentIdx) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Понижение тарифа недоступно через оплату' });
      }

      // Check for existing pending subscription payment
      const pendingPayment = await ctx.prisma.payment.findFirst({
        where: { userId, type: 'subscription', status: 'pending' },
        select: { id: true },
      });
      if (pendingPayment) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'У вас есть незавершённый платёж. Дождитесь его завершения или попробуйте позже',
        });
      }

      const plan = PLAN_CONFIG[input.planId as PlanId];
      if (!plan || plan.price === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Недопустимый тариф' });
      }

      // Deterministic idempotence key (no Date.now() — prevents double-click double-charge)
      const today = new Date().toISOString().slice(0, 10);
      const idempotenceKey = `sub-${userId}-${input.planId}-${today}`;

      const confirmation =
        input.paymentMethod === 'sbp'
          ? { type: 'qr' as const }
          : { type: 'redirect' as const, return_url: input.returnUrl };

      // Create local payment record BEFORE calling ЮKassa to avoid webhook race
      const localPayment = await ctx.prisma.payment.create({
        data: {
          userId,
          externalId: `pending-${idempotenceKey}`,
          idempotenceKey,
          type: 'subscription',
          planId: input.planId,
          amount: plan.price,
          status: 'pending',
          paymentMethod: input.paymentMethod,
          description: `КлипМейкер: тариф ${input.planId} (1 мес)`,
        },
      });

      let yooPayment;
      try {
        yooPayment = await createPayment(
          {
            amount: { value: formatRubles(plan.price), currency: 'RUB' },
            confirmation,
            capture: true,
            save_payment_method: true,
            description: `КлипМейкер: тариф ${input.planId} (1 мес)`,
            metadata: { userId, planId: input.planId, type: 'subscription' },
            receipt: buildReceipt(user.email, input.planId as PlanId, plan.price),
          },
          idempotenceKey,
        );
      } catch {
        // Clean up local record on ЮKassa failure
        await ctx.prisma.payment.delete({ where: { id: localPayment.id } }).catch(() => {});
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Платёжная система недоступна. Попробуйте позже',
        });
      }

      // Update local record with real ЮKassa external ID
      await ctx.prisma.payment.update({
        where: { id: localPayment.id },
        data: { externalId: yooPayment.id },
      });

      const confirmationUrl = yooPayment.confirmation?.confirmation_url;
      if (!confirmationUrl) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Платёжная система не вернула ссылку для оплаты',
        });
      }

      if (input.paymentMethod === 'sbp') {
        return {
          type: 'qr' as const,
          qrUrl: confirmationUrl,
          paymentId: yooPayment.id,
        };
      }
      return {
        type: 'redirect' as const,
        confirmationUrl,
        paymentId: yooPayment.id,
      };
    }),

  /**
   * Buy extra minutes (one-time payment).
   */
  buyMinutes: protectedProcedure
    .input(
      z.object({
        minutes: z.enum(['30', '60', '120']).transform(Number),
        paymentMethod: z.enum(['card', 'sbp']),
        returnUrl: z.string().url().refine(
          (url) => !APP_ORIGIN || url.startsWith(APP_ORIGIN),
          'URL должен принадлежать этому домену',
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      await checkRateLimit('billing:buy-minutes', userId, 5, 3600);

      const user = await ctx.prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });

      const amount = input.minutes * EXTRA_MINUTES_PRICE_KOPECKS;
      const today = new Date().toISOString().slice(0, 10);
      const idempotenceKey = `extra-${userId}-${input.minutes}-${today}`;

      const confirmation =
        input.paymentMethod === 'sbp'
          ? { type: 'qr' as const }
          : { type: 'redirect' as const, return_url: input.returnUrl };

      // Create local payment record BEFORE calling ЮKassa
      const localPayment = await ctx.prisma.payment.create({
        data: {
          userId,
          externalId: `pending-${idempotenceKey}`,
          idempotenceKey,
          type: 'extra_minutes',
          amount,
          status: 'pending',
          paymentMethod: input.paymentMethod,
          description: `КлипМейкер: ${input.minutes} доп. минут`,
          metadata: { minutes: input.minutes },
        },
      });

      let yooPayment;
      try {
        yooPayment = await createPayment(
          {
            amount: { value: formatRubles(amount), currency: 'RUB' },
            confirmation,
            capture: true,
            description: `КлипМейкер: ${input.minutes} доп. минут`,
            metadata: { userId, minutes: input.minutes, type: 'extra_minutes' },
            receipt: buildExtraMinutesReceipt(user.email, input.minutes, amount),
          },
          idempotenceKey,
        );
      } catch {
        await ctx.prisma.payment.delete({ where: { id: localPayment.id } }).catch(() => {});
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Платёжная система недоступна. Попробуйте позже',
        });
      }

      await ctx.prisma.payment.update({
        where: { id: localPayment.id },
        data: { externalId: yooPayment.id },
      });

      const confirmationUrl = yooPayment.confirmation?.confirmation_url;
      if (!confirmationUrl) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Платёжная система не вернула ссылку для оплаты',
        });
      }

      if (input.paymentMethod === 'sbp') {
        return {
          type: 'qr' as const,
          qrUrl: confirmationUrl,
          paymentId: yooPayment.id,
        };
      }
      return {
        type: 'redirect' as const,
        confirmationUrl,
        paymentId: yooPayment.id,
      };
    }),

  /**
   * Cancel subscription (active until period end).
   */
  cancel: protectedProcedure.mutation(async ({ ctx }) => {
    const sub = await ctx.prisma.subscription.findUnique({
      where: { userId: ctx.session.user.id },
    });

    if (!sub) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Подписка не найдена' });
    }
    if (sub.status === 'expired') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Подписка уже истекла' });
    }
    if (sub.cancelAtPeriodEnd) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Подписка уже отменена' });
    }

    await ctx.prisma.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true },
    });

    return { cancelAtPeriodEnd: true, activeUntil: sub.currentPeriodEnd };
  }),

  /**
   * Reactivate a cancelled subscription (before period ends).
   */
  reactivate: protectedProcedure.mutation(async ({ ctx }) => {
    const sub = await ctx.prisma.subscription.findUnique({
      where: { userId: ctx.session.user.id },
    });

    if (!sub) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Подписка не найдена' });
    }
    if (sub.status === 'expired') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Подписка истекла, оформите новую' });
    }
    if (!sub.cancelAtPeriodEnd) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Подписка не была отменена' });
    }
    if (sub.currentPeriodEnd <= new Date()) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Период подписки уже истёк' });
    }

    await ctx.prisma.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: false },
    });

    return { cancelAtPeriodEnd: false };
  }),

  /**
   * Poll payment status (for СБП QR flow).
   */
  checkPaymentStatus: protectedProcedure
    .input(z.object({ paymentId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const payment = await ctx.prisma.payment.findUnique({
        where: { externalId: input.paymentId },
        select: { status: true, userId: true },
      });

      if (!payment || payment.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      return { status: payment.status };
    }),
});
