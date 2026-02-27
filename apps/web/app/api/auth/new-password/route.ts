import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@clipmaker/db';
import { newPasswordSchema } from '@/lib/auth/schemas';
import { verifyToken } from '@/lib/auth/jwt';
import { hashPassword } from '@/lib/auth/password';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = newPasswordSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? 'Некорректные данные';
      return NextResponse.json(
        { error: { message: firstError } },
        { status: 400 },
      );
    }

    const { token, password } = parsed.data;

    let payload: { userId: string; purpose: string };
    try {
      payload = verifyToken<{ userId: string; purpose: string }>(token);
    } catch {
      return NextResponse.json(
        {
          error: {
            message:
              'Ссылка для сброса пароля недействительна или истекла. Запросите новую.',
          },
        },
        { status: 400 },
      );
    }

    if (payload.purpose !== 'password_reset') {
      return NextResponse.json(
        { error: { message: 'Неверный тип токена' } },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(password);

    await prisma.user.update({
      where: { id: payload.userId },
      data: { passwordHash },
    });

    return NextResponse.json({
      message: 'Пароль успешно изменён. Теперь вы можете войти.',
    });
  } catch {
    return NextResponse.json(
      { error: { message: 'Внутренняя ошибка сервера' } },
      { status: 500 },
    );
  }
}
