# КлипМейкер — Research Findings

## Executive Summary

Российский рынок AI video clipping находится в фазе формирования с окном возможности 12-18 месяцев. Ни один существующий продукт не объединяет AI-нарезку видео, авто-постинг в российские платформы (VK/Rutube/Дзен), оплату в рублях и интеграцию с GetCourse. SAM оценивается в ~1.5 млрд ₽ ($16M) с 81K потенциальных клиентов. Макротренды (падение YouTube -22%, рост VK Видео x2, стагнация инфобизнеса) создают идеальные условия для запуска.

## Research Objective

Определить жизнеспособность AI video clipping сервиса для российского рынка: размер рынка, конкурентная среда, технологическая реализуемость, целевая аудитория и оптимальная бизнес-модель.

## Methodology

Reverse engineering OpusClip (M1) → Product & Customer analysis (M2) → CJM Prototyping (M2.5) → Market & Competition (M3) → Business & Finance modeling (M4) → Growth strategy (M5). Источники: BuiltWith, SimilarWeb, Crunchbase, Trustpilot, G2, Smart Ranking, VK Company reports, GetCourse статистика, Mediascope, Mordor Intelligence, Grand View Research.

---

## Market Analysis

### Global AI Video Market
- AI Video Market: $3.86B (2024) → $42.3B (2033), CAGR 32.2% [Grand View Research]
- AI Video Editing Tools: $1.6B (2025) → $9.3B (2030), CAGR 42.19% [Virtue Market Research]

### Russian Video Content Ecosystem
- **VK Видео DAU: 42+ млн** (Jan 2026) — стал #1 в России [Mediascope]
- VK Видео авторов: 400,000 (x2 за 2025) [VK Company]
- VK Клипы просмотров/день: 3 млрд (+42% YoY) [VK Company]
- YouTube Russia MAU: 74.9 млн (July 2025), падение с 96 млн (-22%) [Mediascope]
- Rutube MAU: 80.6 млн (Nov 2025) [Mediascope]

### Russian EdTech/Infobusiness
- EdTech рынок: 154 млрд ₽ ($1.7B, 2025), +12% YoY [Smart Ranking]
- **GetCourse GMV: 165+ млрд ₽** ($1.8B, 2024) [GetCourse]
- GetCourse: 50K+ школ, 14K активных, 583K курсов, 21M учеников [GetCourse]
- Активных зарабатывающих авторов: 18,000+ [GetCourse]
- Рост замедляется: 32% (2023) → 19% (2024) → 12% (2025) — школы ищут новые каналы привлечения

### Market Sizing

| Уровень | Размер | Обоснование |
|---------|--------|-------------|
| TAM | $1.6B | AI Video Editing Tools (global, 2025) |
| SAM | ~1.5 млрд ₽ ($16M) | 81K потенциальных клиентов × 18K₽/год |
| SOM Y2 | ~45 млн ₽ ($500K ARR) | 2,500 paid × 1,500₽ avg ARPU |

---

## Competitive Landscape

### Reference Model: OpusClip
- Revenue: ~$20M ARR (Q1 2025), 12M users, ~83K paid [SimilarWeb, Crunchbase]
- Tech: GCP, TypeScript+React, Python+NodeJS, MongoDB, Gemini 1.5 Flash
- Funding: $50M, valuation $215M
- Weakness: Trustpilot 2.4/5 (billing complaints), no Russian platforms, no ₽ payments

### Direct Competitor in Russia: ClipCut.ru
- Format: Telegram-bot (no web/app interface)
- Pricing: 490 / 1,290 / 2,490₽ per month
- Features: Russian subtitles ✅, Virality Score ✅, Auto-cropping ✅
- Missing: Auto-posting ❌, Web interface ❌, Team workspace ❌, GetCourse ❌
- **Validates market demand** — proves Russians pay 490-2490₽/month for AI clipping

### Competitive Matrix

| Feature | OpusClip | ClipCut.ru | КлипМейкер |
|---------|----------|------------|------------|
| AI Clipping | ✅ | ✅ | ✅ |
| Russian subtitles | ~95% | ✅ | ✅ (fine-tuned) |
| VK/Rutube auto-post | ❌ | ❌ | ✅ |
| Ruble payments | ❌ | ✅ | ✅ |
| Web interface | ✅ | ❌ | ✅ |
| Team workspace | ✅ | ❌ | ✅ |
| GetCourse integration | ❌ | ❌ | ✅ |
| CTA constructor | ❌ | ❌ | ✅ |
| Pricing (Pro) | $29/мес | 2,490₽ | 1,990₽ |

