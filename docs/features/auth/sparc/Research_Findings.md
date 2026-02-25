# Research Findings: Authentication (US-12)

## VK OAuth Integration

- VK uses OAuth 2.0 standard flow
- Endpoint: `https://oauth.vk.com/authorize`
- Token endpoint: `https://oauth.vk.com/access_token`
- User info: `https://api.vk.com/method/users.get`
- Required scopes: `video,wall` (minimal for auto-posting)
- VK returns: user_id, first_name, last_name, photo_200, email (if scope includes email)
- VK access tokens expire (need refresh flow)
- NextAuth.js supports custom OAuth providers — can implement VK as custom provider

## NextAuth.js v4 with App Router

- Use route handler at `app/api/auth/[...nextauth]/route.ts`
- JWT strategy (not database sessions) for stateless auth
- Custom callbacks for adding user ID to token/session
- Credentials provider for email/password
- Custom VK provider (not built-in, need to implement)

## bcrypt Performance

- 12 rounds: ~250ms per hash (acceptable for auth)
- Pure JS `bcryptjs` avoids native build issues in Docker Alpine
- Alternative: `argon2` (faster, more secure) — consider for v2

## Rate Limiting Patterns

- Redis INCR with EXPIRE: simple, fast, distributed
- Pattern: `INCR auth_rate:{ip}` + `EXPIRE auth_rate:{ip} 60`
- Check count > 5 → reject
- Auto-resets after TTL
