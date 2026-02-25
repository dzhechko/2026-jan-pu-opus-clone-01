# Download Clips — Refinement

## Edge Cases Matrix

| # | Edge Case | Handling |
|---|-----------|----------|
| E1 | Presigned URL expires before download starts | Client shows error, offers retry |
| E2 | S3 object deleted between URL generation and download | S3 returns 404, client shows error |
| E3 | Very long clip title (>200 chars) | Truncate to 100 chars in filename |
| E4 | Clip title with special characters (/, \, <>) | Sanitize: strip unsafe chars |
| E5 | Duplicate clip titles in ZIP | Append index: `title.mp4`, `title_2.mp4` |
| E6 | ZIP with 0 ready clips | Disable button, show "Нет готовых клипов" |
| E7 | Network disconnect during ZIP download | Browser handles partial download, user retries |
| E8 | User navigates away during batch download | Download continues in background (browser-level) |
| E9 | Concurrent batch downloads | Rate limit prevents abuse (5/60s) |
| E10 | S3 stream error mid-ZIP | Archive error event, partial ZIP, client error |
| E11 | Free user downloads (watermark) | Badge shown, download proceeds normally |
| E12 | Clip transitions from ready to rendering during batch | Skip clip (check status at stream time) |

## Testing Strategy

### Unit Tests
- `sanitizeFilename()` — special chars, long names, unicode, empty string
- Watermark badge display logic based on user plan
- Download button disabled states

### Integration Tests
- `clip.download` mutation: valid clip, invalid clip, wrong owner, not-ready status
- ZIP API route: authentication, rate limiting, empty clips, streaming response

### E2E Tests (Playwright)
- Click download → verify file downloaded
- Free tier → watermark badge visible
- Paid tier → no watermark badge
- Click "Download All" → verify ZIP contents

## Performance Optimizations

| Optimization | Impact |
|-------------|--------|
| ZIP compression level 1 | ~10x faster than level 9, negligible size difference for video |
| Stream-based ZIP | Constant memory regardless of total file size |
| Parallel S3 prefetch | Could prefetch next stream while current is piping (future optimization) |
| Client-side blob URL cleanup | `URL.revokeObjectURL()` after download starts |

## Security Hardening

- Rate limit batch downloads aggressively (5/60s) — ZIP is expensive
- Validate videoId is UUID format in API route
- Check user owns video before querying clips
- Sanitize all filenames in ZIP (prevent path traversal: `../../../etc/passwd`)
- Set `Content-Security-Policy` on download responses
- Log download events for audit trail (future)

## Accessibility

- Download buttons have descriptive `aria-label`: "Скачать клип: [title]"
- Disabled state communicates reason via `title` attribute
- Loading state announced to screen readers
- Keyboard accessible (buttons, not div+onClick)

## Technical Debt

- [ ] Add download analytics (count, size, user plan)
- [ ] CDN-accelerated downloads for large files
- [ ] Selective batch download (checkbox select)
- [ ] Progress indicator for large ZIP downloads
