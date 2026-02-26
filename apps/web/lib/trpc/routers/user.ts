import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { registerSchema } from '@/lib/auth/schemas';
import { hashPassword } from '@/lib/auth/password';
import { signVerificationToken } from '@/lib/auth/jwt';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { encryptToken } from '@clipmaker/crypto';
import type { ByokProvider } from '@clipmaker/types';
import { Redis } from 'ioredis';

export const userRouter = router({
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ ctx, input }) => {
      // Rate limit: 3 registrations per hour per IP
      await checkRateLimit('auth:register', ctx.clientIp, 3, 3600);

      const normalizedEmail = input.email.toLowerCase().trim();

      const existing = await ctx.prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      // Don't leak email existence — return same message regardless.
      // If user exists, silently skip creation but still return success.
      if (existing) {
        // TODO: Send "someone tried to register with your email" notification
        return {
          message:
            'Проверьте почту для подтверждения email.',
        };
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
          'Проверьте почту для подтверждения email.',
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

  // --- BYOK Key Management ---

  testByokKey: protectedProcedure
    .input(
      z.object({
        provider: z.enum(['gemini', 'openai', 'anthropic']),
        // SECURITY: Key is sent via tRPC body (encrypted by TLS in transit).
        // Never log the input of this mutation. Never include in error reports.
        apiKey: z.string().min(10).max(256),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Rate limit: 10 test calls per minute per user
      await checkRateLimit(
        `byok:test:${ctx.session.user.id}`,
        ctx.clientIp,
        10,
        60,
      );

      const { provider, apiKey } = input;

      try {
        switch (provider) {
          case 'gemini': {
            // Use header-based auth instead of URL query param to avoid key leakage in logs
            const res = await fetch(
              'https://generativelanguage.googleapis.com/v1beta/models',
              {
                headers: { 'x-goog-api-key': apiKey },
                signal: AbortSignal.timeout(10_000),
              },
            );
            if (!res.ok) {
              return { valid: false, error: 'Недействительный ключ Gemini' };
            }
            return { valid: true, provider };
          }

          case 'openai': {
            const res = await fetch('https://api.openai.com/v1/models', {
              headers: { Authorization: `Bearer ${apiKey}` },
              signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) {
              return { valid: false, error: 'Недействительный ключ OpenAI' };
            }
            return { valid: true, provider };
          }

          case 'anthropic': {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'claude-haiku-4.5-20250501',
                max_tokens: 1,
                messages: [{ role: 'user', content: 'ping' }],
              }),
              signal: AbortSignal.timeout(10_000),
            });
            // 200 = valid, 401 = invalid key, other errors = might be valid
            if (res.status === 401) {
              return { valid: false, error: 'Недействительный ключ Anthropic' };
            }
            return { valid: true, provider };
          }

          default:
            return { valid: false, error: 'Неизвестный провайдер' };
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return { valid: false, error: 'Таймаут. Попробуйте позже' };
        }
        return { valid: false, error: 'Ошибка сети. Проверьте подключение' };
      }
    }),

  cacheByokKeys: protectedProcedure
    .input(
      z.object({
        keys: z.object({
          gemini: z.string().min(10).max(256).optional(),
          openai: z.string().min(10).max(256).optional(),
          anthropic: z.string().min(10).max(256).optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const secret = process.env.PLATFORM_TOKEN_SECRET;
      if (!secret || secret.length !== 64) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Server encryption not configured',
        });
      }

      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      const redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 });

      try {
        const cached: ByokProvider[] = [];
        const pipeline = redis.pipeline();

        for (const [provider, key] of Object.entries(input.keys)) {
          if (!key) continue;
          const encrypted = encryptToken(key, secret);
          const redisKey = `byok:${ctx.session.user.id}:${provider}`;
          pipeline.set(redisKey, encrypted, 'EX', 300); // 5 min TTL
          cached.push(provider as ByokProvider);
        }

        await pipeline.exec();

        return { cached, ttl: 300 };
      } finally {
        await redis.quit();
      }
    }),
});
