import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const userRouter = router({
  register: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        email: z.string().email(),
        password: z.string().min(8).max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.user.findUnique({ where: { email: input.email } });
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Email уже зарегистрирован' });
      }

      // TODO: bcrypt.hash(input.password, 12)
      const passwordHash = input.password; // placeholder

      const user = await ctx.prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
        },
      });

      return { id: user.id, email: user.email };
    }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        planId: true,
        minutesUsed: true,
        minutesLimit: true,
        llmProviderPreference: true,
        billingPeriodStart: true,
      },
    });

    if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
    return user;
  }),

  updateSettings: protectedProcedure
    .input(
      z.object({
        llmProviderPreference: z.enum(['ru', 'global']).optional(),
        name: z.string().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: input,
      });

      return {
        llmProviderPreference: user.llmProviderPreference,
        dataResidencyWarning:
          user.llmProviderPreference === 'global'
            ? 'Транскрипты обрабатываются за пределами РФ'
            : null,
      };
    }),

  usage: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.session.user.id },
      include: { subscription: true },
    });

    if (!user) throw new TRPCError({ code: 'NOT_FOUND' });

    const costs = await ctx.prisma.usageRecord.aggregate({
      where: { userId: ctx.session.user.id },
      _sum: {
        llmCostKopecks: true,
        sttCostKopecks: true,
        gpuCostKopecks: true,
      },
    });

    return {
      plan: user.planId,
      minutesUsed: user.minutesUsed,
      minutesLimit: user.minutesLimit,
      minutesRemaining: user.minutesLimit - user.minutesUsed,
      billingPeriodEnd: user.subscription?.currentPeriodEnd ?? null,
      llmProvider: user.llmProviderPreference,
      processingCosts: {
        totalKopecks:
          (costs._sum.llmCostKopecks ?? 0) +
          (costs._sum.sttCostKopecks ?? 0) +
          (costs._sum.gpuCostKopecks ?? 0),
        llmKopecks: costs._sum.llmCostKopecks ?? 0,
        sttKopecks: costs._sum.sttCostKopecks ?? 0,
        gpuKopecks: costs._sum.gpuCostKopecks ?? 0,
      },
    };
  }),
});
