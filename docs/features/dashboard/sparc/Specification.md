# Specification: Dashboard (US-10a)

## Overview

This specification defines 6 user stories that together deliver the complete dashboard feature for КлипМейкер. Each story includes Gherkin scenarios and acceptance criteria. Stories are ordered by dependency: DS-05 (auth fix) must be completed first, as all other stories depend on a working auth layer.

---

## User Stories

### DS-01: Dashboard Stats Overview

**As a** content creator,
**I want to** see a summary of my plan usage, video count, clip count, and billing period end date on the dashboard,
**So that** I can track my content production and plan consumption at a glance.

#### Scenarios

```gherkin
Feature: Dashboard Stats Overview

  Background:
    Given I am logged in as a user with an active subscription
    And I have uploaded 5 videos that produced 23 clips
    And my plan allows 300 minutes and I have used 180

  Scenario: Stats cards display correct values
    When I navigate to the dashboard
    Then I see a "Minutes used" card showing "180 из 300 мин"
    And the progress bar is filled to 60% with a yellow color
    And I see a "Videos" card showing "5"
    And I see a "Clips" card showing "23"
    And I see a "Billing period" card showing "до DD.MM.YYYY"

  Scenario: Progress bar color thresholds
    Given my plan allows 100 minutes
    When I have used 40 minutes
    Then the progress bar is green
    When I have used 65 minutes
    Then the progress bar is yellow
    When I have used 85 minutes
    Then the progress bar is red

  Scenario: Free plan user sees no billing period
    Given I am on the free plan with no active subscription
    When I navigate to the dashboard
    Then the billing period card shows "Бесплатный план"

  Scenario: Plan limit reached
    Given I have used 300 of 300 minutes
    When I navigate to the dashboard
    Then the progress bar is full and red
    And the minutes card shows "300 из 300 мин"
```

#### Acceptance Criteria

- [ ] Four stat cards rendered: minutes used, video count, clip count, billing period end
- [ ] Minutes card shows `{minutesUsed} из {minutesLimit} мин` with horizontal progress bar
- [ ] Progress bar color: green when <50%, yellow when 50-80%, red when >80%
- [ ] Billing period formatted as `до DD.MM.YYYY` using `ru-RU` locale
- [ ] Free plan users see "Бесплатный план" instead of a date
- [ ] Data fetched via tRPC `user.me` (or equivalent procedure returning subscription info)
- [ ] All stat values are integers (no decimals for minutes display)

---

### DS-02: Paginated Video List with Thumbnails and Status Badges

**As a** content creator,
**I want to** see my videos in a paginated list with thumbnails, status badges, and clip counts,
**So that** I can quickly find and monitor my video processing.

#### Scenarios

```gherkin
Feature: Paginated Video List

  Background:
    Given I am logged in
    And I have uploaded 25 videos

  Scenario: First page loads with 10 videos
    When I navigate to the dashboard
    Then I see 10 video items in the list
    And each item shows a thumbnail, title, status badge, date, and clip count
    And I see Prev/Next page controls at the bottom
    And the "Назад" button is disabled (first page)
    And the "Вперёд" button is enabled
    And I see "Страница 1 из 3"

  Scenario: Navigate to next page
    Given I am on the dashboard page 1
    When I click "Вперёд"
    Then the URL updates to "?page=2"
    And I see 10 videos on page 2
    And both "Назад" and "Вперёд" buttons are enabled

  Scenario: Last page disables the next button
    Given I am on page 2 and click "Вперёд"
    Then the URL updates to "?page=3"
    And I see 5 videos on the last page
    And the "Вперёд" button is disabled
    And the "Назад" button is enabled

  Scenario: Video without thumbnail shows placeholder
    Given a video has no thumbnailUrl
    When it appears in the list
    Then a placeholder with a video icon is shown in the thumbnail area

  Scenario: Status badge shows localized label
    Given a video has status "analyzing"
    When it appears in the list
    Then the badge shows "Анализ" with a purple background

  Scenario: Video titles are truncated
    Given a video has a title longer than 60 characters
    When it appears in the list
    Then the title is truncated to 60 characters with an ellipsis

  Scenario: Relative dates displayed
    Given a video was uploaded 2 hours ago
    When it appears in the list
    Then the date shows "2 часа назад"
```

#### Acceptance Criteria

