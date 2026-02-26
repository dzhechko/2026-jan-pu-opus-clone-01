# Dashboard Analytics — Specification

## User Stories

### US-001: View Publication Overview
**As a** content creator
**I want to** see total views, likes, shares, and published clips count on an analytics page
**So that** I can quickly assess my overall content performance

**Acceptance Criteria:**
- Given I have published clips, when I visit `/dashboard/analytics`, then I see 4 summary cards with total views, total likes, total shares, and published clips count
- Given I have no publications, when I visit the analytics page, then I see an empty state message
- Cards show exact numeric values formatted with locale separators (e.g., 1 234)
- Page loads in < 500ms for users with up to 1000 publications

### US-002: View Platform Breakdown
**As a** content creator
**I want to** see performance metrics broken down by platform
**So that** I can understand which platforms drive the most engagement

**Acceptance Criteria:**
- Given I have publications on multiple platforms, when I view the platform section, then I see a table with one row per platform showing: platform name, publication count, total views, total likes, total shares
- Platforms with zero publications are not shown
- Rows are sorted by total views descending

### US-003: View Top Performing Clips
**As a** content creator
**I want to** see my top 10 clips ranked by views
**So that** I can identify my best-performing content

**Acceptance Criteria:**
- Given I have published clips, when I view the top clips section, then I see a table with up to 10 clips showing: clip title, platform, views, likes, shares, published date
- Clips are sorted by views descending
- Each row shows the clip title (truncated to 60 chars if needed)

### US-004: View Views Timeline
**As a** content creator
**I want to** see a chart of views over the last 30 days
**So that** I can identify trends in my content performance

**Acceptance Criteria:**
- Given I have publications, when I view the timeline section, then I see a bar chart showing daily view counts for the last 30 days
- Days with zero views show empty bars
- The chart is responsive and works on mobile screens

### US-005: Navigate to Analytics
**As a** dashboard user
**I want to** access the analytics page from the main navigation
**So that** I can quickly switch between dashboard and analytics

**Acceptance Criteria:**
- The dashboard navigation bar includes an "Аналитика" link
- The link navigates to `/dashboard/analytics`
- The link uses a chart/bar-chart icon consistent with existing nav style

## Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Response time | < 500ms p95 for < 1000 publications |
| Data isolation | All queries scoped to authenticated user |
| Accessibility | Semantic HTML, aria-labels on cards and charts |
| Mobile support | Responsive down to 320px width |
| Browser support | Chrome 90+, Firefox 90+, Safari 15+, Yandex Browser |

## Feature Matrix

| Feature | MVP | v1.1 | v2 |
|---------|-----|------|-----|
| Summary cards | Yes | - | - |
| Platform breakdown | Yes | - | - |
| Top 10 clips | Yes | - | - |
| Views timeline (30d) | Yes | - | - |
| Navigation link | Yes | - | - |
| Date range picker | - | Yes | - |
| Export CSV | - | Yes | - |
| Period comparison | - | - | Yes |
| Real-time updates | - | - | Yes |
