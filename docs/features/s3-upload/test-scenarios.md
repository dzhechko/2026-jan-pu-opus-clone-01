# S3 Upload — BDD Test Scenarios

## Feature: US-S3-01 — Upload Video via Presigned URL

### Happy Path

```gherkin
Scenario: Small file upload via single presigned PUT URL
  Given I am an authenticated course author "user-42"
  And I have uploaded 2 videos this hour (under the 10/hour limit)
  When I initiate upload of "lecture-intro.mp4" with file size 85 MB
  Then the server creates a video record with status "uploading"
  And the server returns a single presigned PUT URL with 1-hour expiry
  And the S3 key follows the pattern "videos/user-42/<videoId>/source.mp4"
  And the browser uploads directly to S3 bypassing the API server
  And the progress bar shows percentage, speed in MB/s, and ETA
  And after completion the upload result contains an ETag

Scenario: Large file upload via multipart presigned URLs
  Given I am an authenticated course author "user-42"
  When I initiate upload of "full-webinar.mov" with file size 2.5 GB
  Then the server returns a multipart upload config with an uploadId
  And the part size is calculated between 10 MB and 100 MB
  And approximately 100 part URLs are returned, each with 1-hour expiry
  And the browser uploads parts in batches of 3 concurrently
  And the progress bar aggregates progress across all parts
  And after all parts upload, the client calls completeMultipart with ETags
  And the server completes the multipart upload on S3
```

### Error Handling

```gherkin
Scenario: Upload exceeds 4 GB maximum file size
  Given I am an authenticated course author
  When I initiate upload of "marathon-stream.mp4" with file size 5368709120 bytes (5 GB)
  Then the server rejects with BAD_REQUEST "Максимальный размер файла: 4 ГБ"
  And no video record is created in the database
  And no presigned URL is generated

Scenario: Rate limit exceeded — 10 uploads per hour
  Given I am an authenticated course author "user-42"
  And I have already uploaded 10 videos in the last hour
  When I initiate upload of "lecture-11.mp4" with file size 50 MB
  Then the server rejects with RATE_LIMITED error
  And the response indicates how long until the rate limit resets

Scenario: Network error during single-file upload
  Given I am uploading "lecture.mp4" (80 MB) via a single presigned PUT URL
  When the network connection drops at 45% progress
  Then the progress bar pauses and shows "Ошибка сети"
  And the upload result returns { success: false }

Scenario: Presigned URL expires during multipart upload
  Given I am uploading "long-webinar.mp4" (3 GB) via multipart upload
  And the upload has been in progress for over 1 hour
  When a part upload returns HTTP 403
  Then the client shows "Ссылка загрузки истекла, попробуйте снова"
  And the upload result returns { success: false }
```

### Edge Cases

```gherkin
Scenario: Upload exactly 100 MB file (boundary between single and multipart)
  Given I am an authenticated course author
  When I initiate upload of "boundary.mp4" with file size 104857600 bytes (exactly 100 MB)
  Then the server returns a single presigned PUT URL (not multipart)
  And the upload proceeds as a single PUT request

Scenario: Upload file with zero-byte size
  Given I am an authenticated course author
  When I initiate upload of "empty.mp4" with file size 0
  Then the server rejects with BAD_REQUEST "Размер файла должен быть больше 0"
  And no video record is created

Scenario: User cancels multipart upload mid-flight
  Given I am uploading "webinar.mp4" (1.5 GB) via multipart upload
  And 40% of parts have been uploaded
  When I click the cancel button
  Then the AbortController signal fires
  And in-flight XHR requests are aborted
  And the client calls abortMultipart on the server
  And the server issues abortMultipartUpload to S3 to free resources
  And the upload result returns { success: false }
```

### Security

```gherkin
Scenario: Unauthenticated user cannot initiate upload
  Given I am not logged in
  When I call video.createFromUpload with title "test" and file size 50 MB
  Then the server rejects with UNAUTHORIZED error
  And no presigned URL is generated

Scenario: Path traversal in fileName is sanitized
  Given I am an authenticated course author "user-42"
  When I initiate upload with fileName "../../etc/passwd.mp4" and file size 50 MB
  Then the server strips path components from the fileName
  And the S3 key is "videos/user-42/<videoId>/source.mp4"
  And no path traversal occurs in the generated key
```

