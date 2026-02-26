# Specification: URL Ingestion

## User Stories

### US-URL-001: Download Video from URL
**As a** course creator,
**I want to** paste a video URL instead of uploading a file,
**So that** I can process videos already hosted online without downloading them first.

**Acceptance Criteria:**
- Given a valid HTTP/HTTPS video URL, when I submit it via createFromUrl, then a download job is enqueued within 1 second
- Given a download job is processing, when the download completes, then the video is uploaded to S3 within 5 minutes for files under 500MB
- Given the video is in S3, when upload completes, then the STT job is enqueued automatically
- Given the video status is 'downloading', when I check the video list, then I see status 'downloading' with the source URL

### US-URL-002: SSRF Protection
**As a** system operator,
**I want** URL downloads to be protected against SSRF attacks,
**So that** malicious users cannot access internal services.

**Acceptance Criteria:**
- Given a URL pointing to 127.0.0.1, when the download job runs, then it is rejected with error "Blocked: private IP address"
- Given a URL pointing to 169.254.169.254, when the download job runs, then it is rejected with error "Blocked: private IP address"
- Given a URL pointing to 10.0.0.1, when the download job runs, then it is rejected with error "Blocked: private IP address"
- Given a URL with scheme ftp://, when submitted, then it is rejected at the Zod validation level
- Given a URL that redirects to a private IP, when the download job follows the redirect, then it blocks the redirect target

### US-URL-003: Download Failure Handling
**As a** course creator,
**I want** clear feedback when a URL download fails,
**So that** I know what went wrong and can try again.

**Acceptance Criteria:**
- Given a URL returning HTTP 404, when the download job runs, then the video status is set to 'failed' after all retries are exhausted
- Given a URL returning a non-video content type (text/html), when the download starts, then the job fails with "Invalid content type"
- Given a URL pointing to a file larger than 4GB, when Content-Length header indicates > 4GB, then the job fails immediately without downloading
- Given a file that exceeds 4GB during download (no Content-Length), when 4GB of data is received, then the download is aborted
- Given a network timeout after 30 minutes, when no data has been received, then the job fails with timeout error

### US-URL-004: Magic Bytes Validation
**As a** system operator,
**I want** downloaded files validated by magic bytes,
**So that** only genuine video files enter the pipeline.

**Acceptance Criteria:**
- Given a downloaded file with valid MP4 magic bytes, when validation runs, then the file proceeds to S3 upload
- Given a downloaded file with HTML content disguised as video, when magic bytes validation runs, then the file is rejected and cleaned up
- Given a downloaded file, when magic bytes validation fails, then the temp file is deleted and video status is set to 'failed'

## Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Download throughput | >= 10 MB/s on 100 Mbps connection |
| Memory usage | < 50MB per download (streaming, not buffering) |
| Worker concurrency | 2 concurrent downloads per worker instance |
| Max file size | 4GB |
| Download timeout | 30 minutes |
| Retry attempts | 3 with exponential backoff (5s, 20s, 80s) |
| SSRF validation latency | < 100ms (DNS resolve + IP check) |

## Feature Matrix

| Capability | MVP | v1.1 | v2 |
|-----------|-----|------|-----|
| HTTP/HTTPS direct link download | Yes | Yes | Yes |
| SSRF protection | Yes | Yes | Yes |
| Magic bytes validation | Yes | Yes | Yes |
| Content-Length pre-check | Yes | Yes | Yes |
| Streaming download (low memory) | Yes | Yes | Yes |
| Progress tracking (% downloaded) | No | Yes | Yes |
| YouTube/Vimeo via yt-dlp | No | No | Yes |
| Resume interrupted downloads | No | No | Yes |
