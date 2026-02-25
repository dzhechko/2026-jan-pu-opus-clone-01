# Refinement: S3 Upload

## Edge Cases Matrix

| # | Edge Case | Impact | Handling |
|---|-----------|--------|----------|
| 1 | Upload cancelled mid-flight (simple) | Incomplete file in S3 | No file if PUT never completed; presigned URL expires |
| 2 | Upload cancelled mid-flight (multipart) | Orphaned parts in S3 | Abort multipart via API; add cleanup cron for stale uploads |
| 3 | Browser crashes during upload | Video stuck in `uploading` | Stale upload cleanup: cron marks >24h `uploading` videos as `failed` |
| 4 | User uploads non-video file with video extension | Corrupted pipeline | Magic bytes validation in `confirmUpload` rejects + deletes |
| 5 | Presigned URL expires before upload completes | Upload fails at S3 | Client detects 403, shows "ссылка истекла, попробуйте снова" |
| 6 | S3 bucket CORS not configured | Browser CORS error | Detect CORS error, show setup instructions (admin-facing) |
| 7 | S3 credentials invalid/expired | All S3 ops fail | Graceful error: "Ошибка хранилища, попробуйте позже" |
| 8 | File exactly 100MB | Boundary condition | Use `<=` for simple upload, `>` for multipart |
| 9 | Very slow upload (mobile, low bandwidth) | URL may expire | 1-hour expiry sufficient for 100MB at 30KB/s (~55 min) |
| 10 | Concurrent uploads from same user | Race conditions | Rate limit (10/hr) + unique videoId per upload |
| 11 | 4GB file (max size) | ~400 parts at 10MB | Test with large files; increase part size for fewer parts |
| 12 | Empty file (0 bytes) | Invalid video | Check fileSize > 0 in `createFromUpload` |
| 13 | Filename with special characters | S3 key issues | Sanitize: use only videoId in S3 key, not filename |
| 14 | User refreshes page during upload | Upload lost | Show warning via `beforeunload`; future: resumable uploads |
| 15 | confirmUpload called before upload completes | HeadObject fails | Return error, keep status `uploading`, user retries |

## Testing Strategy

### Unit Tests
| Test | Module | What |
|------|--------|------|
| `s3-client.test.ts` | `packages/s3` | Client initialization with env vars |
| `paths.test.ts` | `packages/s3` | Path builders produce correct keys |
| `validation.test.ts` | `packages/s3` | Magic bytes for all 4 formats + rejection |
| `presign.test.ts` | `packages/s3` | Presigned URL generation (mock S3Client) |
| `multipart.test.ts` | `packages/s3` | Part size calculation, part count |

### Integration Tests
| Test | Scope | What |
|------|-------|------|
| `upload-flow.test.ts` | tRPC + S3 mock | createFromUpload → confirmUpload flow |
| `download-flow.test.ts` | tRPC + S3 mock | clip.download generates presigned URL |
| `multipart-flow.test.ts` | tRPC + S3 mock | createFromUpload → completeMultipart → confirmUpload |

### E2E Tests (Playwright)
| Test | What |
|------|------|
| `upload-video.spec.ts` | Drag file → progress bar → processing starts |
| `download-clip.spec.ts` | Click download → file downloads |

### BDD Scenarios (Gherkin)
```gherkin
Feature: Video Upload to S3

  Scenario: Upload small video file
    Given I am logged in as a user with free plan
    When I drag a 50MB MP4 file to the upload area
    Then I should see a progress bar with percentage
    And the file should be uploaded to S3
    And the video status should become "transcribing"

  Scenario: Upload large video file via multipart
    Given I am logged in as a user with pro plan
    When I upload a 2GB MP4 file
    Then I should see multipart upload progress
    And all parts should be uploaded in parallel
    And the video status should become "transcribing"

  Scenario: Reject non-video file
    Given I am logged in
    When I upload a file with .mp4 extension but PDF content
    Then the confirmUpload should fail with "Invalid file format"
    And the file should be deleted from S3

  Scenario: Rate limit exceeded
    Given I have uploaded 10 videos in the last hour
    When I try to upload another video
    Then I should see "Слишком много загрузок. Подождите"

  Scenario: Download rendered clip
    Given I have a clip in "ready" status
    When I click the download button
    Then I should receive a presigned URL
    And the clip file should download
```

## Performance Optimizations

| Area | Optimization | Expected Impact |
|------|-------------|----------------|
| Multipart parallelism | 3 concurrent part uploads | ~3x faster for large files |
| Part size tuning | 10-100MB parts based on file size | Balance request overhead vs chunk size |
| S3 client singleton | Reuse across requests | Avoid repeated connection setup |
| Presigned URL caching | N/A (each upload gets unique URL) | — |
| Client-side pre-validation | Magic bytes check before upload | Avoid wasting bandwidth on invalid files |

## Security Hardening

| Area | Measure |
|------|---------|
| Presigned URL scope | PUT restricted to specific key, Content-Length limit |
| S3 bucket policy | Deny public access, allow only presigned URL operations |
| CORS | Restrict AllowedOrigins to production + localhost |
| Rate limiting | 10 uploads/hr per user via Redis |
| File validation | Client-side MIME + magic bytes; server-side magic bytes via Range GET |
| Cleanup | Auto-delete abandoned uploads (>24h in `uploading` status) |

## Technical Debt Items

| Item | Priority | Notes |
|------|----------|-------|
| Resumable uploads | Low | Store multipart uploadId in DB for resume after page refresh |
| CDN integration | Medium | CloudFront-equivalent for clip downloads |
| S3 lifecycle policies | Medium | Auto-delete free tier files after 3 days |
| Upload bandwidth monitoring | Low | Track upload speeds for capacity planning |