- [ ] Video list uses offset-based pagination with `skip`/`take` params; page number in URL (`?page=N`)
- [ ] Page size is 10 items
- [ ] Each row displays: thumbnail (16:9, lazy-loaded), title (max 60 chars + ellipsis), status badge, relative date, clip count
- [ ] Thumbnail fallback: gray placeholder with video icon when `thumbnailUrl` is null
- [ ] Status badge component (`StatusBadge`) maps Prisma enum to Russian label + color:
  - `uploading` -> "Загрузка" (blue)
  - `transcribing` -> "Транскрибация" (blue)
  - `analyzing` -> "Анализ" (purple)
  - `generating_clips` -> "Генерация клипов" (purple)
  - `completed` -> "Готово" (green)
  - `failed` -> "Ошибка" (red)
- [ ] Prev/Next page controls with current page indicator ("Страница N из M"); "Назад" disabled on first page, "Вперёд" disabled on last page
- [ ] Dates formatted with relative time in Russian locale ("2 часа назад", "вчера", "3 дня назад")
- [ ] Videos sorted by `createdAt` descending (newest first)
- [ ] Page navigation updates URL params (bookmarkable, browser back/forward compatible)

---

### DS-03: Empty State with Onboarding

**As a** new user with no videos,
**I want to** see a clear onboarding prompt with an upload area,
**So that** I understand what to do next and can immediately upload my first video.

#### Scenarios

```gherkin
Feature: Dashboard Empty State

  Background:
    Given I am logged in as a user with 0 videos

  Scenario: Empty state renders instead of video list
    When I navigate to the dashboard
    Then I do not see the video list
    And I see an illustration or icon
    And I see the heading "Загрузите первое видео"
    And I see the text "КлипМейкер превратит ваш вебинар в 10 промо-шортсов за 5 минут"
    And I see a drag-and-drop upload area

  Scenario: Drag and drop a video file
    Given I am on the dashboard empty state
    When I drag a .mp4 file onto the upload area
    Then the upload process begins
    And I am navigated to the upload progress page

  Scenario: Click to select a file
    Given I am on the dashboard empty state
    When I click the upload area
    Then a file picker opens
    And it accepts .mp4, .webm, and .mov files

  Scenario: Stats cards still show for empty state
    Given I am on the dashboard empty state
    Then I still see the stats cards showing 0 videos, 0 clips, and minutes used
```

#### Acceptance Criteria

- [ ] Empty state shown when `video.list` returns 0 items
- [ ] Heading: "Загрузите первое видео"
- [ ] Subtext: "КлипМейкер превратит ваш вебинар в 10 промо-шортсов за 5 минут"
- [ ] Drag-and-drop area reuses the existing `VideoUploader` component
- [ ] Accepted file types: `.mp4`, `.webm`, `.mov` (max 4GB, validated by magic bytes)
- [ ] Stats cards are still visible above the empty state (showing zeros)
- [ ] Successful file drop or selection initiates upload and navigates to progress view

---

### DS-04: Loading Skeletons and Error Boundaries

**As a** user,
**I want to** see loading skeletons while the dashboard loads and a helpful error message if something fails,
**So that** the experience feels fast and I know what to do when something goes wrong.

#### Scenarios

```gherkin
Feature: Loading and Error States

  Scenario: Loading skeleton renders during data fetch
    Given I navigate to the dashboard
    When the page is loading
    Then I see 4 skeleton stat cards with pulsing animation
    And I see 5 skeleton video list rows with thumbnail and text placeholders
    And the skeleton paints within 500ms of navigation start

  Scenario: Error boundary catches tRPC failure
    Given the tRPC API returns a 500 error for dashboard data
    When the dashboard attempts to render
    Then I see the message "Не удалось загрузить данные"
    And I see a "Попробовать снова" button

  Scenario: Error recovery via retry
    Given the error boundary is shown
    When I click "Попробовать снова"
    Then the dashboard re-fetches data
    And if the API succeeds, the dashboard renders normally

  Scenario: 404 not-found in dashboard routes
    Given I navigate to /dashboard/nonexistent
    When the route does not exist
    Then I see "Страница не найдена"
    And I see a link "Вернуться на главную" pointing to /dashboard
```

#### Acceptance Criteria