---

## Technology Assessment

### AI Pipeline (validated)

| Component | Technology | Cost | Maturity |
|-----------|-----------|------|----------|
| **STT (Speech-to-Text)** | Whisper Large-v3 Turbo | $0.006/min API, self-host at scale | Production-ready |
| **Moment Selection** | Claude/GPT API (LLM scoring) | ~$0.01/min | Production-ready |
| **Video Processing** | FFmpeg + custom reframe | Free (open-source) | Mature |
| **Subtitle Rendering** | FFmpeg ASS/SRT overlay | Free | Mature |
| **Auto-posting** | VK API, Rutube API, Дзен API | Free (rate limits) | Available |

### Key Technical Risks

| Risk | Mitigation | Confidence |
|------|-----------|------------|
| Whisper Russian accuracy | Fine-tune on infobusiness corpus; fallback to GPT-4o Transcribe | High |
| VK API rate limits | Batch posting, queue management | Medium |
| GPU cost scaling | Self-host Whisper at >500 users; Russian cloud (Yandex/Selectel) | High |
| Video processing latency | Pre-process pipeline, parallel FFmpeg workers | High |

---

## User Insights

### Primary Persona: Эксперт-Автор курсов (Сергей, 42)
- GetCourse автор, 5,000 учеников, 2-часовые вебинары
- Pain: 3+ часа на ручную нарезку → хочет 10 минут
- WTP: 1,990₽/мес (ROI 100x: 1 клип → 200 регистраций → продажи курса)
- Aha-момент: «200 регистраций за 3 дня от шортсов»

### Voice of Customer (OpusClip users)
- **Love:** Скорость (5-10 мин vs 2-3 часа), AI момент-селекция, Virality Score
- **Hate:** Dark patterns в billing, clunky editor, плохие русские субтитры

### Critical Unmet Jobs
1. Авто-постинг VK/Rutube/Дзен/Telegram (10/10 importance)
2. Оплата в рублях ЮKassa/СБП/МИР (9/10)
3. 100% точные русские субтитры (8/10)
4. CTA-конструктор для инфобизнеса (8/10)
5. GetCourse UTM tracking (7/10)

---

## Confidence Assessment

### High Confidence (3+ sources)
- YouTube падает в России, VK Видео растёт (Mediascope, VK Company, SimilarWeb)
- GetCourse доминирует в российском инфобизнесе (GetCourse reports, Smart Ranking, отраслевые обзоры)
- Нет прямого конкурента с полным стеком (AI + RU platforms + ₽ + GetCourse)
- Whisper API production-ready для Russian STT (OpenAI docs, benchmarks, GDELT study)

### Medium Confidence (2 sources)
- SAM ~81K потенциальных клиентов (расчёт из GetCourse + VK data)
- Free-to-paid conversion 3-5% (industry benchmarks, ClipCut.ru validates demand)
- VK не будет строить AI clipping в ближайшие 12 мес (inference from VK roadmap + resource allocation)

### Low Confidence (needs validation)
- GetCourse partnership feasibility — требует переговоров
- Точная WTP по тарифам — требует опросов и A/B тестов
- Реальный K-factor viral loops — требует launch data

---

## Sources

1. Grand View Research — AI Video Market Report 2024 [reliability: 9/10]
2. Virtue Market Research — AI Video Editing Tools 2025 [reliability: 8/10]
3. Mediascope — Russian Video Platform Metrics 2025-2026 [reliability: 9/10]
4. VK Company — Annual Reports & Press Releases 2025 [reliability: 9/10]
5. Smart Ranking — Russian EdTech Report 2025 [reliability: 8/10]
6. GetCourse — Platform Statistics & GMV Reports [reliability: 9/10]
7. Crunchbase — OpusClip Funding Data [reliability: 9/10]
8. SimilarWeb — OpusClip Traffic Analysis [reliability: 7/10]
9. Trustpilot / G2 — OpusClip User Reviews [reliability: 7/10]
10. OpenAI — Whisper API Documentation & Pricing [reliability: 10/10]
11. GDELT Project — Whisper vs Chirp Cost Comparison [reliability: 8/10]
12. ClipCut.ru — Telegram Bot Analysis (direct observation) [reliability: 9/10]
