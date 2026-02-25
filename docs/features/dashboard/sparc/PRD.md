# PRD: Dashboard (US-10a)

## Executive Summary

The Dashboard is the primary screen users see after logging in to КлипМейкер. It provides a summary of usage, recent activity, and quick access to core workflows. While a basic dashboard page already exists (`apps/web/app/(dashboard)/dashboard/page.tsx`), it has significant gaps: no pagination, broken auth integration (uses NextAuth instead of custom JWT), missing loading/error states, no thumbnails, and an incomplete empty state. This PRD defines the work required to bring the dashboard to production quality.

## Problem Statement

The current dashboard implementation has 12 identified issues that prevent it from meeting the US-10a specification:

1. **Auth is broken**: The layout calls `getServerSession(authOptions)` from NextAuth, but the project uses custom JWT authentication with `x-user-id` headers set by middleware. The logout button calls NextAuth's `signOut` instead of the custom `/api/auth/logout` endpoint.
2. **No loading states**: Users see a blank screen while data loads. No `loading.tsx` files exist anywhere in the dashboard route group.
3. **No error handling**: No `error.tsx` boundaries exist. Any tRPC failure crashes the page.
4. **No pagination**: The video list fetches 10 items with no way to see more.
5. **Missing visual elements**: No video thumbnails, no colored status badges, no plan usage progress bar, no billing period end date.
6. **Weak empty state**: New users see a minimal prompt instead of a proper onboarding experience with drag-and-drop upload.

These issues result in a dashboard that is non-functional (auth), fragile (no error handling), and incomplete (missing pagination and visual polish).

## Target Users

| Persona | Description |
|---------|-------------|
| Автор курсов (primary) | Online course creator on GetCourse. Records 1-3 hour webinars weekly. Needs to see how many clips were generated, how much of their plan is used, and quickly upload new videos. |
| SMM-менеджер (secondary) | Social media manager who handles posting for multiple course authors. Needs an at-a-glance view of recent activity and video processing status. |

## Core Value Proposition

A fast, reliable dashboard that lets users understand their usage and jump into their primary workflow (upload or review clips) within seconds of logging in. The dashboard is the first impression of the product after every login -- it must load fast, handle errors gracefully, and guide new users to their first upload.

## MVP Features

### F-01: Auth Integration Fix
Replace `getServerSession(authOptions)` in the dashboard layout with reading `x-user-id` and `x-user-email` headers from the middleware-injected custom JWT auth. Replace NextAuth `signOut()` in DashboardNav with a call to `POST /api/auth/logout` that clears `access_token` and `refresh_token` cookies and redirects to `/login`.

### F-02: Dashboard Stats Overview
Display four stat cards:
- **Minutes used**: `minutesUsed / minutesLimit` with a visual progress bar (color changes: green <50%, yellow 50-80%, red >80%)
- **Videos uploaded**: total count from `Video` model
- **Clips generated**: total count from `Clip` model
- **Billing period end**: `subscription.currentPeriodEnd` formatted as `DD.MM.YYYY`

### F-03: Paginated Video List
Replace the current 10-item flat list with offset-based pagination with Prev/Next page controls (10 items per page). Page numbers in URL (`?page=N`). Each row shows:
- Video thumbnail (from `Video.thumbnailUrl`, fallback placeholder if null)
- Title (truncated to 60 chars)
- Status badge (localized Russian label, colored per actual Prisma enum — see F-08)
- Created date (relative: "2 часа назад", "вчера", etc.)
- Clip count for that video

Prev/Next page controls at the bottom with current page indicator.

### F-04: Empty State and Onboarding
When the user has zero videos, replace the video list with:
- Illustration/icon
- Heading: "Загрузите первое видео"
- Subtext: "КлипМейкер превратит ваш вебинар в 10 промо-шортсов за 5 минут"
- Drag-and-drop upload area (reuses `VideoUploader` component)
- Accepts `.mp4`, `.webm`, `.mov` (max 4GB)

