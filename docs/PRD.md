# КлипМейкер — Product Requirements Document (PRD)

## 1. Product Overview

**Product Name:** КлипМейкер
**Version:** MVP (v0.1)
**Type:** B2B/B2C SaaS, Web Application
**Target Launch:** 60 days from development start

### Vision
Стать стандартным инструментом для создания промо-шортсов из длинного видеоконтента в российской инфобизнес-экосистеме.

### Problem Statement
Авторы онлайн-курсов и контент-криэйторы в России тратят 2-3 часа на ручную нарезку вебинаров в шортсы. Зарубежные AI-инструменты не поддерживают российские платформы, не принимают рубли и плохо работают с русским языком. Существующий российский аналог (ClipCut.ru) — примитивный Telegram-бот без авто-постинга.

### Value Proposition
КлипМейкер за 5 минут превращает 2-часовой вебинар в 10 промо-шортсов с русскими субтитрами и автоматически публикует их в VK Клипы, Rutube, Дзен и Telegram. ROI для автора курсов: 1,990₽/мес → 200+ регистраций → 50,000₽+ продаж.

---

## 2. Target Users

### Primary Persona: Эксперт-Автор курсов
- **Имя:** Сергей, 42 года
- **Профиль:** GetCourse автор, 5,000 учеников, проводит вебинары по 1-2 часа
- **Pain:** Тратит 3+ часов на нарезку и публикацию шортсов
- **Goal:** Автоматизировать создание промо-контента → получить больше студентов
- **WTP:** 1,990₽/мес
- **Aha-момент:** «200 регистраций за 3 дня от шортсов из одного вебинара»

### Secondary Personas
- **Solo-блогер (Маша, 28):** VK/YouTube автор, нужны шортсы быстро, WTP 990₽
- **SMM-агентство (Дмитрий, 35):** обслуживает 10+ клиентов, WTP 4,990₽+

---

## 3. Feature Matrix

### MVP (v0.1) — Month 1-3

| # | Feature | Priority | User Story |
|---|---------|----------|------------|
| F01 | Video Upload (file + URL) | P0 | US-01 |
| F02 | AI Moment Selection | P0 | US-02 |
| F03 | Auto-reframe 16:9 → 9:16 | P0 | US-03 |
| F04 | Russian Subtitles (Whisper) | P0 | US-04 |
| F05 | Virality Score | P0 | US-05 |
| F06 | Clip Editor (trim, subtitle edit) | P0 | US-06 |
| F07 | Download Clips | P0 | US-07 |
| F08 | Auto-post VK Клипы | P0 | US-08 |
| F09 | Freemium Billing (ЮKassa/СБП) | P0 | US-09 |
| F10 | User Dashboard & Analytics | P1 | US-10 |
| F11 | Free Tier with Watermark | P0 | US-11 |
| F12 | Auth (email + VK OAuth) | P0 | US-12 |

### v1.0 — Month 4-6

| # | Feature | Priority |
|---|---------|----------|
| F13 | Auto-post Rutube Shorts | P1 |
| F14 | Auto-post Дзен | P1 |
| F15 | Auto-post Telegram Channel | P1 |
| F16 | CTA Constructor | P1 |
| F17 | Brand Templates (3-5) | P1 |
| F18 | Team Workspace (2-3 seats) | P2 |
| F19 | GetCourse API Integration | P1 |
| F20 | Referral Program | P2 |

### v2.0 — Month 7-12

| # | Feature | Priority |
|---|---------|----------|
| F21 | Content Calendar / Scheduler | P2 |
| F22 | Advanced Analytics Dashboard | P2 |
| F23 | Template Marketplace | P3 |
| F24 | API for Integrators | P2 |
| F25 | White-label for Agencies | P3 |
| F26 | Android App | P3 |

---

## 4. Non-Functional Requirements

### Performance
- Video processing: ≤ 3 minutes for 60 min source video
- Page load: ≤ 2 seconds (p95)
- API response: ≤ 500ms (p99) for non-processing endpoints
- Concurrent video processing: ≥ 10 simultaneous jobs

### Security
- HTTPS everywhere (TLS 1.3)
- OAuth 2.0 + JWT authentication
- Rate limiting: 100 req/min per user
- File upload validation (video formats only, max 4GB)
- User API keys: encrypted IndexedDB (AES-GCM 256-bit), never server-stored
- 152-ФЗ compliance: user data stored on Russian servers

### Scalability
- Horizontal scaling: add GPU workers via Docker Compose
- Support 10,000 free + 500 paid users at launch
- Queue-based processing (Redis/BullMQ) for video jobs
- Object storage for clips (S3-compatible, 30-day retention free, unlimited paid)

### Reliability
- Uptime: 99.5% (26 hours downtime/year allowed)
- Auto-restart on crash (Docker restart policy)
- Job retry: 3 attempts with exponential backoff
- Data backup: daily PostgreSQL dumps

### Localization
- Russian (primary), English (secondary, v2)
- All UI text externalized for i18n
- Date/time in Moscow timezone (UTC+3) by default

### AI Provider Flexibility
- Default: Cloud.ru (RU) — all data processed in RF, 152-ФЗ compliant
- Optional: Global (Gemini/Claude/OpenAI) — user explicitly selects, data residency warning shown
- BYOK (Bring Your Own Key): user can provide own API keys for Global providers
- Provider switch does not affect in-progress video processing
- Cost tracking per provider in usage dashboard

---

## 5. Success Metrics

| Metric | Target (Month 6) | Target (Month 12) |
|--------|-------------------|---------------------|
| Free users | 5,000 | 10,000 |
| Paid users | 200 | 500 |
| MRR | 250K₽ | 600K₽ |
| Free-to-paid conversion | 3% | 5% |
| Monthly churn (paid) | ≤10% | ≤8% |
| NPS (paid users) | >30 | >40 |
| Time-to-first-clip | ≤5 min | ≤3 min |
| Videos processed/day | 50 | 200 |

---

## 6. Constraints

- **Budget:** ~1.5M₽ ($17K) bootstrap to break-even
- **Team:** Founder + 1 developer (min viable)
- **Timeline:** MVP in 60 days
- **Architecture:** Distributed Monolith, Docker Compose, VPS
- **Hosting:** Russian VPS (AdminVPS/HOSTKEY) for 152-ФЗ
- **No mobile app** in MVP (web-first, responsive)
- **No 4K rendering** in MVP (1080p max)
- **No multi-language** subtitles in MVP (Russian only, English v2)

---

## 7. Dependencies

| Dependency | Type | Risk |
|------------|------|------|
| OpenAI Whisper API | External API | Medium (fallback: self-hosted) |
| Claude/GPT API | External API | Medium (fallback: open-source LLM) |
| VK API | Platform API | Low (stable, documented) |
| ЮKassa | Payment Gateway | Low (standard Russian gateway) |
| FFmpeg | Open-source | None (mature, stable) |
| GetCourse API | Platform API | Medium (requires partnership, v1.0) |

---

## 8. Out of Scope (MVP)

- Mobile native apps (Android/iOS)
- AI B-Roll generation
- Multi-speaker detection (>2 speakers)
- Live stream clipping
- Custom AI model training per user
- Offline mode
- White-label / OEM