- [ ] `loading.tsx` exists at `app/(dashboard)/dashboard/loading.tsx`
- [ ] Skeleton contains: 4 stat card skeletons (matching card dimensions) + 5 video row skeletons
- [ ] Skeletons use shadcn/ui `Skeleton` component with pulse animation
- [ ] `error.tsx` exists at `app/(dashboard)/dashboard/error.tsx`
- [ ] Error UI shows "Не удалось загрузить данные" message
- [ ] "Попробовать снова" button calls Next.js `reset()` function
- [ ] `not-found.tsx` exists at `app/(dashboard)/not-found.tsx`
- [ ] Not-found page shows "Страница не найдена" with link to `/dashboard`
- [ ] Error boundary is a client component (`'use client'`) as required by Next.js
- [ ] Skeleton first paint < 500ms (no data dependencies, pure static JSX)

---

### DS-05: Auth Integration

**As a** developer,
**I want to** replace NextAuth's `getServerSession` with the project's custom JWT auth headers,
**So that** the dashboard works with the actual authentication system.

#### Scenarios

```gherkin
Feature: Dashboard Auth Integration

  Background:
    Given the auth middleware sets x-user-id and x-user-email headers from JWT

  Scenario: Dashboard layout reads user from custom headers
    Given a valid access_token cookie is present
    When I navigate to the dashboard
    Then the layout reads x-user-id from the request headers
    And fetches the user profile via tRPC using that ID
    And renders the user name in the navigation

  Scenario: Unauthenticated user is redirected
    Given no access_token cookie is present
    When I navigate to the dashboard
    Then I am redirected to /login

  Scenario: Expired token triggers redirect
    Given the access_token is expired and refresh fails
    When I navigate to the dashboard
    Then I am redirected to /login

  Scenario: No getServerSession calls remain
    Given the codebase is inspected
    Then there are zero references to getServerSession in the dashboard route group
    And there are zero references to NextAuth signOut in the dashboard route group
```

#### Acceptance Criteria

- [ ] Dashboard layout (`app/(dashboard)/layout.tsx`) reads `x-user-id` from `headers()` instead of calling `getServerSession`
- [ ] If `x-user-id` header is missing, `redirect('/login')` is called
- [ ] User profile data (name, email, avatar) fetched via tRPC `user.me` using the header-provided user ID
- [ ] No imports from `next-auth` or `next-auth/react` exist in any file under `app/(dashboard)/`
- [ ] The auth middleware (already existing) handles token validation and refresh -- dashboard code does NOT validate tokens directly

---

### DS-06: Navigation and Logout Fix

**As a** user,
**I want to** navigate between dashboard sections and log out properly,
**So that** I can access all features and securely end my session.

#### Scenarios

```gherkin
Feature: Dashboard Navigation and Logout

  Scenario: Navigation links render correctly
    Given I am on the dashboard
    Then I see navigation links: "Видео", "Загрузить", "Настройки"
    And the current page link is visually highlighted
    And the КлипМейкер logo links to /dashboard

  Scenario: Logout clears session
    Given I am on the dashboard
    When I click the logout button
    Then a POST request is sent to /api/auth/logout
    And the access_token and refresh_token cookies are cleared
    And I am redirected to /login

  Scenario: Logout handles API failure gracefully
    Given I am on the dashboard
    And the /api/auth/logout endpoint returns a 500 error
    When I click the logout button
    Then cookies are cleared client-side as a fallback
    And I am still redirected to /login

  Scenario: Quick upload button in header
    Given I am on the dashboard (with or without videos)
    Then I see a "Загрузить видео" button in the header area
    When I click it
    Then I am navigated to /dashboard/upload
```

#### Acceptance Criteria

- [ ] `DashboardNav` component does NOT import from `next-auth/react`
- [ ] Logout handler sends `POST /api/auth/logout`, then clears cookies client-side, then redirects to `/login`
- [ ] Logout error fallback: if API call fails, still clear cookies and redirect
- [ ] Navigation links: "Видео" (`/dashboard`), "Загрузить" (`/dashboard/upload`), "Настройки" (`/dashboard/settings`)
- [ ] Active link has visual highlight (e.g., bold text, underline, or background color)
- [ ] "Загрузить видео" quick action button visible in header on all dashboard pages
- [ ] Logo links to `/dashboard`
- [ ] Navigation is responsive: collapses to hamburger menu on mobile (<768px)

---

## Non-Functional Requirements

### NFR-01: Performance

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Dashboard page load (p95) | < 2 seconds | Lighthouse CI in CI/CD pipeline |
| Skeleton first paint | < 500ms | `PerformanceObserver` measuring LCP of skeleton |
| Page navigation response | < 1 second | tRPC response time logging |
| Time to interactive | < 3 seconds | Lighthouse TBT metric |

