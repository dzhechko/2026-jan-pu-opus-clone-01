type EmailOptions = {
  to: string;
  subject: string;
  html: string;
};

const BASE_URL =
  process.env.NEXTAUTH_URL ||
  process.env.APP_ORIGIN ||
  'http://localhost:3000';

const BILLING_URL = `${BASE_URL}/dashboard/billing`;

/**
 * Send an email from the worker process.
 * - Development / no SMTP_HOST: logs to console
 * - Production: uses Nodemailer with SMTP_* env vars
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  if (process.env.NODE_ENV === 'development' || !process.env.SMTP_HOST) {
    console.log(`[EMAIL] To: ${options.to}`);
    console.log(`[EMAIL] Subject: ${options.subject}`);
    console.log(`[EMAIL] Body: ${options.html}`);
    return;
  }

  // Dynamic import to avoid bundling nodemailer when unused
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

/* ---------------------------------------------------------------------------
 * Shared HTML helpers
 * --------------------------------------------------------------------------- */

function billingButton(label: string): string {
  return `
    <a href="${BILLING_URL}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
      ${label}
    </a>`;
}

function wrap(body: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      ${body}
      <p style="color: #6b7280; font-size: 14px; margin-top: 16px;">
        Если у вас есть вопросы, ответьте на это письмо — мы поможем.
      </p>
    </div>`;
}

/* ---------------------------------------------------------------------------
 * Billing email templates
 * --------------------------------------------------------------------------- */

/** Reminder N days before subscription expires */
export function subscriptionRenewalReminderEmail(
  email: string,
  planName: string,
  daysLeft: number,
): EmailOptions {
  const dayWord = pluralizeDays(daysLeft);
  return {
    to: email,
    subject: `Подписка заканчивается через ${daysLeft} ${dayWord} — КлипМейкер`,
    html: wrap(`
      <h2>Подписка скоро закончится</h2>
      <p>
        Ваша подписка <strong>${planName}</strong> заканчивается через
        <strong>${daysLeft} ${dayWord}</strong>.
      </p>
      <p>Продлите подписку, чтобы не потерять доступ к функциям:</p>
      ${billingButton('Продлить подписку')}
    `),
  };
}

/** Subscription has expired */
export function subscriptionExpiredEmail(
  email: string,
  planName: string,
): EmailOptions {
  return {
    to: email,
    subject: 'Подписка истекла — КлипМейкер',
    html: wrap(`
      <h2>Подписка истекла</h2>
      <p>
        Срок действия вашей подписки <strong>${planName}</strong> истёк.
        Продлите подписку, чтобы продолжить пользоваться всеми возможностями:
      </p>
      ${billingButton('Продлить подписку')}
    `),
  };
}

/** Payment succeeded */
export function paymentSucceededEmail(
  email: string,
  planName: string,
  amount: number,
): EmailOptions {
  return {
    to: email,
    subject: 'Оплата прошла успешно — КлипМейкер',
    html: wrap(`
      <h2>Оплата прошла успешно</h2>
      <p>
        Мы получили оплату <strong>${amount} ₽</strong> за тариф
        <strong>${planName}</strong>. Спасибо!
      </p>
      <p>Управлять подпиской можно в личном кабинете:</p>
      ${billingButton('Открыть подписку')}
    `),
  };
}

/** Payment failed */
export function paymentFailedEmail(
  email: string,
  planName: string,
): EmailOptions {
  return {
    to: email,
    subject: 'Не удалось продлить подписку — КлипМейкер',
    html: wrap(`
      <h2>Не удалось списать оплату</h2>
      <p>
        Автопродление тарифа <strong>${planName}</strong> не удалось.
        Пожалуйста, проверьте данные карты или выберите другой способ оплаты:
      </p>
      ${billingButton('Обновить способ оплаты')}
    `),
  };
}

/** Subscription cancelled (active until endDate) */
export function subscriptionCancelledEmail(
  email: string,
  planName: string,
  endDate: string,
): EmailOptions {
  return {
    to: email,
    subject: 'Подписка отменена — КлипМейкер',
    html: wrap(`
      <h2>Подписка отменена</h2>
      <p>
        Ваша подписка <strong>${planName}</strong> отменена. Вы можете
        пользоваться всеми функциями тарифа до <strong>${endDate}</strong>.
      </p>
      <p>Передумали? Возобновите подписку в любой момент:</p>
      ${billingButton('Возобновить подписку')}
    `),
  };
}

/** Subscription expired and downgraded to free plan */
export function subscriptionDowngradedEmail(
  email: string,
): EmailOptions {
  return {
    to: email,
    subject: 'Аккаунт переведён на бесплатный тариф — КлипМейкер',
    html: wrap(`
      <h2>Аккаунт переведён на бесплатный тариф</h2>
      <p>
        Ваша подписка истекла, и аккаунт автоматически переведён на
        бесплатный тариф. Некоторые функции больше недоступны.
      </p>
      <p>Верните полный доступ — оформите подписку снова:</p>
      ${billingButton('Выбрать тариф')}
    `),
  };
}

/* ---------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------------- */

/** Russian pluralization for "день / дня / дней" */
function pluralizeDays(n: number): string {
  const abs = Math.abs(n) % 100;
  const lastDigit = abs % 10;
  if (abs >= 11 && abs <= 19) return 'дней';
  if (lastDigit === 1) return 'день';
  if (lastDigit >= 2 && lastDigit <= 4) return 'дня';
  return 'дней';
}