---

## Feature: US-S3-02 — Confirm Upload and Start Processing

### Happy Path

```gherkin
Scenario: Successful upload confirmation triggers STT processing
  Given I am authenticated as course author "user-42"
  And video "vid-001" exists with status "uploading" and filePath "videos/user-42/vid-001/source.mp4"
  And the file exists in S3 at that path with Content-Length 157286400 (150 MB)
  And the first 16 bytes of the file match MP4 magic bytes (0x00000020 66747970)
  When I call video.confirmUpload with videoId "vid-001"
  Then the server performs HeadObject on the S3 key and confirms existence
  Then the server reads bytes 0-15 via Range GET and validates MP4 format
  And the video record is updated: status "transcribing", fileSize 157286400
  And an STT job is enqueued in BullMQ with videoId "vid-001" and strategy "ru"
  And the response returns { status: "transcribing" }

Scenario: Confirm upload for WebM video
  Given I am authenticated as course author "user-42"
  And video "vid-002" has status "uploading" and filePath "videos/user-42/vid-002/source.webm"
  And the file in S3 has magic bytes [0x1A, 0x45, 0xDF, 0xA3] at offset 0
  When I call video.confirmUpload with videoId "vid-002"
  Then magic bytes validation identifies format as "webm"
  And the video status transitions to "transcribing"
  And an STT job is enqueued
```

### Error Handling

```gherkin
Scenario: Confirm upload when file does not exist in S3
  Given I am authenticated as course author "user-42"
  And video "vid-003" exists with status "uploading"
  But the file does NOT exist in S3 at the expected path
  When I call video.confirmUpload with videoId "vid-003"
  Then S3 HeadObject returns NotFound
  And the server rejects with NOT_FOUND "Файл не найден в хранилище"
  And the video status remains "uploading"

Scenario: Confirm upload with invalid file format (PDF disguised as MP4)
  Given I am authenticated as course author "user-42"
  And video "vid-004" exists with status "uploading"
  And the file in S3 has magic bytes [0x25, 0x50, 0x44, 0x46] (PDF signature "%PDF")
  When I call video.confirmUpload with videoId "vid-004"
  Then magic bytes validation returns { valid: false, format: null }
  And the server deletes the file from S3
  And the video record is deleted from the database
  And the server rejects with BAD_REQUEST "Неподдерживаемый формат файла"

Scenario: Confirm upload for video already in processing
  Given I am authenticated as course author "user-42"
  And video "vid-005" exists with status "transcribing"
  When I call video.confirmUpload with videoId "vid-005"
  Then the server rejects with CONFLICT "Video already processing"
  And no duplicate STT job is enqueued
```

### Edge Cases

```gherkin
Scenario: Confirm upload for AVI file with dual magic byte check
  Given I am authenticated as course author "user-42"
  And video "vid-006" has status "uploading"
  And the file in S3 has bytes [0x52,0x49,0x46,0x46] at offset 0 and [0x41,0x56,0x49,0x20] at offset 8
  When I call video.confirmUpload with videoId "vid-006"
  Then magic bytes validation identifies format as "avi" (both RIFF + AVI checks pass)
  And the video status transitions to "transcribing"

Scenario: File with RIFF header but not AVI (e.g., WAV audio file)
  Given I am authenticated as course author "user-42"
  And video "vid-007" has status "uploading"
  And the file in S3 has [0x52,0x49,0x46,0x46] at offset 0 but [0x57,0x41,0x56,0x45] at offset 8 (WAVE)
  When I call video.confirmUpload with videoId "vid-007"
  Then magic bytes validation returns { valid: false, format: null }
  And the server deletes the file from S3
  And the video record is deleted from the database
  And the server rejects with BAD_REQUEST "Неподдерживаемый формат файла"

Scenario: MOV vs MP4 disambiguation — MOV detected by extended ftyp signature
  Given I am authenticated as course author "user-42"
  And video "vid-008" has status "uploading"
  And the file in S3 has bytes [0x66,0x74,0x79,0x70,0x71,0x74] at offset 4 ("ftypqt")
  When I call video.confirmUpload with videoId "vid-008"
  Then magic bytes validation identifies format as "mov" (not "mp4")
  And the video status transitions to "transcribing"
```

