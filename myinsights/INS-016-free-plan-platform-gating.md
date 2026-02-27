# INS-016: Free Plan Platform Gating — No User Feedback

**Status:** 🟢 Active
**Hits:** 1
**Created:** 2026-02-27

## Error Signatures
- `platforms page not working`, `connection button does nothing`, `free plan`

## Symptom
User reports "platform connections don't work" on `/dashboard/settings/platforms`. Buttons appear clickable but the backend rejects because user's plan (`free`) has `autoPostPlatforms: []`.

## Root Cause
The platforms page rendered all platform cards identically regardless of the user's plan. The `PLANS[planId].autoPostPlatforms` array determines which platforms are available, but the UI didn't check this — it showed connect buttons for all platforms.

On the `free` plan, `autoPostPlatforms` is an empty array, so no platform connections are allowed. The backend enforces this, but the frontend gave no indication, making it look like a bug.

## Solution
1. Fetch user plan via `trpc.user.me.useQuery()`
2. Compute `allowedPlatforms = new Set(PLANS[planId].autoPostPlatforms)`
3. Show amber banner when `allowedPlatforms.size === 0` with "Обновить тариф" CTA
4. Pass `isAllowed` prop to each PlatformCard
5. Disabled cards: `opacity-60`, description = "Недоступно на вашем тарифе", button replaced with "Обновить тариф" link

## Lesson
Always gate UI actions client-side to match backend restrictions. If a plan doesn't include a feature, the UI should explain why (not silently fail) and offer an upgrade path.
