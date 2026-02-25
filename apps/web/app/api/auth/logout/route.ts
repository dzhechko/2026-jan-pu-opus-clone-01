import { NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/auth/cookies';

export async function POST() {
  const res = NextResponse.json({ message: 'Вы вышли из аккаунта' });

  // Clear custom JWT cookies
  clearAuthCookies(res);

  // Clear NextAuth session cookie (used for VK OAuth bridge)
  res.cookies.set('next-auth.session-token', '', { path: '/', maxAge: 0 });
  res.cookies.set('__Secure-next-auth.session-token', '', { path: '/', maxAge: 0 });

  return res;
}
