import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { TRPCError } from '@trpc/server';
import { prisma } from '@clipmaker/db';
import { resetPasswordSchema } from '@/lib/auth/schemas';
import { signResetToken } from '@/lib/auth/jwt';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { sendEmail, resetPasswordEmail } from '@/lib/auth/email';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: 'Некорректный email' } },
        { status: 400 },
      );
    }

    const normalizedEmail = parsed.data.email.toLowerCase().trim();

    // Rate limit: 3 resets per hour per email
    await checkRateLimit('auth:reset', normalizedEmail, 3, 3600);

    // Always return success to prevent email enumeration
    const successResponse = NextResponse.json({
      message:
        'Если аккаунт с таким email существует, мы отправили инструкции по сбросу пароля.',
    });

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return successResponse;
    }

    const resetToken = signResetToken(user.id);
    const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

    await sendEmail(resetPasswordEmail(user.email, resetLink));

    return successResponse;
  } catch (error) {
    // Handle rate limit errors (TRPCError with TOO_MANY_REQUESTS code)
    if (error instanceof TRPCError && error.code === 'TOO_MANY_REQUESTS') {
      return NextResponse.json(
        { error: { message: error.message } },
        { status: 429 },
      );
    }

    return NextResponse.json(
      { error: { message: 'Внутренняя ошибка сервера' } },
      { status: 500 },
    );
  }
}
