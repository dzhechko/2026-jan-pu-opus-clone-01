import { prisma } from '@clipmaker/db';

type SessionUser = {
  id: string;
  email: string;
  planId: string;
  name: string | null;
};

type Session = {
  user: SessionUser;
};

/**
 * Creates tRPC context from the incoming request.
 *
 * Reads x-user-* headers set by the Edge middleware (which verifies JWTs).
 * This replaces the previous getServerSession(authOptions) approach, unifying
 * authentication under the custom JWT system instead of NextAuth sessions.
 */
export async function createContext(opts?: { req: Request }) {
  let session: Session | null = null;
  let clientIp = 'unknown';

  if (opts?.req) {
    const userId = opts.req.headers.get('x-user-id');
    const email = opts.req.headers.get('x-user-email');
    const planId = opts.req.headers.get('x-user-plan');

    clientIp =
      opts.req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

    if (userId) {
      session = {
        user: {
          id: userId,
          email: email ?? '',
          planId: planId ?? 'free',
          name: null,
        },
      };
    }
  }

  return {
    session,
    prisma,
    clientIp,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
