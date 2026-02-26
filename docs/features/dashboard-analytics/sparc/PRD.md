# Dashboard Analytics — PRD

## Executive Summary

Complete the partial F10 (Dashboard & Analytics) implementation by adding an analytics page with publication performance metrics. The existing dashboard shows basic counts (videos, clips, minutes). The stats-collector worker already runs every 6h collecting views/likes/shares from platforms and stores them in the Publication model. This feature adds a dedicated analytics page with aggregate metrics, platform breakdowns, top clips, and timeline charts.

## Problem

Users publish clips to VK, Rutube, Dzen, and Telegram but have no visibility into how their content performs. The stats-collector worker collects views/likes/shares but this data is buried in individual clip detail views. There is no aggregate view, no trend analysis, no way to compare performance across platforms.

## Solution

1. **Analytics tRPC router** — new `analytics` router with endpoints for overview, per-video, per-platform, top clips, and timeline data
2. **Analytics page** — `/dashboard/analytics` with summary cards, platform breakdown, top clips table, and views-over-time chart
3. **Navigation** — add "Analytics" link in the dashboard navigation bar

## Target Users

- Content creators who publish clips and want to track performance
- Course authors evaluating which content resonates across platforms
- Paid-tier users doing bulk content production wanting ROI insights

## Success Criteria

| Metric | Target |
|--------|--------|
| Page load time | < 500ms for users with < 1000 publications |
| Data accuracy | Matches sum of individual publication stats |
| Query performance | No N+1 queries, all aggregations done in SQL |
| User data isolation | Zero cross-user data leakage |
| Responsiveness | Works on mobile (320px+) and desktop |

## Scope

### In Scope (MVP)
- Summary cards: total views, likes, shares, published clips count
- Platform breakdown table (VK, Rutube, Dzen, Telegram aggregates)
- Top 10 performing clips by views
- Timeline chart: views over last 30 days (daily aggregation)
- Navigation link from dashboard
- Empty state when no publications exist

### Out of Scope
- Real-time stats updates (WebSocket/SSE)
- Export to CSV/PDF
- Custom date range picker
- Per-publication drill-down from analytics
- Comparison between time periods
- Comments/engagement metrics beyond views/likes/shares
