# Auth Feature — Pseudocode

## Zod Validation Schemas

```typescript
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(1, "Имя обязательно").max(100, "Имя слишком длинное"),
  email: z.string().email("Некорректный email"),
  password: z.string().min(8, "Минимум 8 символов").max(128, "Максимум 128 символов"),
});

const loginSchema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(1, "Пароль обязателен"),
});

const resetPasswordSchema = z.object({
  email: z.string().email("Некорректный email"),
});

const newPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Минимум 8 символов").max(128, "Максимум 128 символов"),
});
```

---

## 1. Registration Flow

```
function register(input: RegisterInput):
  validate(input) with Zod schema
  check if email exists → throw CONFLICT
  hash = bcrypt.hash(password, 12)
  user = prisma.user.create({ email, name, passwordHash: hash, planId: "free", minutesLimit: 30 })
  token = jwt.sign({ userId: user.id, purpose: "email_verification" }, secret, { expiresIn: "24h" })
  send verification email with token
  return { message: "Проверьте почту для подтверждения" }
```

---

## 2. Email Verification

```
function verifyEmail(token: string):
  payload = jwt.verify(token) → throw BAD_REQUEST if invalid
  user = prisma.user.findUnique(payload.userId)
  if user.emailVerified → return (idempotent)
  prisma.user.update({ emailVerified: true })
  create session (JWT access + refresh)
  redirect to /dashboard
```

---

## 3. Login Flow

```
function login(input: LoginInput):
  check rate limit (Redis: auth_attempts:{ip}, 5/min) → throw TOO_MANY_REQUESTS
  user = prisma.user.findUnique({ email })
  if !user || !user.passwordHash → throw UNAUTHORIZED "Неверный email или пароль"
  if !user.emailVerified → throw FORBIDDEN "Подтвердите email для входа"
  valid = bcrypt.compare(password, user.passwordHash)
  if !valid → increment rate counter, throw UNAUTHORIZED
  reset rate counter
  accessToken = jwt.sign({ id: user.id }, secret, { expiresIn: "15m" })
  refreshToken = jwt.sign({ id: user.id, type: "refresh" }, secret, { expiresIn: "7d" })
  set HttpOnly cookie "access_token" (15min, SameSite=Strict)
  set HttpOnly cookie "refresh_token" (7d, SameSite=Strict, Path=/api/auth)
  return { user: { id, email, name, planId } }
```

---

## 4. VK OAuth Flow

```
function vkOAuthCallback(code: string):
  exchange code for VK access_token + vk_user_data
  existingByVk = prisma.user.findUnique({ vkId: vk_user_data.id })
  if existingByVk → login as existingByVk
  existingByEmail = prisma.user.findUnique({ email: vk_user_data.email })
  if existingByEmail → link VK: update user.vkId, create PlatformConnection
  else → create new user with VK data, emailVerified=true, create PlatformConnection
  create PlatformConnection({ userId, platform: "vk", accessTokenEncrypted: encrypt(vk_token), expiresAt })
  create JWT session
  redirect to /dashboard
```

---

## 5. Password Reset

```
function requestPasswordReset(email: string):
  user = prisma.user.findUnique({ email })
  // Always return success (prevent email enumeration)
  if user:
    token = jwt.sign({ userId: user.id, purpose: "password_reset" }, secret, { expiresIn: "1h" })
    send reset email with link: /reset-password?token={token}
  return { message: "Если аккаунт существует, мы отправили ссылку для сброса пароля" }

function resetPassword(token: string, newPassword: string):
  payload = jwt.verify(token) → throw BAD_REQUEST "Ссылка устарела или недействительна"
  if payload.purpose !== "password_reset" → throw BAD_REQUEST
  hash = bcrypt.hash(newPassword, 12)
  prisma.user.update({ id: payload.userId, passwordHash: hash })
  return { message: "Пароль изменён. Войдите с новым паролем" }
```

---

## 6. JWT Middleware

```
function authMiddleware(req):
  token = req.cookies.access_token
  if !token → throw UNAUTHORIZED "Сессия истекла. Войдите снова"
  try:
    payload = jwt.verify(token, secret)
    req.user = { id: payload.id }
  catch TokenExpiredError:
    // Try refresh
    refreshToken = req.cookies.refresh_token
    if !refreshToken → throw UNAUTHORIZED
    refreshPayload = jwt.verify(refreshToken, secret)
    newAccessToken = jwt.sign({ id: refreshPayload.id }, secret, { expiresIn: "15m" })
    set cookie "access_token" = newAccessToken
    req.user = { id: refreshPayload.id }
```

---

## 7. Rate Limiting

```
function checkAuthRateLimit(ip: string):
  key = `auth_attempts:${ip}`
  count = redis.incr(key)
  if count === 1: redis.expire(key, 60)
  if count > 5: throw TOO_MANY_REQUESTS "Слишком много попыток. Подождите минуту"
```