### Security

```gherkin
Scenario: User cannot confirm another user's video
  Given I am authenticated as course author "user-42"
  And video "vid-009" belongs to user "user-99" with status "uploading"
  When I call video.confirmUpload with videoId "vid-009"
  Then the server rejects with NOT_FOUND
  And no status change occurs on the video

Scenario: S3 access denied during HeadObject
  Given I am authenticated as course author "user-42"
  And video "vid-010" exists with status "uploading"
  But S3 returns AccessDenied on HeadObject for the file key
  When I call video.confirmUpload with videoId "vid-010"
  Then the server rejects with S3_ACCESS_DENIED "Ошибка хранилища: доступ запрещён"
  And the video status remains "uploading"
```

---

## Feature: US-S3-03 — Download Rendered Clips

### Happy Path

```gherkin
Scenario: Download a ready clip via presigned GET URL
  Given I am authenticated as course author "user-42"
  And clip "clip-001" belongs to me with status "ready"
  And clip "clip-001" has filePath "clips/user-42/vid-001/clip-001.mp4"
  When I call clip.download with id "clip-001"
  Then the server generates a presigned GET URL with 1-hour expiry
  And the response is JSON { downloadUrl: "<presigned-url>" }
  And the response is NOT a 302 redirect
  And the client can download via window.location.href = downloadUrl
```

### Error Handling

```gherkin
Scenario: Download a clip that is still rendering
  Given I am authenticated as course author "user-42"
  And clip "clip-002" belongs to me with status "rendering"
  When I call clip.download with id "clip-002"
  Then the server rejects with BAD_REQUEST "Clip not ready"
  And no presigned URL is generated

Scenario: Download a clip with missing filePath
  Given I am authenticated as course author "user-42"
  And clip "clip-003" belongs to me with status "ready"
  But clip "clip-003" has filePath set to null
  When I call clip.download with id "clip-003"
  Then the server rejects with NOT_FOUND "Clip file not found"

Scenario: S3 access denied when generating download URL
  Given I am authenticated as course author "user-42"
  And clip "clip-004" belongs to me with status "ready" and a valid filePath
  But S3 returns AccessDenied when signing the GetObject command
  When I call clip.download with id "clip-004"
  Then the server rejects with S3_ACCESS_DENIED "Ошибка хранилища"
```

### Edge Cases

```gherkin
Scenario: Download URL expiry — client uses URL after 1 hour
  Given I previously obtained a download URL for clip "clip-001"
  And more than 1 hour has passed since the URL was generated
  When I attempt to download using the expired URL
  Then S3 returns HTTP 403 Forbidden
  And the client must request a new download URL

Scenario: Download non-existent clip
  Given I am authenticated as course author "user-42"
  When I call clip.download with id "clip-nonexistent"
  Then the server rejects with NOT_FOUND
```

### Security

```gherkin
Scenario: User cannot download another user's clip
  Given I am authenticated as course author "user-42"
  And clip "clip-005" belongs to user "user-99" with status "ready"
  When I call clip.download with id "clip-005"
  Then the server rejects with NOT_FOUND
  And no presigned URL is generated for the other user's clip

Scenario: Unauthenticated user cannot download clips
  Given I am not logged in
  When I call clip.download with id "clip-001"
  Then the server rejects with UNAUTHORIZED error
```

---

## Feature: US-S3-04 — S3 Client Package

### Happy Path

