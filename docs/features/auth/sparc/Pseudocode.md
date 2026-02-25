# Auth Feature — Pseudocode

## Design Decisions (resolved contradictions)

- **VK OAuth scopes:** Profile-only for auth. `video`/`wall` scopes requested later when user connects VK for publishing.
- **SameSite cookies:** `Lax` (not `Strict`) — required for VK OAuth redirect callbacks.
- **Unverified email login:** Blocked (403). Users must verify email before accessing the app.
- **VK token storage:** Server-side encryption via `PlatformConnection.access_token_encrypted`. Exception to client-side-only rule because OAuth tokens are obtained server-side during callback.
- **Verification tokens:** JWT-based (no database table). Expiry handles invalidation.
- **Rate limiting:** 60-second sliding window (INCR + TTL), 5 attempts/min per IP. No extended lockout in MVP.

---

## Zod Validation Schemas

```typescript
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(1, "Имя обязательно").max(100, "Имя слишком длинное"),
  email: z.string().email("Некорректный email"),
  password: z.string().min(8, "Минимум 8 символов").max(128, "Максимум 128 символов"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Пароли не совпадают",
  path: ["confirmPassword"],
});

const loginSchema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(1, "Пароль обязателен"),
  rememberMe: z.boolean().optional().default(false),
});

const resetPasswordSchema = z.object({
  email: z.string().email("Некорректный email"),
});

const newPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Минимум 8 символов").max(128, "Максимум 128 символов"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Пароли не совпадают",
  path: ["confirmPassword"],
});
```

---

## 1. Registration Flow

```
function register(input: RegisterInput):
  validate(input) with registerSchema
  checkRateLimit("register", ip, limit=3, window=3600) → throw 429 if exceeded
  normalizedEmail = input.email.trim().toLowerCase()
  check if email exists → throw CONFLICT "Email уже зарегистрирован" (409)
  hash = bcrypt.hash(input.password, 12)
  user = prisma.user.create({
    email: normalizedEmail,
    name: input.name,
    passwordHash: hash,
    planId: "free",
    minutesLimit: 30,
    llmProviderPreference: "ru",
    emailVerified: false,
  })
  token = jwt.sign({ userId: user.id, email: user.email, purpose: "email_verification" }, NEXTAUTH_SECRET, { expiresIn: "24h" })
  sendVerificationEmail(user.email, token) // async — console.log placeholder in MVP
  return { message: "Проверьте почту для подтверждения" }
```

---

## 2. Email Verification

```
function verifyEmail(token: string):
  payload = jwt.verify(token, NEXTAUTH_SECRET) → throw BAD_REQUEST "Ссылка устарела" if expired/invalid
  if payload.purpose !== "email_verification" → throw BAD_REQUEST "Недействительная ссылка"
  user = prisma.user.findUnique({ where: { id: payload.userId } })
  if !user → throw BAD_REQUEST
  if user.emailVerified → redirect to /login (idempotent, no error)
  prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } })
  redirect to /login?verified=true with flash message "Email подтверждён. Войдите в аккаунт"
```

---

## 3. Login Flow

```
function login(input: LoginInput):
  validate(input) with loginSchema
  checkRateLimit("login", ip, limit=5, window=60) → throw 429 "Слишком много попыток. Подождите минуту"
  normalizedEmail = input.email.trim().toLowerCase()
  user = prisma.user.findUnique({ where: { email: normalizedEmail } })
  if !user || !user.passwordHash → throw UNAUTHORIZED "Неверный email или пароль" (401)
  if !user.emailVerified → throw FORBIDDEN "Подтвердите email для входа" (403)
  valid = bcrypt.compare(input.password, user.passwordHash)
  if !valid → throw UNAUTHORIZED "Неверный email или пароль" (401)

  refreshExpiry = input.rememberMe ? "30d" : "7d"
  accessToken = jwt.sign(
    { id: user.id, email: user.email, planId: user.planId, role: "user" },
    NEXTAUTH_SECRET,
    { expiresIn: "15m" }
  )
  refreshToken = jwt.sign(
    { id: user.id, type: "refresh" },
    NEXTAUTH_SECRET,
    { expiresIn: refreshExpiry }
  )

  set HttpOnly cookie "access_token" (maxAge=900, Secure, SameSite=Lax, Path=/)
  set HttpOnly cookie "refresh_token" (maxAge=refreshExpiry, Secure, SameSite=Lax, Path=/api/auth)
  return { user: { id, email, name, planId } }
```

