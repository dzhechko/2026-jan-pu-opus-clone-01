type EmailOptions = {
  to: string;
  subject: string;
  html: string;
};

/**
 * Send an email.
 * - Development: logs to console (no SMTP needed)
 * - Production: uses Nodemailer with SMTP_* env vars
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  if (process.env.NODE_ENV === 'development' || !process.env.SMTP_HOST) {
    console.log(`[EMAIL] To: ${options.to}`);
    console.log(`[EMAIL] Subject: ${options.subject}`);
    console.log(`[EMAIL] Body: ${options.html}`);
    return;
  }

  // Dynamic import to avoid bundling nodemailer in dev
  const nodemailer = await import('nodemailer');
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
}

/** Pre-built email templates */
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
