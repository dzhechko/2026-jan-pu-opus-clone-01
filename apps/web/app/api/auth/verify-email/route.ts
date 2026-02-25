import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@clipmaker/db';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token');

    if (!token) {
      return NextResponse.redirect(
        new URL('/login?error=missing_token', req.nextUrl.origin),
      );
    }

    const payload = verifyToken<{
      userId: string;
      email: string;
      purpose: string;
    }>(token);

    if (payload.purpose !== 'email_verification') {
      return NextResponse.redirect(
        new URL('/login?error=invalid_token', req.nextUrl.origin),
      );
    }

    // Verify user exists AND email matches the token (prevent cross-user verification)
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { email: true, emailVerified: true },
    });

    if (!user || user.email !== payload.email) {
      return NextResponse.redirect(
        new URL('/login?error=invalid_token', req.nextUrl.origin),
      );
    }

    // Skip if already verified (idempotent)
    if (!user.emailVerified) {
      await prisma.user.update({
        where: { id: payload.userId },
        data: { emailVerified: true },
      });
    }

    return NextResponse.redirect(
      new URL('/login?verified=true', req.nextUrl.origin),
    );
  } catch {
    return NextResponse.redirect(
      new URL('/login?error=invalid_token', req.nextUrl.origin),
    );
  }
}