---

## 4. Logout Flow

```
function logout(req):
  clear cookie "access_token" (Path=/)
  clear cookie "refresh_token" (Path=/api/auth)
  redirect to /login
```

Note: Refresh tokens are JWT-based (stateless) in MVP. No server-side revocation. Token rotation and DB-backed revocation planned for v2.

---

## 5. VK OAuth Flow

```
function vkOAuthCallback(code: string, state: string, errorParam?: string):
  // Check if user cancelled VK OAuth (VK sends error=access_denied)
  if errorParam === "access_denied":
    redirect to /login?error=vk_cancelled
    // Display: "VK авторизация отменена"
    return

  // Rate limit VK OAuth attempts
  checkRateLimit("vk_oauth", ip, limit=10, window=60) → throw 429 if exceeded

  // Validate state to prevent CSRF
  if !isValidOAuthState(state) → throw BAD_REQUEST

  try:
    vkTokenResponse = exchangeCodeForToken(code)
    // Scopes: profile only for auth. video/wall requested separately for publishing.
    vkProfile = fetchVkProfile(vkTokenResponse.access_token)
    // vkProfile: { id, first_name, last_name, email? (may be null), photo_200 }
  catch error:
    log.error("auth.vk.error", { error: error.message })
    redirect to /login?error=vk_unavailable
    // Display: "Сервис VK временно недоступен. Попробуйте позже"
    return

  vkId = String(vkProfile.id)
  vkName = `${vkProfile.first_name} ${vkProfile.last_name}`.trim()
  vkEmail = vkProfile.email?.trim().toLowerCase() || null

  // 1. Find by VK ID (returning user)
  existingByVk = prisma.user.findUnique({ where: { vkId } })
  if existingByVk:
    updatePlatformConnection(existingByVk.id, vkTokenResponse)
    createJwtSession(existingByVk)
    redirect to /dashboard
    return

  // 2. Find by email (account linking)
  if vkEmail:
    existingByEmail = prisma.user.findUnique({ where: { email: vkEmail } })
    if existingByEmail:
      prisma.user.update({ where: { id: existingByEmail.id }, data: { vkId, authProvider: "vk", avatarUrl: vkProfile.photo_200 } })
      upsertPlatformConnection(existingByEmail.id, vkTokenResponse)
      createJwtSession(existingByEmail)
      redirect to /dashboard
      return

  // 3. New user
  user = prisma.user.create({
    data: {
      email: vkEmail,  // May be null — if null, prompt for email on first dashboard visit
      name: vkName,
      vkId: vkId,
      avatarUrl: vkProfile.photo_200,
      authProvider: "vk",
      emailVerified: true,  // VK OAuth implies verified identity
      planId: "free",
      minutesLimit: 30,
      llmProviderPreference: "ru",
    }
  })
  upsertPlatformConnection(user.id, vkTokenResponse)
  createJwtSession(user)
  redirect to /dashboard

function upsertPlatformConnection(userId: string, vkTokenResponse):
  prisma.platformConnection.upsert({
    where: { userId_platform: { userId, platform: "vk" } },
    create: {
      userId,
      platform: "vk",
      accessTokenEncrypted: serverEncrypt(vkTokenResponse.access_token),
      refreshTokenEncrypted: vkTokenResponse.refresh_token ? serverEncrypt(vkTokenResponse.refresh_token) : null,
      expiresAt: new Date(Date.now() + vkTokenResponse.expires_in * 1000),
    },
    update: {
      accessTokenEncrypted: serverEncrypt(vkTokenResponse.access_token),
      refreshTokenEncrypted: vkTokenResponse.refresh_token ? serverEncrypt(vkTokenResponse.refresh_token) : null,
      expiresAt: new Date(Date.now() + vkTokenResponse.expires_in * 1000),
    },
  })
```

---

## 6. Password Reset

