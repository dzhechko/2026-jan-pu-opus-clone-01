type EmailOptions = {
  to: string;
  subject: string;
  html: string;
};

type SendEmailResult = {
  /** Ethereal preview URL (dev only). Undefined in production. */
  previewUrl?: string;
};

/**
 * Send an email.
 * - Development (no SMTP_HOST): uses Ethereal (fake SMTP with preview URL)
 * - Production: uses Nodemailer with SMTP_* env vars
 */
export async function sendEmail(options: EmailOptions): Promise<SendEmailResult> {
  const nodemailer = await import('nodemailer');

  // Production: use configured SMTP
  if (process.env.SMTP_HOST) {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transport.sendMail({
      from: process.env.SMTP_FROM ?? 'КлипМейкер <noreply@clipmaker.ru>',
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    return {};
  }

  // Development: use Ethereal (fake SMTP with web preview)
  const testAccount = await nodemailer.createTestAccount();
  const transport = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });

  const info = await transport.sendMail({
    from: 'КлипМейкер <noreply@clipmaker.ru>',
    to: options.to,
    subject: options.subject,
    html: options.html,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
  console.log(`[EMAIL] To: ${options.to} | Subject: ${options.subject}`);
  if (previewUrl) {
    console.log(`[EMAIL] Preview: ${previewUrl}`);
  }

  return { previewUrl };
}

// ---------------------------------------------------------------------------
// Email Templates
// ---------------------------------------------------------------------------

/** Email verification after registration. */
export function verificationEmail(email: string, link: string): EmailOptions {
  return {
    to: email,
    subject: 'Подтвердите email — КлипМейкер',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Добро пожаловать в КлипМейкер!</h2>
        <p>Подтвердите ваш email, нажав на кнопку ниже:</p>
        <a href="${link}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Подтвердить email
        </a>
        <p style="color: #6b7280; font-size: 14px; margin-top: 16px;">
          Если вы не регистрировались, просто проигнорируйте это письмо.
        </p>
      </div>
    `,
  };
}

/** Password reset link. */
export function resetPasswordEmail(email: string, link: string): EmailOptions {
  return {
    to: email,
    subject: 'Сброс пароля — КлипМейкер',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Сброс пароля</h2>
        <p>Для сброса пароля нажмите на кнопку ниже:</p>
        <a href="${link}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Сбросить пароль
        </a>
        <p style="color: #6b7280; font-size: 14px; margin-top: 16px;">
          Ссылка действительна 1 час. Если вы не запрашивали сброс, проигнорируйте это письмо.
        </p>
      </div>
    `,
  };
}

/** Team invite. */
export function teamInviteEmail(email: string, teamName: string, link: string): EmailOptions {
  return {
    to: email,
    subject: `Приглашение в команду "${teamName}" — КлипМейкер`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Приглашение в команду</h2>
        <p>Вас пригласили в команду <strong>${teamName}</strong> на КлипМейкер.</p>
        <a href="${link}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Принять приглашение
        </a>
        <p style="color: #6b7280; font-size: 14px; margin-top: 16px;">
          Если вы не ожидали этого приглашения, просто проигнорируйте его.
        </p>
      </div>
    `,
  };
}

/** Payment succeeded confirmation. */
export function paymentSucceededEmail(email: string, planName: string, amount: number): EmailOptions {
  return {
    to: email,
    subject: 'Оплата прошла успешно — КлипМейкер',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Оплата прошла успешно</h2>
        <p>Мы получили оплату <strong>${amount} ₽</strong> за тариф <strong>${planName}</strong>. Спасибо!</p>
        <a href="${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/dashboard/billing" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Открыть подписку
        </a>
      </div>
    `,
  };
}

/** Security alert: someone tried to register with an existing email. */
export function duplicateRegistrationEmail(email: string): EmailOptions {
  return {
    to: email,
    subject: 'Попытка регистрации с вашим email — КлипМейкер',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Попытка регистрации</h2>
        <p>Кто-то попытался зарегистрировать аккаунт с вашим email <strong>${email}</strong>.</p>
        <p>Если это были вы, используйте <strong>«Забыли пароль?»</strong> для восстановления доступа.</p>
        <p>Если это не вы — проигнорируйте это письмо. Ваш аккаунт в безопасности.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 16px;">
          Никто не получил доступ к вашему аккаунту. Это уведомление отправлено в целях безопасности.
        </p>
      </div>
    `,
  };
}
