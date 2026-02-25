import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@clipmaker/db';
import { VkProvider } from './vk-provider';
import { verifyPassword } from './password';
import { loginSchema } from './schemas';

export const authOptions: NextAuthOptions = {
  providers: [
    // Credentials provider is kept for NextAuth's internal plumbing but
    // the actual credentials login flow uses /api/auth/login (custom JWT).
    // This provider is primarily a fallback for getServerSession in the
    // session-bridge route.
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const normalizedEmail = email.toLowerCase().trim();

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });

        if (!user || !user.passwordHash) return null;
        if (!user.emailVerified) return null;

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
    // NextAuth session is used primarily for VK OAuth bridge.
    // The actual auth enforcement is via custom JWT middleware.
    // 7 days matches our refresh token lifetime.
    maxAge: 7 * 24 * 60 * 60,
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
          // Try to find by vkId first
          let existingUser = await prisma.user.findUnique({
            where: { vkId: String(vkId) },
          });

          // If not found by vkId, try email-based account linking
          if (!existingUser && user?.email) {
            const emailUser = await prisma.user.findUnique({
              where: { email: user.email },
            });
            if (emailUser) {
              // Link VK to existing email account
              existingUser = await prisma.user.update({
                where: { id: emailUser.id },
                data: {
                  vkId: String(vkId),
                  avatarUrl: emailUser.avatarUrl ?? user?.image ?? null,
                },
              });
            }
          }

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
