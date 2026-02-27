# INS-020: Ethereal для dev-email вместо console.log

**Status:** 🟢 Active
**Hits:** 1
**Date:** 2026-02-27

## Error Signatures
`приглашение не приходит на email`, `email not received`, `SMTP_HOST not configured`, `Ethereal`

## Problem
В dev-среде email-уведомления (верификация, инвайты, платежи) не доставляются — раньше просто console.log, без возможности увидеть содержимое письма.

## Root Cause
Нет SMTP-сервера в development. `console.log` не показывает HTML-содержимое письма.

## Solution
Используем **Ethereal** (nodemailer fake SMTP) в `apps/web/lib/auth/email.ts`:

```typescript
// Когда SMTP_HOST не задан (dev):
const testAccount = await nodemailer.createTestAccount();
const transport = nodemailer.createTransport({
  host: 'smtp.ethereal.email', port: 587, secure: false,
  auth: { user: testAccount.user, pass: testAccount.pass },
});
const info = await transport.sendMail({ ... });
const previewUrl = nodemailer.getTestMessageUrl(info); // URL для просмотра письма
```

- `previewUrl` возвращается в API response (dev only)
- Для team invite — ссылка приглашения и preview URL показываются прямо в UI
- В production используется реальный SMTP через env vars

## Key Insight
Ethereal создаёт временный аккаунт на лету — не нужна никакая конфигурация. Preview URL позволяет просматривать HTML-письма в браузере.
