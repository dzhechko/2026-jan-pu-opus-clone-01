# INS-014: Route Group Mismatch — Settings 404

**Status:** 🟢 Active
**Hits:** 1
**Created:** 2026-02-26

## Error Signatures
- `404` on `/dashboard/settings`
- "This page could not be found"
- Route group `(settings)` vs `(dashboard)` mismatch

## Context
Settings pages were in Next.js route group `(settings)/settings/page.tsx`, which resolves to URL `/settings`. But `dashboard-nav.tsx` linked to `/dashboard/settings` → 404.

## Root Cause
Next.js App Router route groups `(groupName)` don't affect the URL path, but they DO affect which `layout.tsx` wraps the page. Settings was in its own group without a layout, while navigation expected it under `/dashboard/settings` which requires the `(dashboard)` group with `DashboardLayout`.

## Solution
Moved settings pages from `(settings)/settings/` to `(dashboard)/dashboard/settings/`:
- Settings now gets the DashboardLayout (nav bar)
- URL `/dashboard/settings` works correctly
- Updated internal links: `/settings/api-keys` → `/dashboard/settings/api-keys`
- Deleted old `(settings)` route group

## Prevention
When adding new pages, always check which route group they belong to and verify the URL matches navigation links. Pages that need DashboardNav must be under `(dashboard)/dashboard/`.
