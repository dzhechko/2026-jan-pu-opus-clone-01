# Download Clips — Completion

## Deployment Plan

### Prerequisites
- [ ] `archiver` package installed in `apps/web`
- [ ] All existing clip-related tests passing

### Deployment Steps
1. Install `archiver` dependency
2. Deploy new API route (`/api/videos/[videoId]/download-all`)
3. Deploy updated UI components (ClipCard, ActionBar, ClipList)
4. Deploy `useClipDownload` hook
5. Verify single download flow end-to-end
6. Verify batch download flow end-to-end

### Rollback
- Feature is additive (new buttons, new route)
- Rollback: revert commit, redeploy
- No database migrations to roll back
- No breaking changes to existing APIs

## Monitoring

| Metric | Alert Threshold |
|--------|----------------|
| Download mutation error rate | > 5% in 5 min |
| ZIP generation duration | > 30s p95 |
| ZIP API route 5xx rate | > 1% in 5 min |
| S3 GetObject errors | > 3% in 5 min |

## CI/CD

- TypeScript check: `npx tsc --noEmit`
- Lint: `npm run lint`
- Tests: `npm run test` (unit + integration)
- Build: `npm run build` (Next.js)

## Handoff Checklist

### Developer
- [ ] Single download works from ClipCard
- [ ] Single download works from ActionBar
- [ ] Batch download creates valid ZIP
- [ ] Watermark badge shows for free users
- [ ] Rate limiting works for both endpoints
- [ ] Error states handled gracefully

### QA
- [ ] Test on Chrome, Firefox, Safari
- [ ] Test on mobile (iOS Safari, Android Chrome)
- [ ] Test with 1, 5, 10, 50 clips in ZIP
- [ ] Test with very long filenames
- [ ] Test with special characters in titles
- [ ] Test download during rendering
- [ ] Test as free user (watermark badge)
- [ ] Test as paid user (no badge)
