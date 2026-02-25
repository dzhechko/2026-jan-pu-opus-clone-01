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

    await prisma.user.update({
      where: { id: payload.userId },
      data: { emailVerified: true },
    });

    return NextResponse.redirect(
      new URL('/login?verified=true', req.nextUrl.origin),
    );
  } catch {
    return NextResponse.redirect(
      new URL('/login?error=invalid_token', req.nextUrl.origin),
    );
  }
}
