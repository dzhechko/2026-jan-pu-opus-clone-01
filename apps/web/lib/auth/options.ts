import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@clipmaker/db';
import { VkProvider } from './vk-provider';
import { verifyPassword } from './password';
import { checkRateLimit } from './rate-limit';
import { loginSchema } from './schemas';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const normalizedEmail = email.toLowerCase().trim();

        // Rate limit: 5 attempts per minute per IP
        const ip =
          req?.headers?.['x-forwarded-for']?.toString().split(',')[0]?.trim() ??
          'unknown';
        await checkRateLimit('auth:login', ip, 5, 60);

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });

        if (!user || !user.passwordHash) return null;

        if (!user.emailVerified) {
          throw new Error('Email не подтверждён. Проверьте почту');
        }

        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          planId: user.planId,
        };
      },
    }),
    VkProvider({
      clientId: process.env.VK_CLIENT_ID ?? '',
      clientSecret: process.env.VK_CLIENT_SECRET ?? '',
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 15 * 60, // 15 minutes
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user, account, profile }) {
      // On initial sign-in, populate token with user data
      if (user) {
        token.id = user.id;
        token.email = user.email ?? '';
        token.planId = (user as { planId?: string }).planId ?? 'free';
      }

      // Handle VK OAuth sign-in: upsert user in DB
      if (account?.provider === 'vk' && profile) {
        const vkProfile = profile as { vkId?: string; email?: string };
        const vkId = vkProfile.vkId ?? user?.id;

        if (vkId) {
          const existingUser = await prisma.user.findUnique({
            where: { vkId: String(vkId) },
          });

          if (existingUser) {
            token.id = existingUser.id;
            token.email = existingUser.email;
            token.planId = existingUser.planId;
          } else {
            const newUser = await prisma.user.create({
              data: {
                email: user?.email ?? `vk_${vkId}@clipmaker.ru`,
                name: user?.name ?? null,
                avatarUrl: user?.image ?? null,
                vkId: String(vkId),
                authProvider: 'vk',
                emailVerified: true,
                planId: 'free',
                minutesLimit: 30,
                llmProviderPreference: 'ru',
              },
            });
            token.id = newUser.id;
            token.email = newUser.email;
            token.planId = newUser.planId;
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.email = token.email ?? '';
        session.user.planId = token.planId;
        session.user.name = token.name ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
};
