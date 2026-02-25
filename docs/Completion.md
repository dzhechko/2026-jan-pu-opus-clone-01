# КлипМейкер — Completion

## Deployment Plan

### Infrastructure Requirements

| Component | Spec (MVP) | Spec (Scale) | Monthly Cost |
|-----------|-----------|--------------|-------------|
| **VPS (App + Workers)** | 4 vCPU, 8GB RAM, 100GB SSD | 8 vCPU, 16GB RAM, 200GB SSD | 3-6K₽ |
| **PostgreSQL** | Same VPS (Docker) | Managed PostgreSQL | 0₽ → 3K₽ |
| **Redis** | Same VPS (Docker) | Managed Redis | 0₽ → 2K₽ |
| **S3 Storage** | Yandex Object Storage | Same, auto-scaling | 2-5K₽ |
| **Domain + SSL** | Let's Encrypt | Same | 1K₽/year |
| **Cloud.ru AI** | Pay-per-use API | Same + volume discounts | 5-20K₽ |
| **TOTAL (MVP)** | | | **~15-25K₽/мес** |

### Pre-Deployment Checklist

- [ ] All unit tests passing (>80% coverage on core)
- [ ] Integration tests passing (critical flows)
- [ ] E2E tests passing (happy paths)
- [ ] Security audit: input validation, rate limiting, CORS
- [ ] Environment variables documented in `.env.example`
- [ ] Database migrations tested on fresh DB
- [ ] Docker images built and tested locally
- [ ] S3 bucket created and accessible
- [ ] Cloud.ru API key created and tested
- [ ] ЮKassa shop configured (test mode)
- [ ] VK OAuth app registered
- [ ] Domain DNS configured
- [ ] SSL certificate provisioned (Let's Encrypt)
- [ ] Monitoring dashboards created
- [ ] Backup strategy configured
- [ ] Rollback procedure documented and tested

### Deployment Sequence

```
1. PREPARE INFRASTRUCTURE
   - Provision VPS (AdminVPS / HOSTKEY)
   - Install Docker + Docker Compose
   - Configure firewall (UFW: 22, 80, 443 only)
   - Setup SSH key auth (disable password)

2. CONFIGURE SERVICES
   - Copy .env.production to server
   - Create S3 bucket + access keys
   - Register domain, configure DNS (A record → VPS IP)
   - Setup nginx with Let's Encrypt (certbot)

3. DEPLOY APPLICATION
   ssh deploy@server
   git clone repo
   cp .env.production .env
   docker compose -f docker-compose.prod.yml up -d
   docker compose exec web npx prisma migrate deploy
   docker compose exec web npx prisma db seed  # plans, default data

4. VERIFY
   - Health check: GET /api/health → 200
   - Auth flow: register → login → dashboard
   - Upload flow: upload video → process → view clips
   - Billing: test payment via ЮKassa sandbox
   - Auto-post: publish test clip to VK (sandbox)

5. GO LIVE
   - Switch ЮKassa to production mode
   - Enable Cloud.ru billing
   - Remove test data
   - Announce launch
```

### Rollback Procedure

```
# Quick rollback (< 2 min)
ssh deploy@server
cd clipmaker
git log --oneline -5                    # find last good commit
git checkout <last-good-commit>
docker compose -f docker-compose.prod.yml up -d --build

# Database rollback (if migration failed)
docker compose exec web npx prisma migrate resolve --rolled-back <migration>

# Nuclear option (full restore)
docker compose down
pg_restore -d clipmaker backup_YYYYMMDD.sql
git checkout main
docker compose up -d --build
```

---

## CI/CD Configuration

### GitHub Actions Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: clipmaker_test
          POSTGRES_PASSWORD: test
        ports: [5432:5432]
      redis:
        image: redis:7-alpine
        ports: [6379:6379]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/clipmaker_test
      - run: npm run test           # unit + integration
      - run: npm run test:e2e       # playwright
      - run: npm run lint
      - run: npm run typecheck

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: deploy
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/clipmaker
            git pull origin main
            docker compose -f docker-compose.prod.yml build
            docker compose -f docker-compose.prod.yml up -d
            docker compose exec -T web npx prisma migrate deploy
            docker compose exec -T web npm run health-check
```

### Branch Strategy

```
main ← production (auto-deploy)
  └── develop ← staging
        ├── feat/upload-flow
        ├── feat/llm-router
        ├── fix/vk-publish-retry
        └── chore/update-deps
```

---

## Monitoring & Alerting

### Key Metrics

| Metric | Threshold | Alert Channel | Priority |
|--------|-----------|--------------|----------|
| **API response p99** | > 500ms | Telegram bot | 🟡 Warning |
| **API error rate** | > 2% | Telegram bot | 🔴 Critical |
| **Video processing time** | > 5 min (60 min video) | Telegram bot | 🟡 Warning |
| **Queue depth (STT)** | > 20 jobs | Telegram bot | 🟡 Warning |
| **Queue depth (LLM)** | > 20 jobs | Telegram bot | 🟡 Warning |
| **Failed jobs (any worker)** | > 5 in 1 hour | Telegram bot | 🔴 Critical |
| **Disk usage** | > 80% | Telegram bot | 🔴 Critical |
| **CPU usage** | > 90% for 5 min | Telegram bot | 🟡 Warning |
| **Memory usage** | > 85% | Telegram bot | 🟡 Warning |
| **LLM API errors** | > 3 in 10 min | Telegram bot | 🔴 Critical |
| **Payment webhook failures** | Any | Telegram bot | 🔴 Critical |
| **SSL certificate expiry** | < 14 days | Email | 🟡 Warning |

### Monitoring Stack

```
Prometheus (metrics collection)
  ├── Node.js metrics (prom-client)
  ├── PostgreSQL metrics (postgres_exporter)
  ├── Redis metrics (redis_exporter)
  └── Docker metrics (cAdvisor)

Grafana (dashboards)
  ├── Application Dashboard (requests, errors, latency)
  ├── Worker Dashboard (queue depth, processing time, failures)
  ├── AI Dashboard (LLM calls, costs, fallback rate, latency by provider)
  ├── Business Dashboard (signups, uploads, clips, publications)
  └── Infrastructure Dashboard (CPU, RAM, disk, network)

Loki (log aggregation)
  └── Pino JSON logs → Loki → Grafana Explore

Alertmanager → Telegram Bot
```

### Business Metrics Dashboard

| Metric | Source | Refresh |
|--------|--------|---------|
| Daily active users | PostgreSQL | Real-time |
| Videos processed today | PostgreSQL | Real-time |
| Clips generated today | PostgreSQL | Real-time |
| Publications today (by platform) | PostgreSQL | Real-time |
| MRR / ARR | Subscription table | Daily |
| Free-to-paid conversion | Calculated | Daily |
| Churn rate | Subscription cancellations | Weekly |
| Avg processing cost per video | UsageRecord | Daily |
| LLM provider distribution (RU vs Global) | UsageRecord | Daily |

---

## Logging Strategy

### Log Levels

| Level | Usage | Retention |
|-------|-------|-----------|
| **ERROR** | Unhandled exceptions, failed jobs, payment errors | 90 days |
| **WARN** | Rate limits hit, retry attempts, degraded performance | 30 days |
| **INFO** | Video processed, clip created, publication sent | 14 days |
| **DEBUG** | LLM request/response, FFmpeg commands, API calls | 7 days (dev only) |

### Structured Log Format

```json
{
  "level": "info",
  "timestamp": "2026-03-01T12:00:00Z",
  "service": "worker-llm",
  "event": "moment_selection_complete",
  "video_id": "uuid",
  "user_id": "uuid",
  "provider": "cloudru",
  "model": "t-tech/T-pro-it-2.1",
  "tier": 1,
  "input_tokens": 45000,
  "output_tokens": 3200,
  "cost_kopecks": 195,
  "duration_ms": 12400,
  "moments_found": 8
}
```

---

## Handoff Checklists

### For Development Team

- [ ] Repository access (GitHub)
- [ ] `.env.example` with all required variables documented
- [ ] `README.md` with setup instructions
- [ ] `docker compose up` works locally
- [ ] Prisma schema and migrations documented
- [ ] API contracts in Pseudocode.md
- [ ] Architecture diagram in Architecture.md
- [ ] LLM prompt templates in `apps/worker/lib/prompts/`
- [ ] BDD scenarios in Refinement.md

### For QA Team

- [ ] Test environment access (staging VPS)
- [ ] Test accounts (free, start, pro, business plans)
- [ ] ЮKassa sandbox credentials
- [ ] VK test app credentials
- [ ] Cloud.ru test API key
- [ ] BDD scenarios as test plan basis
- [ ] Edge cases matrix for exploratory testing
- [ ] Performance benchmarks as acceptance criteria

### For Operations Team

- [ ] VPS access (SSH key)
- [ ] Docker Compose production config
- [ ] Monitoring dashboards (Grafana URLs)
- [ ] Alert channels configured (Telegram bot)
- [ ] Backup schedule (daily PG dumps to S3)
- [ ] Rollback procedure documented
- [ ] SSL renewal automation (certbot cron)
- [ ] Log access (Grafana Loki)
- [ ] Incident response playbook

---

## Development Timeline

### Phase 1: Foundation (Week 1-2)

| Task | Owner | Status |
|------|-------|--------|
| Monorepo setup (Turborepo, TypeScript, ESLint) | Dev | - |
| Database schema (Prisma) + migrations | Dev | - |
| Auth (NextAuth.js: email + VK OAuth) | Dev | - |
| Docker Compose (local dev environment) | Dev | - |
| CI/CD pipeline (GitHub Actions) | Dev | - |

### Phase 2: Core Pipeline (Week 3-5)

| Task | Owner | Status |
|------|-------|--------|
| Video upload (file + URL + presigned S3) | Dev | - |
| STT integration (Cloud.ru Whisper + OpenAI fallback) | Dev | - |
| LLM Router + provider adapters (Cloud.ru + Global) | Dev | - |
| Moment selection prompts + JSON parsing | Dev | - |
| Virality scoring prompts | Dev | - |
| FFmpeg video processing (reframe, subtitles, watermark) | Dev | - |
| BullMQ workers (STT, LLM, Video) | Dev | - |
| WebSocket progress updates | Dev | - |

### Phase 3: Frontend (Week 5-7)

| Task | Owner | Status |
|------|-------|--------|
| Dashboard (videos list, clips, stats) | Dev | - |
| Video upload UI (drag-drop, URL paste, progress) | Dev | - |
| Clip viewer (preview, virality score, download) | Dev | - |
| Basic clip editor (trim, subtitle edit) | Dev | - |
| Settings (profile, AI provider, integrations) | Dev | - |
| Encrypted KeyVault UI (platform API keys, BYOK) | Dev | - |
| Landing page (hero, pricing, features) | Dev | - |

### Phase 4: Billing + Publishing (Week 7-8)

| Task | Owner | Status |
|------|-------|--------|
| ЮKassa integration (subscriptions, СБП) | Dev | - |
| Plan limits enforcement (minutes, clips, features) | Dev | - |
| VK Клипы auto-post integration | Dev | - |
| Publish worker with retry + rate limiting | Dev | - |
| Publication status tracking | Dev | - |

### Phase 5: Polish + Launch (Week 8-10)

| Task | Owner | Status |
|------|-------|--------|
| E2E tests (Playwright, critical flows) | Dev | - |
| Performance testing (k6) | Dev | - |
| Security audit (OWASP top 10 checklist) | Dev | - |
| Monitoring setup (Prometheus + Grafana) | Dev | - |
| Production deploy + DNS + SSL | Dev | - |
| Staging testing | QA | - |
| Launch 🚀 | Team | - |
