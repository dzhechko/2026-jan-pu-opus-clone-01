---
description: Deploy to VPS via SSH and Docker Compose.
  $ARGUMENTS: environment (dev, staging, prod)
---

# /deploy $ARGUMENTS

## Environments
- `dev` — local Docker Compose
- `staging` — VPS staging (if exists)
- `prod` — VPS production

## Steps (prod)
1. Verify all tests pass: `npm run test && npm run lint && npm run typecheck`
2. Build: `docker compose -f docker-compose.prod.yml build`
3. SSH deploy:
   ```bash
   ssh deploy@$VPS_HOST "cd /opt/clipmaker && git pull && docker compose -f docker-compose.prod.yml up -d --build"
   ```
4. Migrate: `docker compose exec web npx prisma migrate deploy`
5. Health check: `curl -f https://clipmaker.ru/api/health`
6. If fail → rollback: `git checkout HEAD~1 && docker compose up -d --build`
7. Tag: `git tag v$(date +%Y%m%d.%H%M) && git push --tags`
