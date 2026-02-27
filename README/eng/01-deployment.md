# ClipMaker Deployment Guide

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone and Install](#2-clone-and-install)
3. [Environment Variables](#3-environment-variables)
4. [Database Setup](#4-database-setup)
5. [Development Mode](#5-development-mode)
6. [Production Deployment](#6-production-deployment)
7. [Nginx and SSL Configuration](#7-nginx-and-ssl-configuration)
8. [S3 Storage Configuration](#8-s3-storage-configuration)
9. [SMTP Configuration](#9-smtp-configuration)
10. [YooKassa Payment Setup](#10-yookassa-payment-setup)
11. [Worker Configuration](#11-worker-configuration)
12. [Health Checks](#12-health-checks)
13. [Upgrades and Rollbacks](#13-upgrades-and-rollbacks)
14. [Backups](#14-backups)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Prerequisites

### System Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 4 cores (x86_64) | 8 cores |
| RAM | 8 GB | 16 GB |
| SSD | 100 GB NVMe | 250 GB NVMe |
| Network | 100 Mbps | 1 Gbps |
| OS | Ubuntu 22.04+ / Debian 12+ | Ubuntu 24.04 LTS |

### Required Software

| Component | Version |
|-----------|---------|
| Docker | 24.0+ |
| Docker Compose | v2.20+ |
| Node.js | 20.x LTS (for local development) |
| Git | 2.40+ |
| nginx | 1.24+ (installed on the host, for production) |

### External Services

| Service | Purpose | Required |
|---------|---------|----------|
| Cloud.ru | AI processing (STT, LLM) | Yes (for RU strategy) |
| S3-compatible storage | Video files, clips | Yes |
| YooKassa | Payment processing | Yes (for billing) |
| VK API | OAuth and auto-posting | Optional |
| SMTP server | Email verification, notifications | Yes |

---

## 2. Clone and Install

### Server Preparation

```bash
# Update the system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y ca-certificates curl gnupg lsb-release

# Install Docker
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add current user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

### Clone the Repository

```bash
git clone https://github.com/your-org/clipmaker.git /opt/clipmaker
cd /opt/clipmaker

# Copy environment file
cp .env.example .env
chmod 600 .env
```

### Install Dependencies (Local Development)

```bash
# Install Node.js 20 (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
nvm use 20

# Install project dependencies (Turborepo monorepo)
npm install
```

### Firewall Setup

```bash
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable
```

### Swap Configuration (for 8 GB RAM servers)

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 3. Environment Variables

Edit `.env` and fill in all required fields:

```bash
# ===== DATABASE =====
DATABASE_URL=postgresql://clipmaker:SECURE_PASSWORD@postgres:5432/clipmaker

# ===== REDIS =====
REDIS_URL=redis://redis:6379

# ===== AUTHENTICATION =====
# NextAuth secret -- generate with: openssl rand -hex 32
NEXTAUTH_SECRET=your_secret_key_32_bytes_hex
# Application URL (production domain)
NEXTAUTH_URL=https://clipmaker.example.com

# ===== PLATFORM TOKEN ENCRYPTION =====
# 64 hex characters = 32 bytes AES-256 key
# Generate with: openssl rand -hex 32
PLATFORM_TOKEN_SECRET=your_encryption_key_64_hex

# ===== VK OAUTH =====
VK_CLIENT_ID=12345678
VK_CLIENT_SECRET=your_vk_client_secret

# ===== CLOUD.RU AI (server-side key, RU strategy) =====
CLOUDRU_API_KEY=your_cloudru_api_key
CLOUDRU_BASE_URL=https://foundation-models.api.cloud.ru/v1

# ===== S3-COMPATIBLE STORAGE =====
S3_ENDPOINT=https://s3.cloud.ru
S3_REGION=ru-central-1
S3_TENANT_ID=your_tenant_id
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key
S3_BUCKET=clipmaker

# ===== YOOKASSA PAYMENTS =====
YOOKASSA_SHOP_ID=123456
YOOKASSA_SECRET_KEY=your_yookassa_secret

# ===== GLOBAL AI PROVIDERS (optional, for shared keys) =====
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
OPENROUTER_API_KEY=

# ===== S3 PROXY MODE =====
# false -- presigned URLs (production, recommended)
# true -- proxy through API (development, Codespace environments)
NEXT_PUBLIC_USE_S3_PROXY=false

# ===== SMTP =====
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@clipmaker.example.com
SMTP_PASS=your_smtp_password
SMTP_FROM=ClipMaker <noreply@clipmaker.example.com>

# ===== ENVIRONMENT =====
NODE_ENV=production
```

### Generating Secrets

```bash
# NextAuth Secret
openssl rand -hex 32

# Platform Token Secret
openssl rand -hex 32

# PostgreSQL Password
openssl rand -base64 24
```

---

## 4. Database Setup

### Initial Migration

```bash
# Using Docker Compose (production)
docker compose -f docker-compose.prod.yml exec web \
  npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma

# Using local Node.js (development)
npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
```

### Generate Prisma Client

```bash
npx prisma generate --schema=packages/db/prisma/schema.prisma
```

### Check Migration Status

```bash
npx prisma migrate status --schema=packages/db/prisma/schema.prisma
```

### Seed Data (Optional)

If a seed script exists:

```bash
npx prisma db seed --schema=packages/db/prisma/schema.prisma
```

### Creating a New Migration (Development)

```bash
npx prisma migrate dev --name describe_your_change --schema=packages/db/prisma/schema.prisma
```

---

## 5. Development Mode

The project uses Docker Compose for local development with all infrastructure services:

```bash
# Start all services (PostgreSQL, Redis, MinIO, workers)
docker compose up -d

# Follow web application logs
docker compose logs -f web

# Or run the web app locally (outside Docker) for hot reload:
npm run dev
```

The development Docker Compose stack includes:

| Service | Port | Purpose |
|---------|------|---------|
| `web` | 3000 | Next.js application |
| `postgres` | 5432 | PostgreSQL 16 database |
| `redis` | 6379 | Redis 7 for queues and cache |
| `minio` | 9000 (API), 9001 (Console) | S3-compatible local storage |
| `worker-stt` | -- | Speech-to-text worker |
| `worker-llm` | -- | LLM analysis worker |
| `worker-video` | -- | FFmpeg video rendering worker |
| `worker-publish` | -- | Platform publishing worker |

MinIO is automatically initialized with a `clipmaker` bucket via the `minio-init` service.

**MinIO Console:** Open `http://localhost:9001` with credentials `minioadmin` / `minioadmin`.

---

## 6. Production Deployment

### Production Docker Compose

Create or use `docker-compose.prod.yml` for production:

```yaml
services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "127.0.0.1:3000:3000"
    env_file: .env
    environment:
      - NODE_ENV=production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: always
    deploy:
      resources:
        limits:
          memory: 2G

  worker-stt:
    build: .
    command: ["node", "dist/apps/worker/workers/stt.js"]
    env_file: .env
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
    restart: always
    deploy:
      resources:
        limits:
          memory: 1G

  worker-llm:
    build: .
    command: ["node", "dist/apps/worker/workers/llm-analyze.js"]
    env_file: .env
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
    restart: always
    deploy:
      resources:
        limits:
          memory: 1G

  worker-video:
    build: .
    command: ["node", "dist/apps/worker/workers/video-render.js"]
    env_file: .env
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
    restart: always
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: "2.0"

  worker-publish:
    build: .
    command: ["node", "dist/apps/worker/workers/publish.js"]
    env_file: .env
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
    restart: always
    deploy:
      resources:
        limits:
          memory: 512M

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=clipmaker
      - POSTGRES_USER=clipmaker
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U clipmaker"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: always
    deploy:
      resources:
        limits:
          memory: 2G

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
    volumes:
      - redisdata:/data
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: always

volumes:
  pgdata:
  redisdata:
```

### Build and Launch

```bash
# Build and start all production services
docker compose -f docker-compose.prod.yml up -d --build

# Run database migrations
docker compose -f docker-compose.prod.yml exec web \
  npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma

# Verify all services are running
docker compose -f docker-compose.prod.yml ps
```

---

## 7. Nginx and SSL Configuration

### Install Nginx and Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### Nginx Configuration

Create `/etc/nginx/sites-available/clipmaker`:

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name clipmaker.example.com www.clipmaker.example.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS
server {
    listen 443 ssl http2;
    server_name clipmaker.example.com www.clipmaker.example.com;

    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/clipmaker.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/clipmaker.example.com/privkey.pem;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # Max upload size (4 GB for video uploads)
    client_max_body_size 4G;

    # Timeouts for large file uploads
    proxy_connect_timeout 300;
    proxy_send_timeout 300;
    proxy_read_timeout 300;
    send_timeout 300;

    # Proxy to Next.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable buffering for real-time features
        proxy_buffering off;
        proxy_request_buffering off;
    }

    # Cache static assets
    location /_next/static {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Health check endpoint (suppressed logging)
    location /api/health {
        proxy_pass http://127.0.0.1:3000;
        access_log off;
    }
}
```

### Enable Configuration and Obtain SSL Certificate

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/clipmaker /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Validate configuration
sudo nginx -t

# Obtain SSL certificate
sudo certbot --nginx -d clipmaker.example.com -d www.clipmaker.example.com

# Reload nginx
sudo nginx -t && sudo systemctl reload nginx

# Enable automatic certificate renewal
sudo systemctl enable certbot.timer
```

---

## 8. S3 Storage Configuration

### Yandex Object Storage / Cloud.ru S3 (Production)

1. Create a bucket in your S3 provider dashboard (name: `clipmaker`).
2. Create a service account with `storage.editor` permissions.
3. Obtain access key and secret key.
4. Configure CORS policy for the bucket:

```json
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST"],
      "AllowedOrigins": ["https://clipmaker.example.com"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

5. Set the S3 variables in `.env`:

```bash
S3_ENDPOINT=https://s3.cloud.ru
S3_REGION=ru-central-1
S3_TENANT_ID=your_tenant_id
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key
S3_BUCKET=clipmaker
```

### MinIO (Development / Testing)

When using MinIO (included in the development `docker-compose.yml`):

- API endpoint: `http://localhost:9000`
- Console: `http://localhost:9001`
- Credentials: `minioadmin` / `minioadmin`
- The `clipmaker` bucket is created automatically by the `minio-init` service.

Set in `.env` for local development:

```bash
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=clipmaker
NEXT_PUBLIC_USE_S3_PROXY=true
```

### S3 Proxy Mode

- **Production:** Set `NEXT_PUBLIC_USE_S3_PROXY=false`. Clip URLs will be presigned S3 URLs served directly to the browser.
- **Development / Codespace:** Set `NEXT_PUBLIC_USE_S3_PROXY=true`. Clips are proxied through the API server (necessary when S3 is not publicly accessible).

---

## 9. SMTP Configuration

ClipMaker sends transactional emails for account verification, password resets, and subscription notifications.

### Production SMTP

Configure a real SMTP provider in `.env`:

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@clipmaker.example.com
SMTP_PASS=your_smtp_password
SMTP_FROM=ClipMaker <noreply@clipmaker.example.com>
```

Recommended providers: Yandex Mail for Domain, Mail.ru for Business, or any SMTP relay.

### Development Mode (Ethereal)

In development (`NODE_ENV=development`), the application uses Ethereal Mail -- a fake SMTP service that captures emails without actually delivering them. No SMTP configuration is needed. Ethereal credentials are generated automatically and logged to the console. View captured emails at the Ethereal web interface URL printed in the logs.

---

## 10. YooKassa Payment Setup

### Create a YooKassa Shop

1. Register at [YooKassa](https://yookassa.ru/).
2. Create a shop and obtain Shop ID and Secret Key.
3. Set the credentials in `.env`:

```bash
YOOKASSA_SHOP_ID=123456
YOOKASSA_SECRET_KEY=your_yookassa_secret_key
```

### Configure Webhooks

In the YooKassa dashboard, set the webhook URL:

- **URL:** `https://clipmaker.example.com/api/webhooks/yookassa`
- **Events:** `payment.succeeded`, `payment.canceled`, `refund.succeeded`

The webhook handler verifies incoming requests, processes payments idempotently, and updates subscription status accordingly.

### Payment Methods

| Method | Description |
|--------|-------------|
| Bank card | Visa, Mastercard, MIR via YooKassa |
| SBP (QR code) | Scan a QR code with your bank app |

### Subscription Plans (Pricing)

| Plan | Monthly Price | Minutes/Month | Clips/Video | Watermark | Auto-posting |
|------|---------------|---------------|-------------|-----------|--------------|
| Free | 0 | 30 | 3 | Yes | No |
| Start | 990 RUB | 120 | 10 | No | VK |
| Pro | 2,990 RUB | 1,000 | 100 | No | VK, Rutube, Dzen, Telegram |
| Business | 9,990 RUB | Unlimited | 100 | No | VK, Rutube, Dzen, Telegram |

Extra minutes: 15 RUB/min (Start plan and above).

---

## 11. Worker Configuration

Workers are BullMQ job processors that run as separate Docker containers, all communicating through Redis.

### Worker Types

| Worker | Docker Service | Purpose | Resource Usage |
|--------|---------------|---------|----------------|
| STT | `worker-stt` | Speech-to-text transcription (dispatches to Cloud.ru Whisper or OpenAI) | Low (API calls) |
| LLM | `worker-llm` | AI analysis -- moment selection, virality scoring, titles | Low (API calls) |
| Video | `worker-video` | FFmpeg rendering -- reframe, subtitles, watermark | High (CPU-bound) |
| Publish | `worker-publish` | Publishes clips to VK, Rutube, Dzen, Telegram | Low (API calls) |
| Billing Cron | `worker-billing-cron` | Auto-renewal, subscription expiry, downgrades | Minimal |

### BullMQ Queue Names

| Queue | Description |
|-------|-------------|
| `stt` | Transcription jobs |
| `llm-analyze` | AI moment selection and scoring |
| `video-render` | FFmpeg clip rendering |
| `publish` | Platform publishing |
| `billing-cron` | Repeatable billing job (runs daily) |

### Scaling Video Workers

The video worker is the primary CPU bottleneck. To increase parallel processing:

```bash
docker compose -f docker-compose.prod.yml up -d --scale worker-video=3
```

### Redis Connection

All workers connect to the same Redis instance specified by `REDIS_URL`. In production, Redis should be configured with AOF persistence:

```bash
redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
```

### Retry Configuration

All BullMQ workers retry failed jobs up to 3 times with exponential backoff:

- Attempt 1: Immediate
- Attempt 2: After 30 seconds
- Attempt 3: After 2 minutes

---

## 12. Health Checks

### Verify All Services

```bash
# Check service status
docker compose -f docker-compose.prod.yml ps

# Expected output:
# NAME                     STATUS
# clipmaker-web            Up (healthy)
# clipmaker-worker-stt     Up
# clipmaker-worker-llm     Up
# clipmaker-worker-video   Up
# clipmaker-worker-publish Up
# clipmaker-postgres       Up (healthy)
# clipmaker-redis          Up (healthy)
```

### HTTP Health Check

```bash
curl -I https://clipmaker.example.com
# Should return 200 OK
```

### Database Connectivity

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U clipmaker -c "SELECT count(*) FROM users;"
```

### Redis Connectivity

```bash
docker compose -f docker-compose.prod.yml exec redis redis-cli ping
# Should return: PONG
```

### Queue Status

```bash
docker compose -f docker-compose.prod.yml exec redis redis-cli

LLEN bull:stt:wait
LLEN bull:llm-analyze:wait
LLEN bull:video-render:wait
LLEN bull:publish:wait
```

---

## 13. Upgrades and Rollbacks

### Upgrading the Application

```bash
cd /opt/clipmaker

# Pull latest changes
git pull origin main

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build

# Apply database migrations
docker compose -f docker-compose.prod.yml exec web \
  npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma

# Verify
docker compose -f docker-compose.prod.yml ps
```

### Rolling Back

```bash
# View commit history
git log --oneline -10

# Checkout a specific version
git checkout <commit-hash>

# Rebuild
docker compose -f docker-compose.prod.yml up -d --build
```

---

## 14. Backups

### Automated PostgreSQL Backups

Create `/opt/clipmaker/scripts/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/opt/clipmaker/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Dump PostgreSQL
docker compose -f /opt/clipmaker/docker-compose.prod.yml exec -T postgres \
  pg_dump -U clipmaker clipmaker | gzip > "$BACKUP_DIR/clipmaker_$DATE.sql.gz"

# Remove backups older than 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup completed: clipmaker_$DATE.sql.gz"
```

Schedule with cron:

```bash
chmod +x /opt/clipmaker/scripts/backup.sh

# Run daily at 3:00 AM
crontab -e
# 0 3 * * * /opt/clipmaker/scripts/backup.sh >> /var/log/clipmaker-backup.log 2>&1
```

### Restoring from Backup

```bash
gunzip < backups/clipmaker_20260101_030000.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U clipmaker clipmaker
```

---

## 15. Troubleshooting

### Container Fails to Start

```bash
# View logs
docker compose -f docker-compose.prod.yml logs web --tail 50

# Validate .env parsing
docker compose -f docker-compose.prod.yml config

# Rebuild without cache
docker compose -f docker-compose.prod.yml build --no-cache web
```

### PostgreSQL Unavailable

```bash
docker compose -f docker-compose.prod.yml exec postgres pg_isready -U clipmaker
df -h  # Check disk space
docker compose -f docker-compose.prod.yml restart postgres
```

### Redis Memory Overflow

```bash
docker compose -f docker-compose.prod.yml exec redis redis-cli INFO memory
# As a last resort, flush queues (will lose pending jobs):
docker compose -f docker-compose.prod.yml exec redis redis-cli FLUSHDB
```

### Workers Stuck

```bash
# Restart a specific worker
docker compose -f docker-compose.prod.yml restart worker-video

# Check queue lengths
docker compose -f docker-compose.prod.yml exec redis redis-cli LLEN bull:video-render:wait
```

### FFmpeg Rendering Errors

```bash
# Verify FFmpeg is installed in the container
docker compose -f docker-compose.prod.yml exec worker-video ffmpeg -version

# Check available disk space for temp files
docker compose -f docker-compose.prod.yml exec worker-video df -h /tmp
```

---

## Dev vs Production Environment Differences

This section provides a comprehensive comparison of how ClipMaker behaves in development (`NODE_ENV=development`) versus production (`NODE_ENV=production`).

### Full Comparison Table

| Feature | Development | Production |
|---------|-------------|------------|
| **NODE_ENV** | `development` | `production` |
| **Base URL** | `http://localhost:3000` | `NEXTAUTH_URL` (env var, e.g. `https://clipmaker.example.com`) |
| **S3 Storage** | MinIO (Docker Compose, ports 9000 API / 9001 Console) | Cloud.ru Evolution / Yandex Object Storage |
| **S3 Access** | Proxy via `/api/clips/` routes (`NEXT_PUBLIC_USE_S3_PROXY=true`) | Presigned URLs directly from S3 |
| **Email** | Ethereal (fake SMTP) -- browser preview URL logged to console | Real SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) |
| **Cookie Secure** | `false` (HTTP on localhost), `true` in Codespaces | `true` (HTTPS required) |
| **DB Logging** | `query` + `error` + `warn` (all SQL queries visible) | `error` only |
| **Log Format** | `pino-pretty` (colorized, human-readable) | JSON (for log aggregation tools like Loki) |
| **Prisma Client** | `globalThis` caching (survives hot-reload) | Fresh instance per request |
| **Redis** | `redis://localhost:6379` | `REDIS_URL` (env var) |
| **Platform OAuth** | Dev-mode simulation (fake connections) | Real OAuth (`VK_PUBLISH_CLIENT_ID`, `YANDEX_CLIENT_ID`) |
| **Email Verification** | Auto-verified (`NODE_ENV === 'development'`) | Real verification via email link |
| **Payments (YooKassa)** | Non-functional without `YOOKASSA_SHOP_ID` / `SECRET_KEY` | Full YooKassa payment processing |
| **Worker Emails** | `console.log` (no real delivery) | SMTP delivery |
| **Rate Limiting** | Same in both environments | Same in both environments |

### Environment Variable Differences

Below is a side-by-side comparison of key `.env` values:

```bash
# ===== DEVELOPMENT .env =====
NODE_ENV=development
NEXTAUTH_URL=http://localhost:3000
DATABASE_URL=postgresql://clipmaker:clipmaker@localhost:5432/clipmaker
REDIS_URL=redis://localhost:6379

# MinIO (local S3)
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=clipmaker
NEXT_PUBLIC_USE_S3_PROXY=true

# SMTP -- not required (Ethereal auto-generates credentials)
# SMTP_HOST=
# SMTP_PORT=
# SMTP_USER=
# SMTP_PASS=

# Payments -- not required for dev
# YOOKASSA_SHOP_ID=
# YOOKASSA_SECRET_KEY=
```

```bash
# ===== PRODUCTION .env =====
NODE_ENV=production
NEXTAUTH_URL=https://clipmaker.example.com
DATABASE_URL=postgresql://clipmaker:SECURE_PASSWORD@postgres:5432/clipmaker
REDIS_URL=redis://redis:6379

# Cloud.ru / Yandex Object Storage
S3_ENDPOINT=https://s3.cloud.ru
S3_REGION=ru-central-1
S3_TENANT_ID=your_tenant_id
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key
S3_BUCKET=clipmaker
NEXT_PUBLIC_USE_S3_PROXY=false

# Real SMTP
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@clipmaker.example.com
SMTP_PASS=your_smtp_password
SMTP_FROM=ClipMaker <noreply@clipmaker.example.com>

# Real payments
YOOKASSA_SHOP_ID=123456
YOOKASSA_SECRET_KEY=your_yookassa_secret_key
```

### Docker Compose: Dev vs Prod

**Development** (`docker-compose.yml`):
- Includes MinIO with auto-created `clipmaker` bucket via `minio-init` service.
- MinIO Console accessible at `http://localhost:9001` (credentials: `minioadmin` / `minioadmin`).
- PostgreSQL and Redis ports exposed to localhost for debugging tools.
- No resource limits on containers.
- No nginx -- Next.js serves directly on port 3000.

**Production** (`docker-compose.prod.yml`):
- No MinIO -- uses external Cloud.ru / Yandex Object Storage.
- PostgreSQL and Redis ports bound to `127.0.0.1` only (not exposed to the internet).
- Container resource limits enforced (e.g., `worker-video`: 4 GB RAM, 2 CPU cores).
- nginx on the host handles SSL termination and reverse proxy.
- All containers configured with `restart: always`.

### Switching Between Modes

To switch from development to production:

1. Update `.env` with production values (see the comparison above).
2. Replace `docker-compose.yml` with `docker-compose.prod.yml` in all commands.
3. Set `NEXT_PUBLIC_USE_S3_PROXY=false` and configure real S3 credentials.
4. Configure real SMTP credentials for email delivery.
5. Set up YooKassa credentials for payment processing.
6. Set up real VK and Yandex OAuth applications with public redirect URIs.
7. Deploy nginx with SSL (see Section 7).