```gherkin
Scenario: S3 client initializes with valid environment variables
  Given environment variables are set:
    | S3_ENDPOINT          | https://s3.cloud.ru            |
    | S3_REGION            | ru-central-1                   |
    | S3_ACCESS_KEY_ID     | tenant123:key456               |
    | S3_SECRET_ACCESS_KEY | secret789                      |
    | S3_BUCKET_NAME       | clipmaker-storage              |
  When the S3 client is initialized
  Then it creates an S3Client singleton with forcePathStyle: true
  And initialization completes in under 100 ms
  And the same instance is returned on subsequent imports

Scenario: Path builders generate deterministic S3 keys
  Given userId "user-42", videoId "vid-001", clipId "clip-001"
  When I call videoSourcePath("user-42", "vid-001", "mp4")
  Then it returns "videos/user-42/vid-001/source.mp4"
  When I call clipPath("user-42", "vid-001", "clip-001")
  Then it returns "clips/user-42/vid-001/clip-001.mp4"
  When I call thumbnailPath("user-42", "vid-001", "clip-001")
  Then it returns "thumbnails/user-42/vid-001/clip-001.jpg"
```

### Error Handling

```gherkin
Scenario: S3 client fails to initialize with missing endpoint
  Given environment variable S3_ENDPOINT is not set
  And all other S3 env vars are present
  When the S3 client is initialized
  Then it throws "Missing S3 configuration: S3_ENDPOINT"
  And no S3Client instance is created

Scenario: S3 client fails to initialize with missing credentials
  Given environment variable S3_SECRET_ACCESS_KEY is not set
  And all other S3 env vars are present
  When the S3 client is initialized
  Then it throws "Missing S3 configuration: S3_SECRET_ACCESS_KEY"

Scenario: putObject retries on transient S3 errors
  Given the S3 client is properly initialized
  And S3 returns ServiceUnavailable on the first PutObject attempt
  And S3 returns success on the second attempt
  When I call putObject("test/key.mp4", <buffer>, "video/mp4")
  Then the operation retries after 1 second (exponential backoff)
  And the second attempt succeeds
  And no error is thrown

Scenario: deleteObject is idempotent for already-deleted keys
  Given the S3 client is properly initialized
  And the key "videos/user-42/vid-old/source.mp4" does not exist in S3
  When I call deleteObject("videos/user-42/vid-old/source.mp4")
  Then S3 returns NoSuchKey
  And the function completes without error (no-op)
```

### Edge Cases

```gherkin
Scenario: extractExtension handles malicious path components
  Given a fileName input "../../etc/passwd.mp4"
  When I call extractExtension with that fileName
  Then path separators are stripped
  And the returned extension is "mp4"

Scenario: extractExtension falls back to mp4 for unsupported extension
  Given a fileName input "lecture.mkv"
  When I call extractExtension with that fileName
  Then "mkv" is not in ALLOWED_EXTENSIONS
  And the returned extension is "mp4" (fallback)

Scenario: extractExtension handles file with no extension
  Given a fileName input "rawvideo"
  When I call extractExtension with that fileName
  Then parts.length is less than 2
  And the returned extension is "mp4" (fallback)
```

### Security

```gherkin
Scenario: S3 client works in both Next.js API routes and BullMQ workers
  Given the same packages/s3 module is imported
  When imported in a Next.js API route (Node runtime)
  Then the S3Client initializes and operates correctly
  When imported in a standalone BullMQ worker process
  Then the same S3Client configuration is used
  And both runtimes share consistent bucket and path logic

Scenario: putObject throws on AccessDenied without retry
  Given the S3 client is properly initialized
  And S3 returns AccessDenied on PutObject
  When I call putObject("test/key.mp4", <buffer>, "video/mp4")
  Then the function throws S3_ACCESS_DENIED "Storage access denied"
  And no retry is attempted (AccessDenied is not transient)
```

---

## Summary

| Feature | Happy | Error | Edge | Security | Total |
|---------|-------|-------|------|----------|-------|
| US-S3-01: Upload via Presigned URL | 2 | 4 | 3 | 2 | 11 |
| US-S3-02: Confirm Upload | 2 | 3 | 3 | 2 | 10 |
| US-S3-03: Download Clips | 1 | 3 | 2 | 2 | 8 |
| US-S3-04: S3 Client Package | 2 | 4 | 3 | 2 | 11 |
| **Total** | **7** | **14** | **11** | **8** | **40** |