Implementation notes:
- Stats cards and video list should be Server Components where possible to reduce client JS
- Video thumbnails must use `loading="lazy"` and explicit `width`/`height` to avoid layout shift
- Pagination fetches only 10 items per request (offset-based with `skip`/`take`)

### NFR-02: Accessibility (WCAG 2.1 AA)

- All stat cards have `aria-label` describing the metric (e.g., `aria-label="Использовано 180 из 300 минут"`)
- Progress bar uses `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
- Status badges have sufficient color contrast (4.5:1 ratio minimum for text)
- Status information is not conveyed by color alone (text labels always present)
- All interactive elements are keyboard-accessible (Tab, Enter, Escape)
- Focus management: after page navigation, focus moves to the top of the video list
- Error boundary: "Попробовать снова" button receives focus automatically
- Skip-to-content link in layout for screen reader users

### NFR-03: Responsiveness

| Breakpoint | Layout |
|------------|--------|
| < 640px (mobile) | Stats in 2x2 grid, video list single column, nav collapses to hamburger |
| 640-1024px (tablet) | Stats in 4x1 row, video list with smaller thumbnails |
| > 1024px (desktop) | Full layout with sidebar nav, stats in 4x1 row, video list with large thumbnails |

- Mobile-first approach: base styles for mobile, `sm:` / `md:` / `lg:` Tailwind breakpoints for larger screens
- Touch targets minimum 44x44px on mobile

### NFR-04: Locale

- All UI text in Russian (hardcoded strings, no i18n framework)
- Date formatting: `DD.MM.YYYY` via `Intl.DateTimeFormat('ru-RU')`
- Relative dates: use `Intl.RelativeTimeFormat('ru')` or a lightweight library (e.g., `date-fns/locale/ru`)
- Number formatting: space as thousands separator (e.g., `1 234`) via `Intl.NumberFormat('ru-RU')`

### NFR-05: Security

- No user data leaked in error messages (error boundary shows generic text, logs details server-side)
- Dashboard layout validates `x-user-id` header presence before rendering (redirect if missing)
- No API keys or sensitive data in client-side JS bundles
- All tRPC calls scoped to authenticated user (middleware enforces `userId` from JWT)

---

## Data Requirements

### tRPC Procedures Used

| Procedure | Input | Output | Notes |
|-----------|-------|--------|-------|
| `user.me` | (none, from auth context) | `{ id, name, email, minutesUsed, minutesLimit, videoCount, clipCount, subscription: { currentPeriodEnd } }` | May need to add `minutesLimit` and `subscription` to response |
| `video.list` | `{ page?: number, limit: number }` | `{ items: Video[], totalPages: number, currentPage: number }` | Needs offset pagination (`skip`/`take`) added to existing procedure |
| `video.list` items | - | `{ id, title, status, thumbnailUrl, clipCount, createdAt }` | `clipCount` may need to be added as computed field |

### Prisma Models Referenced

- `User`: id, name, email, minutesUsed
- `Video`: id, title, status, thumbnailUrl, createdAt, userId
- `Clip`: id, videoId (for count)
- `Subscription`: userId, plan, currentPeriodEnd, status

---

## Story Dependencies

```
DS-05 (Auth Integration)
  |
  +---> DS-06 (Navigation & Logout) ----+
  |                                      |
  +---> DS-01 (Stats Overview) ----------+---> DS-03 (Empty State)
  |                                      |
  +---> DS-02 (Paginated Video List) ----+
  |
  +---> DS-04 (Loading & Error States)
```

- **DS-05** must be completed first (all other stories depend on working auth)
- **DS-04** can be done in parallel with DS-05 (pure UI, no data dependencies)
- **DS-01**, **DS-02**, **DS-06** depend on DS-05
- **DS-03** depends on DS-01 and DS-02 (empty state replaces the video list and sits below stats)

## Estimation

| Story | Complexity | Estimate |
|-------|-----------|----------|
| DS-01: Stats Overview | Medium | 4h |
| DS-02: Paginated Video List | High | 6h |
| DS-03: Empty State | Low | 2h |
| DS-04: Loading & Error States | Low | 2h |
| DS-05: Auth Integration | Medium | 3h |
| DS-06: Navigation & Logout | Medium | 3h |
| **Total** | | **20h** |
