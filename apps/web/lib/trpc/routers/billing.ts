import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const billingRouter = router({
  subscription: protectedProcedure.query(async ({ ctx }) => {
    const sub = await ctx.prisma.subscription.findUnique({
      where: { userId: ctx.session.user.id },
    });

    if (!sub) {
      return { plan: 'free', status: 'active', paymentMethod: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };
    }

    return {
      plan: sub.planId,
      status: sub.status,
      paymentMethod: sub.paymentMethod,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    };
  }),

  checkout: protectedProcedure
    .input(
      z.object({
        planId: z.enum(['start', 'pro', 'business']),
        paymentMethod: z.enum(['card', 'sbp']),
        returnUrl: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // TODO: Integrate YooKassa API
      // This is a placeholder for the billing integration
      return {
        confirmationUrl: `https://yookassa.ru/checkout?plan=${input.planId}`,
        paymentId: 'placeholder',
      };
    }),

  cancel: protectedProcedure.mutation(async ({ ctx }) => {
    const sub = await ctx.prisma.subscription.findUnique({
      where: { userId: ctx.session.user.id },
    });

    if (!sub) throw new TRPCError({ code: 'NOT_FOUND', message: 'Подписка не найдена' });

    await ctx.prisma.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true },
    });

    return { cancelAtPeriodEnd: true, activeUntil: sub.currentPeriodEnd };
  }),
});