### F-05: Loading Skeletons
Add `loading.tsx` to `app/(dashboard)/dashboard/` that renders:
- 4 skeleton stat cards (pulsing rectangles)
- 5 skeleton video list rows (thumbnail placeholder + text lines)

Skeleton must paint within 500ms of navigation start.

### F-06: Error Boundaries
Add `error.tsx` to `app/(dashboard)/dashboard/` that renders:
- Error message: "Не удалось загрузить данные"
- "Попробовать снова" button that calls `reset()`
- Option to report the error

### F-07: Not-Found Page
Add `not-found.tsx` to `app/(dashboard)/` that renders:
- 404 message: "Страница не найдена"
- Link back to dashboard

### F-08: Status Badges
Create a `StatusBadge` component that maps `Video.status` enum values (from actual Prisma schema) to localized Russian labels with colored backgrounds:
| Status | Label | Color |
|--------|-------|-------|
| `uploading` | Загрузка | blue |
| `transcribing` | Транскрибация | blue |
| `analyzing` | Анализ | purple |
| `generating_clips` | Генерация клипов | purple |
| `completed` | Готово | green |
| `failed` | Ошибка | red |

### F-09: Plan Usage Progress Bar
A horizontal progress bar inside the "Minutes used" stat card. Width = `(minutesUsed / minutesLimit) * 100%`. Color thresholds: green (<50%), yellow (50-80%), red (>80%). Show text: `{minutesUsed} из {minutesLimit} мин`.

### F-10: Video Thumbnails
Display `Video.thumbnailUrl` as a 16:9 thumbnail in each video list row. If `thumbnailUrl` is null, show a placeholder with a video icon. Thumbnails are lazy-loaded with `loading="lazy"` and have `aspect-ratio: 16/9`.

### F-11: Billing Period Display
Add a stat card showing `subscription.currentPeriodEnd`. Format: `"до DD.MM.YYYY"`. If no active subscription, show "Бесплатный план".

### F-12: Quick Actions
- "Загрузить видео" button in the dashboard header area (visible on all states, not just empty)
- Links to `/dashboard/upload`

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Dashboard p95 load time | <2s | Lighthouse CI, Web Vitals |
| Skeleton first paint | <500ms | Performance observer |
| Pagination functional | Prev/Next page controls work for users with >10 videos | E2E test |
| Auth integration | No NextAuth references in dashboard code | Code grep |
| Error recovery | Error boundary renders and reset works | E2E test |
| Empty state conversion | >30% of new users upload within first session | Analytics event |

## Out of Scope

| Item | Reason | Tracked In |
|------|--------|------------|
| Analytics dashboard (charts, trends) | Separate user story US-10b | Future PRD |
| Billing management (plan upgrade, payment history) | Separate user story US-09 | `docs/features/billing/` |
| Real-time status updates (WebSocket) | Post-MVP enhancement | Backlog |
| Multi-language support (beyond Russian) | Single-locale MVP | Backlog |
| Dashboard customization (drag widgets) | Over-engineering for MVP | Backlog |
| Notification center | Separate feature | Backlog |

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Custom JWT auth middleware | Exists | Sets `x-user-id`, `x-user-email` headers |
| `/api/auth/logout` endpoint | Exists | Clears cookies, returns 200 |
| tRPC `video.list` procedure | Exists | Needs offset pagination (`skip`/`take`) param added |
| tRPC `user.me` procedure | Exists | Returns user profile + subscription |
| Prisma `Video` model with `thumbnailUrl` | Exists | Field may be null for older videos |
| Prisma `Subscription` model with `currentPeriodEnd` | Exists | Null if free plan |
| `VideoUploader` component | Exists (520 lines) | Reuse for empty state drag-and-drop |

## Technical Constraints

- Next.js 15 App Router with React 19 Server Components by default; `'use client'` only where interactivity is required
- shadcn/ui components + Tailwind for all UI
- tRPC for all data fetching
- Offset-based pagination with Prev/Next page controls (page numbers in URL, better for Server Components and SEO)
- All text in Russian (no i18n framework needed for MVP, hardcoded strings acceptable)
- WCAG 2.1 AA accessibility (color contrast, keyboard navigation, screen reader labels)
