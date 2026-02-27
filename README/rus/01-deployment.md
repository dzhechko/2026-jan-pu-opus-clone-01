# Развертывание КлипМейкер

## Содержание

1. [Требования](#1-требования)
2. [Подготовка сервера](#2-подготовка-сервера)
3. [Клонирование и настройка](#3-клонирование-и-настройка)
4. [Переменные окружения](#4-переменные-окружения)
5. [Docker Compose — разработка](#5-docker-compose--разработка)
6. [Docker Compose — продакшн](#6-docker-compose--продакшн)
7. [Настройка nginx и SSL](#7-настройка-nginx-и-ssl)
8. [Миграции базы данных](#8-миграции-базы-данных)
9. [S3-совместимое хранилище](#9-s3-совместимое-хранилище)
10. [Запуск воркеров](#10-запуск-воркеров)
11. [Проверка работоспособности](#11-проверка-работоспособности)
12. [Обновление и откат](#12-обновление-и-откат)
13. [Резервное копирование](#13-резервное-копирование)
14. [Устранение неполадок](#14-устранение-неполадок)

---

## 1. Требования

### Минимальные системные требования

| Ресурс | Минимум | Рекомендуется |
|--------|---------|---------------|
| CPU | 4 ядра | 8 ядер |
| RAM | 8 ГБ | 16 ГБ |
| SSD | 100 ГБ | 250 ГБ |
| Сеть | 100 Мбит/с | 1 Гбит/с |
| ОС | Ubuntu 22.04+ / Debian 12+ | Ubuntu 24.04 LTS |

### Программное обеспечение

| Компонент | Версия |
|-----------|--------|
| Docker | 24.0+ |
| Docker Compose | v2.20+ |
| Node.js | 20.x LTS (для локальной разработки) |
| Git | 2.40+ |
| nginx | 1.24+ (устанавливается на хосте) |

### Внешние сервисы

| Сервис | Назначение | Обязательный |
|--------|-----------|-------------|
| Cloud.ru | AI-обработка (STT, LLM) | Да (для RU-стратегии) |
| S3-совместимое хранилище | Видеофайлы, клипы | Да |
| ЮKassa | Прием платежей | Да (для биллинга) |
| VK API | OAuth и авто-постинг | Опционально |

---

## 2. Подготовка сервера

### Установка Docker

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка зависимостей
sudo apt install -y ca-certificates curl gnupg lsb-release

# Добавление Docker GPG-ключа
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Добавление репозитория Docker
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Установка Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Добавление текущего пользователя в группу docker
sudo usermod -aG docker $USER
newgrp docker
```

### Настройка файрвола

```bash
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable
```

### Настройка swap (для 8 ГБ RAM)

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 3. Клонирование и настройка

```bash
# Клонирование репозитория
git clone https://github.com/your-org/clipmaker.git /opt/clipmaker
cd /opt/clipmaker

# Копирование .env
cp .env.example .env

# Установка правильных прав
chmod 600 .env
```

---

## 4. Переменные окружения

Отредактируйте файл `.env`, заполнив все обязательные поля:

```bash
# ===== БАЗА ДАННЫХ =====
# PostgreSQL — строка подключения
DATABASE_URL=postgresql://clipmaker:SECURE_PASSWORD@postgres:5432/clipmaker

# ===== REDIS =====
REDIS_URL=redis://redis:6379

# ===== АУТЕНТИФИКАЦИЯ =====
# Секрет NextAuth — сгенерируйте: openssl rand -hex 32
NEXTAUTH_SECRET=ваш_секретный_ключ_32_байта_hex
# URL приложения (продакшн-домен)
NEXTAUTH_URL=https://clipmaker.ru

# ===== ШИФРОВАНИЕ ТОКЕНОВ ПЛАТФОРМ =====
# 64 hex-символа = 32 байта AES-256
# Генерация: openssl rand -hex 32
PLATFORM_TOKEN_SECRET=ваш_ключ_шифрования_64_hex

# ===== VK OAUTH =====
VK_CLIENT_ID=12345678
VK_CLIENT_SECRET=ваш_секрет_vk

# ===== CLOUD.RU AI (серверный ключ, стратегия RU) =====
CLOUDRU_API_KEY=ваш_ключ_cloudru
CLOUDRU_BASE_URL=https://api.cloud.ru/v1

# ===== S3-СОВМЕСТИМОЕ ХРАНИЛИЩЕ =====
S3_ENDPOINT=https://s3.cloud.ru
S3_REGION=ru-central-1
S3_TENANT_ID=ваш_tenant_id
S3_ACCESS_KEY=ваш_access_key
S3_SECRET_KEY=ваш_secret_key
S3_BUCKET=clipmaker

# ===== ЮKASSA ПЛАТЕЖИ =====
YOOKASSA_SHOP_ID=123456
YOOKASSA_SECRET_KEY=ваш_секрет_yookassa

# ===== ГЛОБАЛЬНЫЕ AI-ПРОВАЙДЕРЫ (опционально) =====
# Заполните, если хотите поддерживать Global-стратегию с общими ключами
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
OPENROUTER_API_KEY=

# ===== РЕЖИМ S3 =====
# false — presigned URLs (продакшн)
# true — проксирование через API (разработка)
NEXT_PUBLIC_USE_S3_PROXY=false

# ===== ОКРУЖЕНИЕ =====
NODE_ENV=production
```

### Генерация секретов

```bash
# NextAuth Secret
openssl rand -hex 32

# Platform Token Secret
openssl rand -hex 32

# Пароль PostgreSQL
openssl rand -base64 24
```

---

## 5. Docker Compose — разработка

Для локальной разработки используется `docker-compose.yml` из корня проекта:

```yaml
# docker-compose.yml (разработка)
services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    env_file: .env
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://clipmaker:clipmaker@postgres:5432/clipmaker
      - REDIS_URL=redis://redis:6379
    volumes:
      - .:/app
      - /app/node_modules
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  worker-stt:
    build: .
    command: ["node", "dist/apps/worker/workers/stt.js"]
    env_file: .env
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://clipmaker:clipmaker@postgres:5432/clipmaker
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
    restart: unless-stopped

  worker-llm:
    build: .
    command: ["node", "dist/apps/worker/workers/llm-analyze.js"]
    env_file: .env
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://clipmaker:clipmaker@postgres:5432/clipmaker
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
    restart: unless-stopped

  worker-video:
    build: .
    command: ["node", "dist/apps/worker/workers/video.js"]
    env_file: .env
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://clipmaker:clipmaker@postgres:5432/clipmaker
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
    restart: unless-stopped

  worker-publish:
    build: .
    command: ["node", "dist/apps/worker/workers/publish.js"]
    env_file: .env
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://clipmaker:clipmaker@postgres:5432/clipmaker
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
    restart: unless-stopped

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    volumes:
      - miniodata:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 5s
      retries: 5

  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 minioadmin minioadmin;
      mc mb --ignore-existing local/clipmaker;
      mc anonymous set download local/clipmaker;
      exit 0;
      "

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=clipmaker
      - POSTGRES_USER=clipmaker
      - POSTGRES_PASSWORD=clipmaker
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U clipmaker"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
  redisdata:
  miniodata:
```

Запуск разработки:

```bash
docker compose up -d
docker compose logs -f web
```

---

## 6. Docker Compose — продакшн

Для продакшна создайте файл `docker-compose.prod.yml`:

```yaml
# docker-compose.prod.yml
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

Запуск продакшна:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

---

## 7. Настройка nginx и SSL

### Установка nginx и Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### Конфигурация nginx

Создайте файл `/etc/nginx/sites-available/clipmaker`:

```nginx
# Перенаправление HTTP на HTTPS
server {
    listen 80;
    server_name clipmaker.ru www.clipmaker.ru;
    return 301 https://$server_name$request_uri;
}

# HTTPS
server {
    listen 443 ssl http2;
    server_name clipmaker.ru www.clipmaker.ru;

    # SSL-сертификаты (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/clipmaker.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/clipmaker.ru/privkey.pem;

    # SSL-настройки
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Заголовки безопасности
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # Лимит размера загружаемых файлов (4 ГБ)
    client_max_body_size 4G;

    # Таймауты для загрузки больших файлов
    proxy_connect_timeout 300;
    proxy_send_timeout 300;
    proxy_read_timeout 300;
    send_timeout 300;

    # Проксирование к Next.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Буферизация
        proxy_buffering off;
        proxy_request_buffering off;
    }

    # Кеширование статических ресурсов
    location /_next/static {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Health check endpoint
    location /api/health {
        proxy_pass http://127.0.0.1:3000;
        access_log off;
    }
}
```

### Активация конфигурации и получение SSL-сертификата

```bash
# Активация сайта
sudo ln -s /etc/nginx/sites-available/clipmaker /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# Проверка конфигурации
sudo nginx -t

# Получение SSL-сертификата (сначала временно без SSL)
# 1. Закомментируйте HTTPS-блок в nginx, оставьте только HTTP → proxy_pass
# 2. Получите сертификат:
sudo certbot --nginx -d clipmaker.ru -d www.clipmaker.ru

# 3. Раскомментируйте HTTPS-блок
sudo nginx -t && sudo systemctl reload nginx

# Автоматическое обновление сертификата
sudo systemctl enable certbot.timer
```

---

## 8. Миграции базы данных

```bash
# Первоначальная миграция
docker compose -f docker-compose.prod.yml exec web \
  npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma

# Генерация Prisma Client (если нужно)
docker compose -f docker-compose.prod.yml exec web \
  npx prisma generate --schema=packages/db/prisma/schema.prisma

# Просмотр статуса миграций
docker compose -f docker-compose.prod.yml exec web \
  npx prisma migrate status --schema=packages/db/prisma/schema.prisma
```

---

## 9. S3-совместимое хранилище

### Yandex Object Storage (продакшн)

1. Создайте бакет в Yandex Cloud Console или Cloud.ru
2. Настройте CORS-политику для бакета:

```json
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST"],
      "AllowedOrigins": ["https://clipmaker.ru"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

3. Создайте сервисный аккаунт с правами `storage.editor`
4. Получите access key и secret key

### MinIO (разработка/тестирование)

При использовании MinIO (включен в docker-compose.yml для разработки):

- Endpoint: `http://localhost:9000`
- Консоль: `http://localhost:9001`
- Логин: `minioadmin` / `minioadmin`
- Бакет `clipmaker` создается автоматически через `minio-init`

---

## 10. Запуск воркеров

Воркеры запускаются как отдельные Docker-контейнеры в docker-compose:

| Воркер | Назначение | Ресурсоемкость |
|--------|-----------|---------------|
| `worker-stt` | Транскрибация видео (Whisper) | Низкая (API-вызовы) |
| `worker-llm` | AI-анализ моментов, scoring | Низкая (API-вызовы) |
| `worker-video` | FFmpeg-рендеринг клипов | Высокая (CPU) |
| `worker-publish` | Публикация на платформы | Низкая (API-вызовы) |

### Масштабирование видео-воркеров

Для увеличения параллельной обработки видео:

```bash
docker compose -f docker-compose.prod.yml up -d --scale worker-video=3
```

---

## 11. Проверка работоспособности

```bash
# Проверка всех сервисов
docker compose -f docker-compose.prod.yml ps

# Ожидаемый результат:
# NAME                STATUS
# clipmaker-web       Up (healthy)
# clipmaker-worker-stt    Up
# clipmaker-worker-llm    Up
# clipmaker-worker-video  Up
# clipmaker-worker-publish Up
# clipmaker-postgres  Up (healthy)
# clipmaker-redis     Up (healthy)

# Проверка логов
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.prod.yml logs -f worker-video

# Проверка HTTP-ответа
curl -I https://clipmaker.ru

# Проверка подключения к БД
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U clipmaker -c "SELECT count(*) FROM users;"

# Проверка Redis
docker compose -f docker-compose.prod.yml exec redis redis-cli ping
```

---

## 12. Обновление и откат

### Обновление приложения

```bash
cd /opt/clipmaker

# Получение обновлений
git pull origin main

# Пересборка и перезапуск
docker compose -f docker-compose.prod.yml up -d --build

# Применение миграций
docker compose -f docker-compose.prod.yml exec web \
  npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma

# Проверка
docker compose -f docker-compose.prod.yml ps
```

### Откат к предыдущей версии

```bash
# Просмотр истории коммитов
git log --oneline -10

# Откат к конкретному коммиту
git checkout <commit-hash>

# Пересборка
docker compose -f docker-compose.prod.yml up -d --build
```

---

## 13. Резервное копирование

### Автоматическое резервное копирование PostgreSQL

Создайте скрипт `/opt/clipmaker/scripts/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/opt/clipmaker/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Дамп PostgreSQL
docker compose -f /opt/clipmaker/docker-compose.prod.yml exec -T postgres \
  pg_dump -U clipmaker clipmaker | gzip > "$BACKUP_DIR/clipmaker_$DATE.sql.gz"

# Удаление старых бэкапов (старше 30 дней)
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup completed: clipmaker_$DATE.sql.gz"
```

Добавьте в crontab:

```bash
chmod +x /opt/clipmaker/scripts/backup.sh

# Ежедневный бэкап в 3:00
crontab -e
# 0 3 * * * /opt/clipmaker/scripts/backup.sh >> /var/log/clipmaker-backup.log 2>&1
```

### Восстановление из бэкапа

```bash
gunzip < backups/clipmaker_20260101_030000.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U clipmaker clipmaker
```

---

## 14. Устранение неполадок

### Контейнер не запускается

```bash
# Просмотр логов
docker compose -f docker-compose.prod.yml logs web --tail 50

# Проверка .env
docker compose -f docker-compose.prod.yml config

# Пересборка без кеша
docker compose -f docker-compose.prod.yml build --no-cache web
```

### PostgreSQL не доступен

```bash
# Проверка статуса
docker compose -f docker-compose.prod.yml exec postgres pg_isready -U clipmaker

# Проверка дискового пространства
df -h

# Перезапуск PostgreSQL
docker compose -f docker-compose.prod.yml restart postgres
```

### Redis — переполнение памяти

```bash
# Проверка использования памяти
docker compose -f docker-compose.prod.yml exec redis redis-cli INFO memory

# Очистка устаревших очередей
docker compose -f docker-compose.prod.yml exec redis redis-cli FLUSHDB
```

### Воркеры зависли

```bash
# Перезапуск конкретного воркера
docker compose -f docker-compose.prod.yml restart worker-video

# Просмотр очередей BullMQ
# Используйте Bull Board или подключитесь к Redis CLI:
docker compose -f docker-compose.prod.yml exec redis \
  redis-cli LLEN bull:stt:wait
```

### FFmpeg — ошибки рендеринга

```bash
# Проверка установки FFmpeg внутри контейнера
docker compose -f docker-compose.prod.yml exec worker-video ffmpeg -version

# Проверка доступного места для временных файлов
docker compose -f docker-compose.prod.yml exec worker-video df -h /tmp
```

---

## 🔄 Отличия Dev и Prod сред

### Полная таблица отличий

| Аспект | Dev (разработка) | Prod (продакшн) |
|--------|-----------------|-----------------|
| **NODE_ENV** | `development` | `production` |
| **Base URL** | `http://localhost:3000` | `NEXTAUTH_URL` (env), напр. `https://clipmaker.ru` |
| **S3 хранилище** | MinIO (docker-compose, порты 9000/9001) | Cloud.ru Evolution / Yandex Object Storage |
| **S3 доступ к файлам** | Proxy через `/api/clips/` routes (`NEXT_PUBLIC_USE_S3_PROXY=true`) | Presigned URLs напрямую из S3 |
| **Email** | Ethereal (fake SMTP) -- preview URL в браузере | Настоящий SMTP (`SMTP_HOST`, `SMTP_PORT` и т.д.) |
| **Email-верификация** | Авто-верификация (`process.env.NODE_ENV === 'development'`) | Реальная верификация по ссылке из email |
| **Worker emails** | `console.log` (без реальной отправки) | SMTP отправка |
| **Cookie Secure** | `false` (HTTP localhost), `true` в Codespaces | `true` (HTTPS обязателен) |
| **DB логирование** | `query` + `error` + `warn` (все SQL запросы) | `error` only |
| **Log формат** | `pino-pretty` (цветной, читаемый) | JSON (для агрегации в Loki/ELK) |
| **Prisma Client** | `globalThis` кеширование (hot-reload) | Новый инстанс |
| **Redis** | `redis://localhost:6379` | `REDIS_URL` (env) |
| **OAuth платформ** | Dev-mode заглушка (симулированное подключение) | Реальный OAuth (`VK_PUBLISH_CLIENT_ID`, `YANDEX_CLIENT_ID`) |
| **Платежи (ЮKassa)** | Не работают без `YOOKASSA_SHOP_ID`/`SECRET_KEY` | Полноценная оплата через ЮKassa |
| **Rate limiting** | Одинаковое (100 req/min, 10 uploads/hr) | Одинаковое (100 req/min, 10 uploads/hr) |

### Ключевые переменные окружения: Dev vs Prod

```bash
# ===== DEV (.env для разработки) =====
NODE_ENV=development
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_USE_S3_PROXY=true
DATABASE_URL=postgresql://clipmaker:clipmaker@localhost:5432/clipmaker
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
# YOOKASSA_SHOP_ID=              # не задан -- оплата недоступна
# SMTP_HOST=                      # не задан -- Ethereal fallback

# ===== PROD (.env для продакшна) =====
NODE_ENV=production
NEXTAUTH_URL=https://clipmaker.ru
NEXT_PUBLIC_USE_S3_PROXY=false
DATABASE_URL=postgresql://clipmaker:SECURE_PASSWORD@postgres:5432/clipmaker
REDIS_URL=redis://redis:6379
S3_ENDPOINT=https://s3.cloud.ru
S3_ACCESS_KEY=ваш_access_key
S3_SECRET_KEY=ваш_secret_key
YOOKASSA_SHOP_ID=123456
YOOKASSA_SECRET_KEY=ваш_секрет
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
```

### Docker Compose: Dev vs Prod

| Аспект | `docker-compose.yml` (Dev) | `docker-compose.prod.yml` (Prod) |
|--------|---------------------------|----------------------------------|
| **MinIO** | Включен (порты 9000, 9001) + `minio-init` | Не включен (используется внешний S3) |
| **Порты PostgreSQL** | `5432:5432` (доступен с хоста) | `127.0.0.1:5432:5432` (только localhost) |
| **Порты Redis** | `6379:6379` (доступен с хоста) | `127.0.0.1:6379:6379` (только localhost) |
| **Порты Web** | `3000:3000` (доступен извне) | `127.0.0.1:3000:3000` (только через nginx) |
| **Volumes (код)** | `.:/app` (live-reload) | Нет (образ собирается при деплое) |
| **Restart policy** | `unless-stopped` | `always` |
| **Resource limits** | Не заданы | Заданы (web: 2G, video: 4G, pg: 2G) |
| **Пароль PostgreSQL** | Фиксированный (`clipmaker`) | Из переменной (`${POSTGRES_PASSWORD}`) |
| **Redis maxmemory** | По умолчанию | 512 МБ + `allkeys-lru` |

### Переключение между Dev и Prod

**Запуск Dev-окружения:**

```bash
# Поднимает все сервисы, включая MinIO
docker compose up -d
# Web доступен на http://localhost:3000
# MinIO консоль на http://localhost:9001
```

**Запуск Prod-окружения:**

```bash
# Использует prod-конфигурацию (без MinIO, с лимитами ресурсов)
docker compose -f docker-compose.prod.yml up -d --build
# Web доступен только через nginx (https://clipmaker.ru)
```

**Переключение S3 режима:**

```bash
# Dev: проксирование через API (MinIO не отдаёт presigned URLs корректно)
NEXT_PUBLIC_USE_S3_PROXY=true

# Prod: прямые presigned URLs из S3
NEXT_PUBLIC_USE_S3_PROXY=false
```
