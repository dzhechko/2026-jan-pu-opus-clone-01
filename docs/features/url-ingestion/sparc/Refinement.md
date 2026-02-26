# Refinement: URL Ingestion

## Edge Cases Matrix

| # | Edge Case | Expected Behavior | Severity |
|---|-----------|-------------------|----------|
| 1 | URL returns 301/302 to private IP | Block redirect, fail job | Critical |
| 2 | DNS resolves to both public and private IPs | Block if ANY resolved IP is private | Critical |
| 3 | Content-Length header missing | Allow download, enforce 4GB limit via byte counting | Medium |
| 4 | Content-Length header lies (says 100MB, sends 5GB) | Abort at 4GB received bytes | High |
| 5 | URL serves infinite stream (never ends) | 30-minute timeout aborts | High |
| 6 | URL requires authentication (401/403) | Fail with descriptive error | Low |
| 7 | URL returns HTML error page with video/* content-type | Magic bytes check catches it | Medium |
| 8 | Hostname resolves to IPv6 private address | isPrivateIP checks IPv6 ranges | Critical |
| 9 | URL with very long path (>2048 chars) | Zod validation limits URL length | Low |
| 10 | Concurrent downloads exhaust disk space | Worker concurrency=2 limits parallelism; /tmp cleanup in finally | Medium |
| 11 | S3 upload fails after successful download | BullMQ retry re-downloads and re-uploads | Medium |
| 12 | Video record deleted while download in progress | Check video exists before S3 upload | Low |
| 13 | URL with special characters in path | URL is already validated by Zod `z.string().url()` | Low |
| 14 | Server closes connection mid-download | Node fetch throws, BullMQ retries | Medium |
| 15 | DNS resolution timeout | Set DNS timeout, fail gracefully | Low |

## Testing Strategy

### Unit Tests
- `isPrivateIP()` -- test all private ranges (IPv4 + IPv6), public IPs, edge cases
- `validateUrlSafety()` -- mock DNS resolution, test SSRF scenarios
- `guessExtension()` -- test content-type mapping, URL fallback, defaults

### Integration Tests
- Download worker with mock HTTP server (MSW or custom)
- End-to-end: createFromUrl -> download job -> S3 upload -> STT enqueue

### BDD Scenarios (Gherkin)

```gherkin
Feature: URL Ingestion

  Scenario: Successful video download from URL
    Given a user with remaining minutes
    And a valid video URL "https://example.com/webinar.mp4" returning a 200MB MP4
    When the user submits the URL via createFromUrl
    Then a video record is created with status "downloading"
    And a video-download job is enqueued
    When the download worker processes the job
    Then the video is downloaded to a temp file
    And magic bytes validation passes
    And the file is uploaded to S3
    And the video record is updated with filePath and fileSize
    And the video status is set to "transcribing"
    And an STT job is enqueued

  Scenario: SSRF protection blocks private IP
    Given a URL "https://internal.example.com/" that resolves to 10.0.0.5
    When the download worker processes the job
    Then the job fails with "Blocked: private IP address"
    And no HTTP request is made to the target

  Scenario: File too large (Content-Length)
    Given a URL returning Content-Length: 5368709120 (5GB)
    When the download worker processes the job
    Then the job fails with "File too large"
    And no bytes are downloaded

  Scenario: File too large (streaming)
    Given a URL with no Content-Length that streams 5GB
    When the download worker has received 4GB of data
    Then the download is aborted
    And the temp file is cleaned up
    And the job fails

  Scenario: Invalid content type
    Given a URL returning Content-Type: text/html
    When the download worker processes the job
    Then the job fails with "Invalid content type"

  Scenario: Magic bytes validation fails
    Given a URL returning a file with HTML content but video/* content-type
    When the download worker validates magic bytes
    Then validation fails
    And the temp file is cleaned up
    And the video status is set to "failed"

  Scenario: Network timeout
    Given a URL that never responds
    When 30 minutes elapse
    Then the download is aborted
    And the job fails with timeout error

  Scenario: Redirect to private IP (SSRF)
    Given a URL that returns 302 redirect to http://169.254.169.254/latest/meta-data/
    When the download worker follows the redirect
    Then the redirect is blocked
    And the job fails with "Blocked: private IP address"
```

## Performance Considerations

- **Streaming I/O**: Response body is piped to disk via Node.js streams -- memory usage stays constant regardless of file size
- **Worker concurrency**: 2 concurrent downloads balances throughput vs. resource usage
- **S3 upload**: Use putObject for files < 100MB, multipart for larger files (reuse existing calculatePartSize)
- **Temp directory**: Created per job in os.tmpdir(), cleaned up in finally block

## Security Hardening

1. **User-Agent header**: Set to `ClipMaker/1.0` to identify our requests
2. **Max redirects**: Cap at 5 to prevent redirect loops
3. **DNS resolution**: Use system resolver, validate all returned IPs
4. **No eval/exec**: URL is never used in shell commands or eval
5. **Temp file permissions**: Default OS permissions (0600 for user)
6. **Timeout at multiple levels**: 30-min overall timeout, plus Node fetch internal timeouts

## Technical Debt

- [ ] Add progress tracking (% downloaded) via BullMQ job progress updates
- [ ] Add yt-dlp integration for YouTube/Vimeo URLs
- [ ] Add download resume capability for interrupted large file downloads
- [ ] Add bandwidth throttling to prevent saturating VPS network
