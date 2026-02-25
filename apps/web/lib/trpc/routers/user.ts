import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { registerSchema } from '@/lib/auth/schemas';
import { hashPassword } from '@/lib/auth/password';
import { signVerificationToken } from '@/lib/auth/jwt';
import { checkRateLimit } from '@/lib/auth/rate-limit';

export const userRouter = router({
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ ctx, input }) => {
      // Rate limit: 3 registrations per hour per IP
      // In tRPC context we don't have direct IP access, use a fallback key
      const rateLimitKey = 'trpc-register';
      await checkRateLimit('auth:register', rateLimitKey, 3, 3600);

      const normalizedEmail = input.email.toLowerCase().trim();

      const existing = await ctx.prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Email уже зарегистрирован',
        });
      }

      const passwordHash = await hashPassword(input.password);

      const user = await ctx.prisma.user.create({
        data: {
          name: input.name,
          email: normalizedEmail,
          passwordHash,
          authProvider: 'email',
          planId: 'free',
          minutesLimit: 30,
          llmProviderPreference: 'ru',
        },
      });

      // Sign email verification JWT (24h expiry)
      const verificationToken = signVerificationToken(user.id, user.email);
      const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
      const verificationLink = `${baseUrl}/api/auth/verify-email?token=${verificationToken}`;

      // TODO: Replace with actual email sending (e.g., Resend, SendGrid)
      console.log(`[VERIFY EMAIL] ${user.email}: ${verificationLink}`);

      return {
        message:
          'Регистрация успешна. Проверьте почту для подтверждения email.',
      };
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

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Пользователь не найден',
      });
    }

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

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Пользователь не найден',
      });
    }

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
