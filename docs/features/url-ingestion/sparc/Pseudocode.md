# Pseudocode: URL Ingestion

## Data Structures

### VideoDownloadJobData (packages/types/src/queue.ts)
```typescript
type VideoDownloadJobData = {
  videoId: string;
  url: string;
  userId: string;
  strategy: 'ru' | 'global';
};
```

### Queue Name Addition
```typescript
// Add to QueueName union type
type QueueName = ... | 'video-download';

// Add to QUEUE_NAMES constant
QUEUE_NAMES.VIDEO_DOWNLOAD = 'video-download';
```

## Core Algorithm: Download Worker

```
FUNCTION processDownloadJob(job: VideoDownloadJobData):
  videoId = job.videoId
  url = job.url
  userId = job.userId
  strategy = job.strategy
  tmpDir = null

  TRY:
    // 1. Validate video exists and is in correct state
    video = DB.findVideo(videoId)
    IF video is null OR video.status != 'downloading':
      THROW "Invalid video state"

    user = DB.findUser(video.userId)
    IF user is null:
      THROW "User not found"

    // 2. SSRF Protection: validate URL before any network request
    parsedUrl = parseURL(url)
    IF parsedUrl.protocol NOT IN ['http:', 'https:']:
      THROW "Only HTTP/HTTPS URLs are supported"

    resolvedIPs = DNS.resolve(parsedUrl.hostname)
    FOR EACH ip IN resolvedIPs:
      IF isPrivateIP(ip):
        THROW "Blocked: private IP address"

    // 3. Make HTTP request with streaming
    response = HTTP.fetch(url, {
      redirect: 'manual',  // Handle redirects ourselves for SSRF check
      signal: AbortSignal.timeout(30 * 60 * 1000),
      headers: { 'User-Agent': 'ClipMaker/1.0' }
    })

    // 3a. Handle redirects (max 5)
    redirectCount = 0
    WHILE response.status IN [301, 302, 303, 307, 308]:
      redirectCount++
      IF redirectCount > 5:
        THROW "Too many redirects"
      redirectUrl = response.headers.location
      validateSSRF(redirectUrl)  // Re-check each redirect
      response = HTTP.fetch(redirectUrl, { redirect: 'manual', ... })

    IF response.status != 200:
      THROW "HTTP error: {response.status}"

    // 4. Validate Content-Type
    contentType = response.headers['content-type']
    IF contentType AND NOT contentType.startsWith('video/')
       AND NOT contentType == 'application/octet-stream':
      THROW "Invalid content type: {contentType}"

    // 5. Check Content-Length if available
    contentLength = parseInt(response.headers['content-length'])
    IF contentLength > MAX_FILE_SIZE (4GB):
      THROW "File too large: {contentLength} bytes"

    // 6. Stream response body to temp file with size tracking
    tmpDir = createTempDir('download-')
    ext = guessExtension(contentType, url) // 'mp4' default
    tmpPath = tmpDir + '/source.' + ext

    bytesReceived = 0
    writeStream = createWriteStream(tmpPath)

    FOR EACH chunk IN response.body:
      bytesReceived += chunk.length
      IF bytesReceived > MAX_FILE_SIZE:
        writeStream.destroy()
        THROW "Download exceeded 4GB limit"
      writeStream.write(chunk)

    writeStream.close()

    // 7. Validate magic bytes
    first16Bytes = readFirstBytes(tmpPath, 16)
    magicCheck = validateMagicBytes(first16Bytes)
    IF NOT magicCheck.valid:
      THROW "Invalid video format (magic bytes check failed)"

    // 8. Get file size
    fileSize = getFileSize(tmpPath)

    // 9. Upload to S3
    s3Key = videoSourcePath(userId, videoId, ext)
    uploadToS3(s3Key, tmpPath, 'video/' + ext)

    // 10. Update DB record
    DB.updateVideo(videoId, {
      status: 'transcribing',
      filePath: s3Key,
      fileSize: fileSize,
    })

    // 11. Enqueue STT job (same as confirmUpload)
    sttQueue.add('stt', {
      videoId: videoId,
      filePath: s3Key,
      strategy: strategy,
      language: 'ru',
    })

    LOG.info("Download complete", { videoId, fileSize, s3Key })

  CATCH error:
    LOG.error("Download failed", { videoId, error })
    THROW error  // Let BullMQ retry

  FINALLY:
    // Always clean up temp files
    IF tmpDir:
      deleteDirectory(tmpDir, { recursive: true, force: true })
```

## SSRF Validation Function

```
FUNCTION isPrivateIP(ip: string): boolean
  // IPv4 private ranges
  IF ip matches 10.0.0.0/8: RETURN true
  IF ip matches 172.16.0.0/12: RETURN true
  IF ip matches 192.168.0.0/16: RETURN true
  IF ip matches 127.0.0.0/8: RETURN true
  IF ip matches 169.254.0.0/16: RETURN true  // link-local + cloud metadata
  IF ip matches 0.0.0.0/8: RETURN true

  // IPv6 private ranges
  IF ip == '::1': RETURN true
  IF ip starts with 'fc00:' or 'fd00:': RETURN true  // unique local
  IF ip starts with 'fe80:': RETURN true  // link-local

  RETURN false
```

## Extension Guessing Function

```
FUNCTION guessExtension(contentType: string | null, url: string): string
  // Try content-type first
  CONTENT_TYPE_MAP = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
  }
  IF contentType IN CONTENT_TYPE_MAP:
    RETURN CONTENT_TYPE_MAP[contentType]

  // Try URL path extension
  urlPath = parseURL(url).pathname
  ext = extractExtension(urlPath)  // reuse existing function
  IF ext IN ALLOWED_EXTENSIONS:
    RETURN ext

  RETURN 'mp4'  // default
```

## API Contract Changes

### createFromUrl mutation (existing, wire TODO)
```typescript
// After video record creation, add:
const downloadQueue = createQueue(QUEUE_NAMES.VIDEO_DOWNLOAD);
await downloadQueue.add('video-download', {
  videoId: video.id,
  url: input.url,
  userId: userId,
  strategy: user.llmProviderPreference ?? 'ru',
} satisfies VideoDownloadJobData, DEFAULT_JOB_OPTIONS);
```

## State Transitions

```
createFromUrl called
  └─> status: 'downloading' (DB record created, job enqueued)
      └─> Download worker picks up job
          ├─> SSRF check fails -> status: 'failed' (after retries)
          ├─> HTTP error -> retry up to 3x -> status: 'failed'
          ├─> Content-Type invalid -> status: 'failed'
          ├─> File too large -> status: 'failed'
          ├─> Magic bytes invalid -> status: 'failed'
          └─> Success:
              └─> Upload to S3
                  └─> status: 'transcribing' (STT job enqueued)
                      └─> (existing pipeline continues)
```
