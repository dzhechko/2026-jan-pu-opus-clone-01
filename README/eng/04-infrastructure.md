# ClipMaker Infrastructure Requirements

## Table of Contents

1. [Deployment Architecture Overview](#1-deployment-architecture-overview)
2. [Server Requirements](#2-server-requirements)
3. [Network Requirements](#3-network-requirements)
4. [Data Storage](#4-data-storage)
5. [External Services](#5-external-services)
6. [Infrastructure Costs](#6-infrastructure-costs)
7. [Scaling by Phase](#7-scaling-by-phase)
8. [Fault Tolerance](#8-fault-tolerance)
9. [Monitoring and Alerting](#9-monitoring-and-alerting)
10. [152-FZ Compliance](#10-152-fz-compliance)

---

## 1. Deployment Architecture Overview

```
                        Internet
                            |
                     [ nginx / SSL ]
                            |
                    [ Next.js Web App ]
                     (port 3000)
                            |
              +-------------+-------------+
              |                           |
         [ PostgreSQL ]            [ Redis 7 ]
         (port 5432)              (port 6379)
                                       |
                    +------------------+------------------+
                    |         |         |                  |
              [worker-stt] [worker-llm] [worker-video] [worker-publish]
                    |         |
              [Cloud.ru AI API]     [ S3 Storage ]
                                         |
                              [Yandex Object Storage]
```

All components are deployed as Docker containers on a single VPS (MVP). When scaling, workers can be moved to dedicated servers.

---

## 2. Server Requirements

### 2.1. Minimum Configuration (up to 500 users)

| Parameter | Value | Notes |
|-----------|-------|-------|
| **CPU** | 4 cores (x86_64) | FFmpeg requires at least 2 cores |
| **RAM** | 8 GB | PostgreSQL: 2 GB, Web: 2 GB, Workers: 4 GB |
| **SSD** | 100 GB NVMe | 50 GB for system + Docker, 50 GB for temp files |
| **OS** | Ubuntu 22.04+ LTS | Or Debian 12+ |

### 2.2. Recommended Configuration (500-2500 users)

| Parameter | Value | Notes |
|-----------|-------|-------|
| **CPU** | 8 cores | 3 video workers in parallel |
| **RAM** | 16 GB | Headroom for peak loads |
| **SSD** | 250 GB NVMe | Space for temporary video files |
| **OS** | Ubuntu 24.04 LTS | Latest LTS |

### 2.3. High Load (2500+ users)

| Parameter | Value | Notes |
|-----------|-------|-------|
| **CPU** | 16+ cores | 5+ video workers in parallel |
| **RAM** | 32 GB | PostgreSQL read replica + PgBouncer |
| **SSD** | 500 GB NVMe | Large video cache |
| **GPU (optional)** | A100 80GB or 2x RTX 4090 | Self-hosted T-Pro 2.1 + Whisper |

### 2.4. Resource Allocation by Container

| Container | CPU (limit) | RAM (limit) | Disk |
|-----------|------------|------------|------|
| web (Next.js) | 1 core | 2 GB | Minimal |
| worker-stt | 0.5 core | 1 GB | Minimal |
| worker-llm | 0.5 core | 1 GB | Minimal |
| worker-video | 2 cores | 4 GB | 50+ GB (temp) |
| worker-publish | 0.25 core | 512 MB | Minimal |
| PostgreSQL | 1 core | 2 GB | 20+ GB |
| Redis | 0.25 core | 512 MB | 1 GB |

**worker-video** is the primary CPU consumer. FFmpeg uses all available cores for parallel rendering.

### 2.5. FFmpeg Requirements

FFmpeg is installed inside the Docker image (Alpine: `apk add ffmpeg`).

Requirements:
- FFmpeg 7.x
- Codecs: libx264, libx265, libvpx, libfdk-aac
- Filters: subtitles, overlay, scale, crop
- Limit: 5-minute timeout per clip render

---

## 3. Network Requirements

### 3.1. Bandwidth

| Direction | Minimum | Recommended | Justification |
|-----------|---------|-------------|---------------|
| **Inbound** | 100 Mbps | 1 Gbps | Video uploads up to 4 GB |
| **Outbound** | 100 Mbps | 1 Gbps | Clip downloads, publishing |
| **Latency to Cloud.ru** | < 50 ms | < 20 ms | AI API calls |
| **Latency to S3** | < 50 ms | < 20 ms | File upload/download |

### 3.2. Open Ports

| Port | Protocol | Purpose | From |
|------|---------|---------|------|
| 22 | TCP | SSH | Admin IP only |
| 80 | TCP | HTTP (redirect to HTTPS) | Internet |
| 443 | TCP | HTTPS | Internet |

Internal ports (Docker network only):

| Port | Service |
|------|---------|
| 3000 | Next.js (web) |
| 5432 | PostgreSQL |
| 6379 | Redis |

### 3.3. DNS

| Record | Type | Value |
|--------|------|-------|
| clipmaker.ru | A | VPS IP |
| www.clipmaker.ru | CNAME | clipmaker.ru |

### 3.4. SSL/TLS

- TLS 1.2+ (TLS 1.3 recommended)
- Certificate: Let's Encrypt (free, auto-renewable)
- HSTS: enabled (max-age=31536000)

---

## 4. Data Storage

### 4.1. PostgreSQL 16

**Purpose:** Primary database -- users, videos, clips, subscriptions, publications.

| Parameter | Value |
|-----------|-------|
| Version | 16-alpine |
| Encoding | UTF-8 |
| shared_buffers | 25% of RAM (512 MB at 2 GB limit) |
| effective_cache_size | 75% of RAM |
| max_connections | 100 (MVP), 200 (at scale) |

**Backups:**
- Daily pg_dump (cron 03:00)
- Retention: 30 days
- Recommended: copy to a separate S3 bucket

### 4.2. Redis 7

**Purpose:** Job queues (BullMQ), session cache, rate limiting.

| Parameter | Value |
|-----------|-------|
| Version | 7-alpine |
| maxmemory | 512 MB |
| maxmemory-policy | allkeys-lru |
| appendonly | yes (AOF persistence) |

### 4.3. S3-Compatible Storage

**Purpose:** Source video files, rendered clips, thumbnails.

| Parameter | Value |
|-----------|-------|
| Provider | Yandex Object Storage / Cloud.ru S3 |
| Region | ru-central-1 |
| Storage class | Standard |
| Bucket | clipmaker |

**Bucket structure:**

```
clipmaker/
  videos/
    <user-id>/
      <video-id>/
        source.mp4          -- Source video
  clips/
    <user-id>/
      <clip-id>/
        clip.mp4             -- Rendered clip
        thumbnail.jpg        -- Thumbnail
```

**Storage volume estimate:**

| Calculation | Value |
|-------------|-------|
| Average video | 500 MB (60 min, 1080p) |
| Average clip | 15 MB (45 sec, 1080p) |
| 10 clips per video | 150 MB clips |
| 100 videos/month | ~65 GB/month (videos + clips) |

**Cleanup policies:**

| Plan | Retention | Auto-cleanup |
|------|-----------|-------------|
| Free | 3 days | S3 Lifecycle Rule |
| Start | 30 days | S3 Lifecycle Rule |
| Pro / Business | 90 days | S3 Lifecycle Rule |

### 4.4. Local Storage (temp)

The worker-video uses local disk for temporary FFmpeg files:

| Operation | Temp Volume | Lifetime |
|-----------|-----------|---------|
| Downloading video from S3 | up to 4 GB | Until processing completes |
| FFmpeg rendering | up to 500 MB/clip | Until S3 upload |
| Subtitle cache | up to 10 MB | Until processing completes |

Recommended temp directory: at least 50 GB free space.

---

## 5. External Services

### 5.1. Cloud.ru Evolution Foundation Models

| Parameter | Value |
|-----------|-------|
| API | OpenAI-compatible |
| Endpoint | https://foundation-models.api.cloud.ru/v1 |
| Models | T-Pro 2.1, GigaChat3-10B, Qwen3-235B, GLM-4.6, Whisper |
| SLA | 99.9% (contractual) |
| Payment | Russian rubles, monthly |
| Registration bonus | 4,000 RUB (individuals), 20,000 RUB (legal entities) |

**AI costs on Cloud.ru:**

| Model | Input (RUB/1M tokens) | Output (RUB/1M tokens) |
|-------|----------------------|------------------------|
| T-Pro 2.1 | ~35 | ~70 |
| GigaChat3-10B | 10 | 10 |
| Qwen3-235B | 17 | ~70 |
| GLM-4.6 | 55 | 220 |
| Whisper Large-v3 | 0.005 RUB/sec | -- |

### 5.2. YooKassa

| Parameter | Value |
|-----------|-------|
| Type | Payment gateway |
| Methods | Bank cards (Visa, MasterCard, MIR), SBP |
| Commission | ~3.5% of transaction |
| Currency | Rubles (RUB) |
| Webhook URL | https://clipmaker.ru/api/billing/webhook |
| Recurring payments | Yes (auto-renewal for subscriptions) |

### 5.3. VK API

| Parameter | Value |
|-----------|-------|
| OAuth | VK ID (OAuth 2.0) |
| Scopes | video, wall, offline |
| Rate limit | 5 requests/sec |
| For auto-posting | VK Clips API |

### 5.4. Other Platforms

| Platform | API | Rate Limit |
|----------|-----|-----------|
| Rutube | REST API | Undocumented |
| Dzen (Zen) | Publisher API | Undocumented |
| Telegram | Bot API | 30 msg/sec |

---

## 6. Infrastructure Costs

### 6.1. Starter Configuration (MVP)

| Component | Provider | Cost/month |
|-----------|---------|-----------|
| VPS 4 CPU / 8 GB / 100 GB | AdminVPS | ~2,000 RUB |
| S3 storage 100 GB | Cloud.ru / Yandex | ~300 RUB |
| Cloud.ru AI (50 videos/month) | Cloud.ru | ~1,000 RUB |
| Domain .ru | reg.ru | ~200 RUB/year |
| SSL | Let's Encrypt | 0 RUB |
| **Total** | | **~3,500 RUB/month** |

### 6.2. Growth Configuration (500+ users)

| Component | Provider | Cost/month |
|-----------|---------|-----------|
| VPS 8 CPU / 16 GB / 250 GB | HOSTKEY | ~5,000 RUB |
| S3 storage 500 GB | Cloud.ru | ~1,500 RUB |
| Cloud.ru AI (500 videos/month) | Cloud.ru | ~10,000 RUB |
| **Total** | | **~16,500 RUB/month** |

### 6.3. Cost Per Video

| Stage | Cost (60 min video) |
|-------|---------------------|
| Transcription (Whisper) | 18 RUB |
| AI Analysis (T-Pro 2.1) | ~2.5 RUB |
| Titles/CTA (GigaChat3) | ~0.1 RUB |
| **Total AI** | **~20.6 RUB** |
| S3 storage (30 days) | ~5 RUB |
| **Grand total** | **~25 RUB** |

**Processing cost: ~0.34 RUB/min of video** (AI only).

---

## 7. Scaling by Phase

### 7.1. Phase 1: Launch (0-500 users)

- 1 VPS, all containers on one server
- Cloud.ru API for AI
- MinIO or Yandex Object Storage for S3

### 7.2. Phase 2: Growth (500-2500 users)

- 2 VPS: application + workers
- Horizontal scaling of video workers
- Self-hosted Whisper (optional, for savings)

### 7.3. Phase 3: Scale (2500+ users)

- Self-hosted LLM on GPU VPS (break-even at 5,000+ videos/month)
- PostgreSQL read replica
- Redis Cluster
- Multiple web instances behind load balancer

---

## 8. Fault Tolerance

### 8.1. Auto-Restart

All Docker containers are configured with `restart: always`.

### 8.2. Retries

BullMQ workers are configured for 3 attempts with exponential backoff:

```
Attempt 1: immediately
Attempt 2: after 30 sec
Attempt 3: after 2 min
```

### 8.3. AI Provider Fallback

```
Cloud.ru unavailable?
  --> If Global strategy enabled: fallback to Gemini/Claude
  --> If RU only: task stays in queue until recovery
```

### 8.4. Target Metrics

| Metric | Target |
|--------|--------|
| Uptime | 99.5% (26 hours downtime/year) |
| Recovery Time (RTO) | < 30 minutes |
| Data Loss (RPO) | < 24 hours (daily backups) |

---

## 9. Monitoring and Alerting

### 9.1. Recommended Monitoring Stack

| Component | Tool | Purpose |
|-----------|------|---------|
| Metrics | Prometheus | Collect CPU, RAM, queue metrics |
| Visualization | Grafana | Dashboards, charts |
| Logs | Pino + Loki | Structured JSON logs |
| Alerts | Grafana Alerting | Telegram notifications |
| Uptime | UptimeRobot (free) | Availability monitoring |

### 9.2. Key Metrics

| Metric | Normal | Critical |
|--------|--------|----------|
| CPU usage | < 60% | > 80% |
| RAM usage | < 70% | > 90% |
| Disk usage | < 70% | > 85% |
| Queue depth (video) | < 10 | > 50 |
| Queue depth (stt) | < 20 | > 100 |
| API response time (p99) | < 500 ms | > 2 sec |
| Error rate (5xx) | < 0.1% | > 1% |
| PostgreSQL connections | < 50 | > 80 |

---

## 10. 152-FZ Compliance

### 10.1. Requirements

Russian Federal Law 152-FZ "On Personal Data" requires:
- Storing personal data of Russian citizens on servers within Russia
- Collecting data only with subject consent
- Notifying Roskomnadzor

### 10.2. How ClipMaker Complies

| Requirement | Implementation |
|-------------|---------------|
| Data storage in Russia | VPS on AdminVPS/HOSTKEY (Russia) |
| Video files in Russia | S3 on Cloud.ru / Yandex Object Storage |
| AI processing in Russia | Cloud.ru (RU strategy) |
| User consent | Consent at registration |
| Encryption | TLS 1.3, AES-GCM 256-bit for keys |

### 10.3. Global Strategy and 152-FZ

When the Global strategy is selected:
- Video files remain in Russia
- Transcripts (text, no PII) are sent abroad for AI processing
- The user explicitly confirms consent when switching
- Data transfer information is displayed in the interface

---

## Dev vs Production Environment Differences

This section outlines the infrastructure differences between development and production deployments.

### Infrastructure Comparison

| Component | Development | Production |
|-----------|-------------|------------|
| **S3 Storage** | MinIO (Docker Compose container, ports 9000/9001) | Cloud.ru Evolution / Yandex Object Storage |
| **S3 Access Mode** | Proxy through `/api/clips/` routes (`NEXT_PUBLIC_USE_S3_PROXY=true`) | Presigned URLs served directly to the browser |
| **Database** | PostgreSQL on `localhost:5432` (exposed to host) | PostgreSQL on `127.0.0.1:5432` (Docker internal only) |
| **Redis** | `redis://localhost:6379` (exposed to host) | `REDIS_URL` env var, bound to `127.0.0.1:6379` |
| **Web Server** | Next.js dev server on port 3000 (no SSL) | nginx reverse proxy with Let's Encrypt SSL |
| **Email** | Ethereal Mail (no SMTP config needed) | Real SMTP server (`SMTP_HOST`, `SMTP_PORT`, etc.) |
| **Container Limits** | No resource limits | Memory and CPU limits per container (e.g., worker-video: 4 GB / 2 CPU) |
| **Restart Policy** | Not enforced | `restart: always` on all containers |
| **Log Output** | `pino-pretty` (colorized) | JSON (for Loki/ELK/Datadog) |

### MinIO vs Cloud.ru / Yandex Object Storage

**Development (MinIO):**
- Included in `docker-compose.yml` as a container.
- API endpoint: `http://minio:9000` (from within Docker) or `http://localhost:9000` (from host).
- Console: `http://localhost:9001` with credentials `minioadmin` / `minioadmin`.
- The `clipmaker` bucket is auto-created by the `minio-init` service on first startup.
- Not publicly accessible -- clip files must be proxied through the API.

**Production (Cloud.ru / Yandex):**
- External managed service with high durability and availability.
- API endpoint: `https://s3.cloud.ru` (or equivalent Yandex endpoint).
- CORS configured to allow direct browser access from the application domain.
- Presigned URLs allow the browser to download clips directly from S3.
- Lifecycle rules handle automatic cleanup based on plan retention policies.

### Docker Compose Dev Profile

The development `docker-compose.yml` includes services not present in production:

| Service | Ports | Purpose |
|---------|-------|---------|
| `minio` | 9000 (API), 9001 (Console) | Local S3-compatible storage |
| `minio-init` | -- | One-shot container that creates the `clipmaker` bucket |

All service ports (PostgreSQL 5432, Redis 6379, MinIO 9000/9001) are exposed to the host machine for easy access with GUI tools like pgAdmin, Redis Insight, and the MinIO Console.

### Localhost Services vs Remote

In development, all services run on the local machine or within the Docker Compose network:

```
Browser --> http://localhost:3000 (Next.js)
            http://localhost:9001 (MinIO Console)
            localhost:5432 (PostgreSQL, via psql or pgAdmin)
            localhost:6379 (Redis, via redis-cli or Redis Insight)
```

In production, external services are remote:

```
Browser --> https://clipmaker.example.com (nginx --> Next.js)
            S3: https://s3.cloud.ru (Cloud.ru / Yandex)
            PostgreSQL: 127.0.0.1:5432 (Docker internal)
            Redis: 127.0.0.1:6379 (Docker internal)
```

### Resource Requirements: Dev vs Prod

| Environment | CPU | RAM | Disk | Network |
|-------------|-----|-----|------|---------|
| **Development** | 2+ cores | 4+ GB | 20 GB | Local only |
| **Production (MVP)** | 4 cores | 8 GB | 100 GB NVMe | 100 Mbps+ |
| **Production (Growth)** | 8 cores | 16 GB | 250 GB NVMe | 1 Gbps |

Development does not require high bandwidth since all services are local. Production requires sufficient bandwidth for video uploads (up to 4 GB) and clip delivery.

### Video Upload Performance: Dev vs Prod

Video upload in the Dev environment (Codespace) is **significantly slower** due to architectural constraints:

| Parameter | Dev (Codespace) | Production (VPS) |
|-----------|-----------------|-------------------|
| **Upload path** | Browser → Next.js API (RAM buffer) → MinIO | Browser → presigned URL → S3 directly |
| **Chunk size** | 14 MB (Codespace proxy ~16 MB limit) | Up to 100 MB |
| **Chunks for 500 MB file** | ~36 HTTP round-trips | ~5 HTTP round-trips |
| **Concurrent chunks** | 3 | 5-6 (configurable) |
| **Buffering** | Double (Next.js + S3) | None (direct upload) |
| **Expected time (500 MB)** | 10-20 min | 1-3 min |

**Root causes:**
1. **Proxy chain** — MinIO at `localhost:9000` is unreachable from the browser; all requests go through `/api/upload`
2. **`arrayBuffer()` buffering** — each chunk is fully loaded into server RAM before forwarding to S3
3. **Codespace proxy** — limits request body size to ~16 MB
4. **No presigned URLs** — due to CORS issues, signature mismatch, and localhost restrictions

> **This is expected dev-environment behavior, not a bug.** In production, all limitations are removed: `NEXT_PUBLIC_USE_S3_PROXY=false` enables direct browser-to-S3 upload via presigned URLs.
