# Download Clips — PRD

## Executive Summary

Enable users to download rendered clips as MP4 files (single or batch ZIP). The backend `clip.download` mutation already exists; this feature adds the UI layer, batch download capability, and watermark awareness.

## Problem

Users can create and edit clips but cannot download them. The pipeline ends at "ready" status with no way to get the file. This blocks the core user journey: upload → process → edit → **download**.

## Solution

1. **Single clip download** — button on ClipCard and ClipEditor ActionBar; calls existing `clip.download` tRPC mutation, opens presigned URL
2. **Batch download (ZIP)** — "Скачать все" button on video detail page; new tRPC mutation streams ZIP of all ready clips
3. **Watermark indicator** — show badge on free-tier clips so users know watermark is present

## Target Users

- Content creators who have processed and edited clips
- Free-tier users evaluating the product (watermarked downloads)
- Paid users doing bulk content production

## Success Criteria

| Metric | Target |
|--------|--------|
| Single download latency | < 2s to start download |
| ZIP generation | < 10s for 10 clips |
| Download success rate | > 99% |
| User flow completion | Upload → Download in same session |

## Scope

### In Scope (MVP)
- Download button on ClipCard (clip list)
- Download button in ClipEditor ActionBar
- "Download all" ZIP on video detail page
- Watermark badge on free-tier clips
- Rate limiting (existing: 30/60s)

### Out of Scope
- Custom filename templates
- Format conversion on download (always MP4)
- Partial ZIP (select specific clips)
- CDN-accelerated downloads
