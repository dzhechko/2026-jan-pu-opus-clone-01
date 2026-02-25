import { NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/auth/cookies';

export async function POST() {
  const res = NextResponse.json({ message: 'Вы вышли из аккаунта' });
  clearAuthCookies(res);
  return res;
}
