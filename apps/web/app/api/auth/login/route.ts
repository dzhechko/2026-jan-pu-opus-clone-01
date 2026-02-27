import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@clipmaker/db';
import { verifyPassword } from '@/lib/auth/password';
import { loginSchema } from '@/lib/auth/schemas';
import { signAccessToken, signRefreshToken } from '@/lib/auth/jwt';
import { setAuthCookies } from '@/lib/auth/cookies';
import { checkRateLimit } from '@/lib/auth/rate-limit';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 });
  }

  const { email, password, rememberMe } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  // Rate limit: 5 attempts per minute per IP
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  try {
    await checkRateLimit('auth:login', ip, 5, 60);
  } catch {
    return NextResponse.json(
      { error: 'RATE_LIMIT', message: 'Слишком много попыток. Подождите минуту.' },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  // Constant-time-ish: don't reveal whether the user exists
  if (!user || !user.passwordHash) {
    return NextResponse.json(
      { error: 'INVALID_CREDENTIALS', message: 'Неверный email или пароль' },
      { status: 401 },
    );
  }

  if (!user.emailVerified) {
    return NextResponse.json(
      { error: 'EMAIL_NOT_VERIFIED', message: 'Подтвердите email. Проверьте почту.' },
      { status: 403 },
    );
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return NextResponse.json(
      { error: 'INVALID_CREDENTIALS', message: 'Неверный email или пароль' },
      { status: 401 },
    );
  }

  // Issue JWT tokens
  const accessToken = signAccessToken({
    id: user.id,
    email: user.email,
    planId: user.planId,
  });
  const refreshToken = signRefreshToken(
    { id: user.id, email: user.email, planId: user.planId },
    rememberMe,
  );

  const res = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      planId: user.planId,
    },
  });

  setAuthCookies(res, accessToken, refreshToken, rememberMe);
  return res;
}
