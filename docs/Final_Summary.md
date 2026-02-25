# КлипМейкер — Executive Summary

## Overview

КлипМейкер — AI SaaS-сервис, который за 5 минут превращает 2-часовой вебинар в 10 промо-шортсов с русскими субтитрами и автоматически публикует их в VK Клипы, Rutube, Дзен и Telegram. Первый и единственный продукт на рынке, объединяющий AI video clipping, нативный авто-постинг в российские платформы, оплату в рублях и интеграцию с GetCourse.

## Problem & Solution

**Problem:** Авторы онлайн-курсов в России тратят 2-3 часа на ручную нарезку вебинаров в шортсы. Зарубежные AI-инструменты (OpusClip $29/мес) не поддерживают VK/Rutube, не принимают рубли и плохо работают с русским. Единственный российский аналог — примитивный Telegram-бот без авто-постинга.

**Solution:** PLG freemium SaaS (990-4990₽/мес) с четырёхуровневой AI стратегией на базе Cloud.ru Evolution Foundation Models (T-Pro 2.1 для русского, GLM-4.6 для длинного контекста) + опциональные глобальные провайдеры (Gemini, Claude). Стоимость обработки: 0.34₽/мин — в 7x дешевле начальной оценки.

## Target Users

**Primary:** Эксперт-автор курсов на GetCourse (5,000 учеников, проводит вебинары). WTP: 1,990₽/мес. ROI: 1 клип → 200 регистраций → 50,000₽ продаж.

**Secondary:** Solo-блогеры VK/YouTube (WTP 990₽), SMM-агентства (WTP 4,990₽+).

## Key Features (MVP)

1. **AI Video Clipping** — Whisper STT + LLM moment selection + Virality Score (0-100)
2. **Auto-Reframe** — 16:9 → 9:16 с face tracking + slides split-view
3. **Russian Subtitles** — Whisper Large-v3 с оптимизацией для русского через T-Pro tokenizer
4. **Auto-Post VK Клипы** — нативная публикация + планировщик
5. **Dual AI Provider** — Cloud.ru (РФ, 152-ФЗ) или Global (Gemini/Claude) — выбор пользователя
6. **Freemium Billing** — ЮKassa + СБП, тарифы Free/Start/Pro/Business
7. **Encrypted Key Storage** — AES-GCM 256-bit для API ключей платформ, client-side only

## Technical Approach

- **Architecture:** Distributed Monolith, Monorepo (Turborepo)
- **Tech Stack:** Next.js 15, TypeScript, PostgreSQL 16, Redis 7, BullMQ, FFmpeg 7
- **AI (RU):** Cloud.ru — T-Pro 2.1 (default), GigaChat3-10B (micro), Qwen3-235B (quality), GLM-4.6 (long context), Whisper Large-v3
- **AI (Global):** Gemini 2.0 Flash (default), Flash Lite (micro), Claude Haiku 4.5 (quality), Gemini 2.5 Pro (long context), OpenAI Whisper
- **Deploy:** Docker Compose on Russian VPS (AdminVPS/HOSTKEY)
- **Key Differentiator:** LLM Router с 4 тирами, auto-fallback, per-video cost tracking

## Research Highlights

1. **T-Pro 2.1** — лучшая open-source модель для русского (Cyrillic-dense tokenizer -24% токенов, Arena-Hard-Ru 90.17%, tool-calling на уровне Qwen3-235B)
2. **Cloud.ru Whisper** — 0.005₽/сек, дешевле OpenAI, данные в РФ
3. **Стоимость обработки 60 мин видео: 20.6₽** (было 150₽ по начальной оценке с Gemini)
4. **ClipCut.ru** (Telegram-бот, 490-2490₽/мес) валидирует спрос, но не имеет авто-постинга и веб-интерфейса
5. **Окно возможности 12-18 месяцев** — ни один конкурент не объединяет AI clipping + RU platforms + GetCourse

## Success Metrics

| Metric | Month 6 | Month 12 |
|--------|---------|----------|
| Free users | 5,000 | 10,000 |
| Paid users | 200 | 500 |
| MRR | 250K₽ | 600K₽ |
| Free-to-paid | 3% | 5% |
| Monthly churn | ≤10% | ≤8% |
| NPS | >30 | >40 |
| Processing cost/min | 0.34₽ | 0.25₽ |

## Timeline & Phases

| Phase | Features | Timeline |
|-------|----------|----------|
| **MVP** | Upload, AI clips, subtitles, VK auto-post, billing, dual AI provider | Week 1-10 (60 days) |
| **v1.0** | +Rutube, +Дзен, +Telegram, CTA constructor, templates, GetCourse API | Month 4-6 |
| **v2.0** | Content calendar, advanced analytics, API, team workspace, Android | Month 7-12 |

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| VK builds AI clipping | Deep niche: infobusiness + GetCourse integration |
| Low free-to-paid (<2%) | A/B pricing, aggressive onboarding, limit free tier |
| Cloud.ru downtime | Dual provider strategy — instant switch to Global |
| High churn (>10%) | Scheduler + templates + GetCourse UTM = sticky features |
| Budget overrun | 20.6₽/video cost (7x cheaper than estimated) provides margin |

## Financial Summary

- **Bootstrap:** 1.5M₽ ($17K) to break-even
- **Break-even:** 334 paid users, Month 10
- **Year 1:** 2.8M₽ revenue, -1M₽ net, 7.2M₽ ARR
- **Year 2:** 27M₽ revenue, +16M₽ net, 45M₽ ARR
- **Year 3:** 113M₽ revenue, +75M₽ net, 163M₽ ARR

## Immediate Next Steps

1. **Unzip → cd → claude → /start** — запуск проекта в Claude Code
2. `/plan upload-and-process` — первая фича: загрузка видео и AI pipeline
3. Настроить Cloud.ru API key + ЮKassa sandbox
4. Develop core pipeline (STT → LLM → FFmpeg → clips)
5. Launch MVP → GetCourse community (6,500+) → first 500 free users

## Documentation Package

| Document | Contents |
|----------|----------|
| PRD.md | Product requirements, features, success metrics |
| Solution_Strategy.md | SCQA, First Principles, Game Theory, TRIZ |
| Specification.md | 12 user stories, 30+ Gherkin scenarios, NFRs |
| Pseudocode.md | Data structures, algorithms, API contracts, state machines |
| Architecture.md | System design, tech stack, Docker Compose, monorepo structure |
| Refinement.md | 18 edge cases, testing strategy, BDD scenarios, optimizations |
| Completion.md | Deployment plan, CI/CD, monitoring, handoff checklists, timeline |
| Research_Findings.md | Market data, competitive analysis, 12 sources |
| LLM_Strategy.md | Dual provider architecture, T-Pro analysis, cost comparison |
| Final_Summary.md | This document |