```
function requestPasswordReset(input: ResetPasswordInput):
  validate(input) with resetPasswordSchema
  checkRateLimit("reset", input.email, limit=3, window=3600) → throw 429 if exceeded
  normalizedEmail = input.email.trim().toLowerCase()
  user = prisma.user.findUnique({ where: { email: normalizedEmail } })
  // Always return success (prevent email enumeration)
  if user:
    token = jwt.sign({ userId: user.id, purpose: "password_reset" }, NEXTAUTH_SECRET, { expiresIn: "1h" })
    sendPasswordResetEmail(user.email, token) // async — console.log placeholder in MVP
  return { message: "Если аккаунт существует, мы отправили ссылку для сброса пароля" }

function resetPassword(input: NewPasswordInput):
  validate(input) with newPasswordSchema
  payload = jwt.verify(input.token, NEXTAUTH_SECRET) → throw BAD_REQUEST "Ссылка устарела или недействительна"
  if payload.purpose !== "password_reset" → throw BAD_REQUEST "Недействительная ссылка"
  hash = bcrypt.hash(input.password, 12)
  prisma.user.update({ where: { id: payload.userId }, data: { passwordHash: hash } })
  // Note: JWT refresh tokens are stateless — cannot individually revoke in MVP.
  // In v2, implement DB-backed refresh tokens and delete all for this userId.
  return { message: "Пароль изменён. Войдите с новым паролем" }
```

---

## 7. JWT Middleware

```
function authMiddleware(req):
  token = req.cookies.access_token
  if !token:
    // Try refresh flow
    return tryRefresh(req)

  try:
    payload = jwt.verify(token, NEXTAUTH_SECRET, { clockTolerance: 30 })
    req.user = { id: payload.id, email: payload.email, planId: payload.planId, role: payload.role }
  catch TokenExpiredError:
    return tryRefresh(req)
  catch JsonWebTokenError:
    // Tampered token
    clearAuthCookies(res)
    redirect to /login

function tryRefresh(req):
  refreshToken = req.cookies.refresh_token
  if !refreshToken → redirect to /login
  try:
    refreshPayload = jwt.verify(refreshToken, NEXTAUTH_SECRET, { clockTolerance: 30 })
    if refreshPayload.type !== "refresh" → throw Error
    // Issue new access token
    user = prisma.user.findUnique({ where: { id: refreshPayload.id } })
    if !user → redirect to /login
    newAccessToken = jwt.sign(
      { id: user.id, email: user.email, planId: user.planId, role: "user" },
      NEXTAUTH_SECRET,
      { expiresIn: "15m" }
    )
    set cookie "access_token" = newAccessToken (maxAge=900, Secure, SameSite=Lax, Path=/)
    req.user = { id: user.id, email: user.email, planId: user.planId, role: "user" }
  catch:
    clearAuthCookies(res)
    redirect to /login
```

---

## 8. Rate Limiting

```
function checkRateLimit(scope: string, key: string, limit: number, window: number):
  redisKey = `ratelimit:${scope}:${key}`
  count = redis.incr(redisKey)
  if count === 1:
    redis.expire(redisKey, window)
  if count > limit:
    ttl = redis.ttl(redisKey)
    throw TOO_MANY_REQUESTS {
      message: "Слишком много попыток. Подождите минуту",
      retryAfter: ttl,  // Retry-After header value
    }

// Rate limit configurations:
// - login:    5 attempts per 60s per IP
// - register: 3 attempts per 3600s (1 hour) per IP
// - reset:    3 attempts per 3600s (1 hour) per email
// - vk_oauth: 10 attempts per 60s per IP
```

---

## 9. Helper: Create JWT Session

```
function createJwtSession(user, rememberMe = false):
  refreshExpiry = rememberMe ? "30d" : "7d"
  accessToken = jwt.sign(
    { id: user.id, email: user.email, planId: user.planId, role: "user" },
    NEXTAUTH_SECRET,
    { expiresIn: "15m" }
  )
  refreshToken = jwt.sign(
    { id: user.id, type: "refresh" },
    NEXTAUTH_SECRET,
    { expiresIn: refreshExpiry }
  )
  set HttpOnly cookie "access_token" (maxAge=900, Secure, SameSite=Lax, Path=/)
  set HttpOnly cookie "refresh_token" (maxAge=refreshExpiry, Secure, SameSite=Lax, Path=/api/auth)
```
