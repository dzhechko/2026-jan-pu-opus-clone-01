# Completion: Authentication (US-12)

## Deployment and Operational Readiness

### Environment Variables Required

| Variable | Required | Description |
|----------|----------|-------------|
| NEXTAUTH_SECRET | Yes | JWT signing secret (min 32 chars) |
| NEXTAUTH_URL | Yes | App URL (http://localhost:3000) |
| VK_CLIENT_ID | For VK OAuth | VK app ID |
| VK_CLIENT_SECRET | For VK OAuth | VK app secret |
| DATABASE_URL | Yes | PostgreSQL connection |
| REDIS_URL | Yes | Redis for rate limiting |

### Pre-Deployment Checklist

- [ ] NEXTAUTH_SECRET generated (openssl rand -base64 32)
- [ ] VK OAuth app registered at https://dev.vk.com
- [ ] VK redirect URI set: {NEXTAUTH_URL}/api/auth/callback/vk
- [ ] PostgreSQL migrations applied
- [ ] Redis accessible

### Dependencies to Install

```json
{
  "bcryptjs": "^2.4.3",
  "@types/bcryptjs": "^2.4.0"
}
```

### Database Migration

No new migration needed — User model from scaffold already has all required fields (passwordHash, emailVerified, vkId, authProvider).

### Verification Steps

1. Register with email → check user in DB
2. Verify email → check emailVerified=true
3. Login → check JWT cookies set (HttpOnly)
4. VK OAuth → check VK connected + PlatformConnection created
5. Password reset → check new hash in DB
6. Rate limit → send 6 requests, check 429 on 6th

### Monitoring

- Track: registration count, login success/failure ratio, VK OAuth conversion
- Alert: auth failure rate >10%, rate limit triggers >50/hour (possible attack)
