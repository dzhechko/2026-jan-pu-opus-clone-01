import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { signAccessToken, signRefreshToken } from '@/lib/auth/jwt';
import { setAuthCookies } from '@/lib/auth/cookies';

/**
 * Session bridge: converts a NextAuth session (from VK OAuth) into custom JWT cookies.
 *
 * After VK OAuth callback, NextAuth sets its own session cookie. This route reads
 * that session, issues our access_token + refresh_token cookies, and redirects
 * to the requested destination. This bridges NextAuth OAuth with our custom JWT
 * middleware.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const user = session.user as { id: string; email: string; planId?: string };

  const accessToken = signAccessToken({
    id: user.id,
    email: user.email ?? '',
    planId: user.planId ?? 'free',
  });
  const refreshToken = signRefreshToken({
    id: user.id,
    email: user.email ?? '',
    planId: user.planId ?? 'free',
  });

  const callbackUrl = request.nextUrl.searchParams.get('callbackUrl') || '/dashboard';

  // Validate callbackUrl is relative (prevent open redirect)
  const isRelative = callbackUrl.startsWith('/') && !callbackUrl.startsWith('//');
  const safeUrl = isRelative ? callbackUrl : '/dashboard';

  const res = NextResponse.redirect(new URL(safeUrl, request.url));
  setAuthCookies(res, accessToken, refreshToken);
  return res;
}
