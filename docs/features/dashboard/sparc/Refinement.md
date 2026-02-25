# Refinement — Dashboard Enhancement

## Edge Cases & Error Handling

### 1. User with 0 Videos (Empty State)

**Scenario:** New user logs in for the first time and sees the dashboard.

**Handling:**
- Display empty state component with illustration and CTA
- Stats grid shows all zeros (not hidden)
- "Загрузить первое видео" button links to `/upload`
- Plan usage bar shows 0/N with full capacity remaining

**Test:** Render dashboard page with empty Prisma result set, verify empty state renders.

### 2. User with 1000+ Videos (Pagination Performance)

**Scenario:** Power user or course creator with extensive video library.

**Handling:**
- Offset pagination with `PAGE_SIZE = 10`
- PostgreSQL index on `(userId, createdAt DESC)` for efficient queries
- `COUNT(*)` query runs in parallel with data query (Promise.all)
- Maximum page links shown: 7 (first, last, current ± 2, ellipsis)
- Consider adding `WHERE createdAt > ?` filter for date-range narrowing

**Test:** Seed database with 1500 videos, verify pagination renders correct page count (150 pages), verify query time < 100ms.

### 3. Video Status Transitions During Page View (Stale Data)

**Scenario:** User views dashboard while a video is processing. Status changes from `processing` to `completed` on the server.

**Handling:**
- Server Components render at request time — refresh shows current state
- No real-time updates in v1 (acceptable trade-off for simplicity)
- StatusBadge shows last-known state with timestamp: "В обработке (2 мин назад)"
- Future enhancement: Server-Sent Events or polling for active processing jobs

**Test:** Verify StatusBadge renders all 6 status variants correctly: `uploading`, `transcribing`, `analyzing`, `generating_clips`, `completed`, `failed`.

### 4. Invalid Page Number in URL

**Scenario:** User manually edits URL to `?page=0`, `?page=-5`, `?page=999999`, or `?page=abc`.

**Handling:**
- Zod validation on `page` query param: `z.coerce.number().int().min(1).default(1)`
- If `page > totalPages`: redirect to last valid page
- If `page` is non-numeric or < 1: default to page 1
- No error thrown — graceful fallback

**Test:**
- `?page=0` → renders page 1
- `?page=abc` → renders page 1
- `?page=100` with 50 total pages → redirects to page 50
- `?page=3` with 3 pages → renders page 3

### 5. JWT Expired During Dashboard Load

**Scenario:** User's access token (15 min TTL) expires between navigation and Server Component render.

**Handling:**
- Middleware already handles refresh token rotation before reaching the page
- If middleware fails to refresh: redirect to `/auth/login?callbackUrl=/dashboard`
- Server Component `getUser()` returns `null` if token invalid → `redirect('/auth/login')`
- No flash of dashboard content before redirect (Server Component, not client)

**Test:** Mock expired JWT cookie, verify redirect to login with callback URL preserved.

### 6. Layout Rendering Before Middleware Headers

**Scenario:** Edge case where layout.tsx renders before middleware has set auth-related headers.

**Handling:**
- Layout reads from cookies directly (set by middleware in the same request cycle)
- Next.js guarantees middleware runs before any rendering
- If cookie is missing (shouldn't happen), layout treats as unauthenticated
- Defensive: `getUser()` always returns `null` on any decode failure, never throws

**Test:** Render layout with no cookies set, verify unauthenticated state renders (redirect to login).

### 7. Mobile Responsive Layout

**Scenario:** User accesses dashboard from mobile device (< 768px).

**Handling:**
- Stats grid: 2 columns on mobile (was 4 on desktop) using `grid-cols-2 md:grid-cols-4`
- Video list: Single column card layout on mobile (no table view)
- Pagination: Compact mode — show only prev/next + current page number
- Navigation: Hamburger menu replaces sidebar
- Touch targets: Minimum 44x44px for all interactive elements

**Test:** Playwright viewport tests at 375px, 768px, 1280px widths.

---

## Testing Strategy

### Unit Tests (Vitest)

| Test | Description | Priority |
|------|-------------|----------|
| StatusBadge mapping | All 6 status values (`uploading`, `transcribing`, `analyzing`, `generating_clips`, `completed`, `failed`) → correct color + label | High |
| Pagination math | `calculatePages(total, pageSize, current)` → page numbers array | High |
| Auth decode | Valid JWT → user object, expired → null, malformed → null | High |
| Stats calculation | Aggregate video counts by status | Medium |
| Page param validation | Zod coercion for edge cases | Medium |
| Empty state detection | 0 videos → show empty state flag | Low |

### Integration Tests (Vitest + Prisma Mock)

| Test | Description | Priority |
|------|-------------|----------|
| Dashboard page render | Mock Prisma, verify stats + video list rendered | High |
| Pagination data flow | Page param → correct OFFSET/TAKE in Prisma query | High |
| Auth-protected layout | No token → redirect, valid token → render dashboard | High |
| Empty state render | 0 videos in DB → empty state component shown | Medium |
| Error boundary | Prisma throws → error.tsx rendered with retry button | Medium |

### E2E Tests (Playwright)

| Test | Description | Priority |
|------|-------------|----------|
| Full flow | Login → dashboard → see stats → paginate → click video | High |
| Empty state | New user login → empty state → click upload CTA | High |
| Mobile responsive | Dashboard renders correctly at mobile breakpoints | Medium |
| Error recovery | Simulate API error → error page → click retry → success | Medium |
| Page bookmarking | Navigate to `?page=3`, refresh, still on page 3 | Low |

### BDD Scenarios

```gherkin
Feature: Dashboard Overview

  Scenario: User sees dashboard after login
    Given I am logged in as a user with 5 videos
    When I navigate to the dashboard
    Then I should see stats showing "5 видео"
    And I should see a list of my 5 most recent videos
    And each video should display a status badge

  Scenario: Empty state for new user
    Given I am logged in as a user with 0 videos
    When I navigate to the dashboard
    Then I should see an empty state message
    And I should see a "Загрузить первое видео" button
    When I click "Загрузить первое видео"
    Then I should be navigated to the upload page

  Scenario: Pagination with many videos
    Given I am logged in as a user with 50 videos
    When I navigate to the dashboard
    Then I should see 10 videos on the first page
    And I should see pagination showing 5 pages
    When I click "Вперёд" twice to reach page 3
    Then the URL should contain "?page=3"
    And I should see videos 21-30

  Scenario: Invalid page number
    Given I am logged in as a user with 10 videos
    When I navigate to the dashboard with "?page=999"
    Then I should be redirected to the last valid page

  Scenario: Expired session
    Given my session has expired
    When I navigate to the dashboard
    Then I should be redirected to the login page
    And the callback URL should be "/dashboard"
```

---

## Performance Considerations

- **Database indexes:** Ensure composite index on `video(userId, createdAt DESC)` exists
- **Parallel queries:** Run `findMany` and `count` in `Promise.all`, not sequentially
- **Skeleton UI:** Loading skeleton should match final layout to prevent CLS (Cumulative Layout Shift)
- **Image optimization:** Video thumbnails served via Next.js `<Image>` with appropriate `sizes` attribute
- **Bundle size:** Pagination and StatusBadge are small Client Components; keep dashboard page as Server Component
