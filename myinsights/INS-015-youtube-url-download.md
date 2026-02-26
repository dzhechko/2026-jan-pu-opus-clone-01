# INS-015: YouTube URL Download — safeFetch Gets HTML, Not Video

**Status:** 🟢 Active
**Hits:** 1
**Created:** 2026-02-26

## Error Signatures
- Video stuck in `downloading` status forever
- `filePath` empty, no S3 upload
- `safeFetch` returns HTML page instead of video stream
- YouTube/VK/RuTube URL passed to `createFromUrl`

## Context
`createFromUrl` mutation accepts any HTTP(S) URL and enqueues a `VIDEO_DOWNLOAD` job. The download worker uses `safeFetch` (Node.js fetch with SSRF protection) to GET the URL. For YouTube URLs like `https://www.youtube.com/watch?v=...`, the server returns an HTML page, not a video file. Content-Type check rejects `text/html`, job fails, but video stays in `downloading` state if retries exhaust.

## Root Cause
YouTube (and similar platforms like VK Video, RuTube, Bilibili) serve video through:
1. JavaScript-based players that negotiate streams via API
2. DRM-protected adaptive streams (DASH/HLS)
3. Signed/rotating URLs with anti-hotlink protection

A simple HTTP GET returns the HTML page with the player, not the video binary.

## Solution (current)
- `createFromUrl` only works for **direct video file URLs** (e.g., `https://cdn.example.com/video.mp4`)
- Videos from YouTube/platforms must be uploaded via file upload (`createFromUpload`)
- Stuck videos can be deleted via the UI delete button

## Future Solution
To support YouTube URLs, implement a `yt-dlp` integration:
- Worker detects YouTube domain → delegates to `yt-dlp` subprocess
- `yt-dlp` handles auth, format selection, DRM
- Output piped to temp file → uploaded to S3
- Consider: legal implications, Terms of Service compliance

## Prevention
Consider URL validation in `createFromUrl` to warn/reject known platform URLs (youtube.com, vk.com, rutube.ru) with a user-friendly message: "Для загрузки с YouTube используйте прямую ссылку на файл или загрузите видео вручную."
