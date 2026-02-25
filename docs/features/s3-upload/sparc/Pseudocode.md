# Pseudocode: S3 Upload

## Data Structures

```typescript
// packages/s3/src/config.ts
type S3Config = {
  endpoint: string;       // https://s3.cloud.ru
  region: string;         // ru-central-1
  accessKeyId: string;    // <tenant_id>:<key_id>
  secretAccessKey: string;
  bucket: string;         // clipmaker-storage
  forcePathStyle: boolean; // true for non-AWS S3
};

// packages/s3/src/paths.ts
// Canonical names: videoSourcePath, clipPath, thumbnailPath (with Path suffix)
function videoSourcePath(userId: string, videoId: string, ext: string): string {
  return `videos/${userId}/${videoId}/source.${ext}`;
}

function clipPath(userId: string, videoId: string, clipId: string): string {
  return `clips/${userId}/${videoId}/${clipId}.mp4`;
}

function thumbnailPath(userId: string, videoId: string, clipId: string): string {
  return `thumbnails/${userId}/${videoId}/${clipId}.jpg`;
}

// Upload types
type PresignedUploadResult = {
  uploadUrl: string;
  key: string;
  expiresIn: number;
};

type MultipartUploadInit = {
  uploadId: string;
  key: string;
  partUrls: { partNumber: number; url: string }[];
  partSize: number;
};

type UploadProgress = {
  loaded: number;
  total: number;
  percentage: number;
  speedMBps: number;
  etaSeconds: number;
};
```

## Algorithm: S3 Client Factory

```
INPUT: env vars (S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME, S3_REGION)
OUTPUT: configured S3Client singleton

STEPS:
1. Validate all required env vars present
   IF any missing: throw "Missing S3 configuration: <varName>"
2. Create S3Client with:
   - endpoint: S3_ENDPOINT
   - region: S3_REGION (default 'ru-central-1')
   - credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY }
   - forcePathStyle: true
3. Export singleton (module-level, lazy-initialized)
```

## Helper: extractExtension

```
INPUT: fileName: string
OUTPUT: string (extension without dot, e.g. "mp4")

STEPS:
1. // Strip path components (security: user may send "../../evil.mp4")
   baseName = fileName.split('/').pop() ?? fileName
   baseName = baseName.split('\\').pop() ?? baseName
2. parts = baseName.split('.')
3. IF parts.length < 2: RETURN 'mp4'  // fallback for extensionless files
4. ext = parts[parts.length - 1].toLowerCase().trim()
5. ALLOWED_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi']
6. IF ext NOT IN ALLOWED_EXTENSIONS: RETURN 'mp4'  // fallback to mp4
7. RETURN ext
```

## Helper: S3 Operations Wrappers

```
// putObject — wraps PutObjectCommand with error handling
FUNCTION putObject(key: string, body: Buffer | Uint8Array, contentType: string):
  TRY:
    await s3Client.send(new PutObjectCommand({
      Bucket, Key: key, Body: body, ContentType: contentType
    }))
  CATCH error:
    IF error.name == 'AccessDenied': throw S3_ACCESS_DENIED "Storage access denied"
    IF isTransientError(error): retry up to 2 times with exponential backoff (1s, 2s)
    throw S3_ERROR "Storage error: ${error.message}"

// deleteObject — wraps DeleteObjectCommand with error handling
FUNCTION deleteObject(key: string):
  TRY:
    await s3Client.send(new DeleteObjectCommand({ Bucket, Key: key }))
  CATCH error:
    IF error.name == 'AccessDenied': throw S3_ACCESS_DENIED "Storage access denied"
    // DeleteObject is idempotent; NoSuchKey is not an error
    IF error.name == 'NoSuchKey': RETURN  // already deleted, no-op
    IF isTransientError(error): retry up to 2 times with exponential backoff (1s, 2s)
    throw S3_ERROR "Storage error: ${error.message}"

// isTransientError — checks if S3 error is retryable
FUNCTION isTransientError(error): boolean
  RETURN error.name IN ['ServiceUnavailable', 'SlowDown', 'InternalError']
    OR error.$metadata?.httpStatusCode IN [500, 502, 503]
```

## Algorithm: Generate Presigned Upload URL

```
INPUT: userId: string, videoId: string, fileName: string, fileSize: number
OUTPUT: PresignedUploadResult | MultipartUploadInit

STEPS:
1. ext = extractExtension(fileName)
2. key = videoSourcePath(userId, videoId, ext)

3. IF fileSize <= 100MB:
   // Simple presigned PUT
   TRY:
     command = new PutObjectCommand({
       Bucket, Key: key, ContentLength: fileSize, ContentType: `video/${ext}`
     })
     url = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
     RETURN { uploadUrl: url, key, expiresIn: 3600 }
   CATCH error:
     IF error.name == 'AccessDenied': throw S3_ACCESS_DENIED "Ошибка хранилища: доступ запрещён"
     IF isTransientError(error): retry up to 2 times with exponential backoff
     throw S3_ERROR "Ошибка хранилища: ${error.message}"

4. IF fileSize > 100MB:
   // Multipart upload
   partSize = calculatePartSize(fileSize)
   numParts = ceil(fileSize / partSize)

   TRY:
     createResp = await s3.createMultipartUpload({ Bucket, Key: key, ContentType: `video/${ext}` })
     uploadId = createResp.UploadId

     partUrls = []
     FOR partNumber = 1 TO numParts:
       command = new UploadPartCommand({
         Bucket, Key: key, UploadId: uploadId, PartNumber: partNumber
       })
       url = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
       partUrls.push({ partNumber, url })

     RETURN { uploadId, key, partUrls, partSize }
   CATCH error:
     IF error.name == 'AccessDenied': throw S3_ACCESS_DENIED "Ошибка хранилища: доступ запрещён"
     IF isTransientError(error): retry up to 2 times with exponential backoff
     throw S3_ERROR "Ошибка хранилища: ${error.message}"

HELPER calculatePartSize(fileSize):
  // Target ~100 parts for optimal parallel upload
  // Floor is 10MB (above S3 API minimum of 5MB) for better throughput per part
  targetParts = 100
  partSize = ceil(fileSize / targetParts)
  partSize = max(partSize, 10 * 1024 * 1024)   // min 10MB (S3 min is 5MB; 10MB chosen for efficiency)
  partSize = min(partSize, 100 * 1024 * 1024)   // max 100MB
  RETURN partSize
```

## Algorithm: Complete Multipart Upload

```
INPUT: videoId: string, uploadId: string, parts: { partNumber: number, etag: string }[]
OUTPUT: { success: boolean }

STEPS:
1. // Look up video to get the S3 key
   video = db.video.findFirst({ where: { id: videoId, userId } })
   IF !video: throw NOT_FOUND
   key = video.filePath

2. TRY:
     await s3.completeMultipartUpload({
       Bucket, Key: key, UploadId: uploadId,
       MultipartUpload: { Parts: parts.map(p => ({ PartNumber: p.partNumber, ETag: p.etag })) }
     })
     RETURN { success: true }
   CATCH error:
     // On unrecoverable error, abort the multipart upload to free S3 resources
     TRY:
       await s3.abortMultipartUpload({ Bucket, Key: key, UploadId: uploadId })
     CATCH abortError:
       // Log but don't throw — stale cleanup cron will handle orphans
       log.warn("Failed to abort multipart upload", { uploadId, error: abortError })
     throw S3_ERROR "Ошибка завершения загрузки: ${error.message}"
```

## Algorithm: Confirm Upload

```
INPUT: videoId: string, userId: string
OUTPUT: { status: VideoStatus }

STEPS:
1. video = db.video.findFirst({ where: { id: videoId, userId } })
   IF !video: throw NOT_FOUND
   IF video.status != 'uploading': throw CONFLICT "Video already processing"

2. // Verify file exists in S3
   TRY:
     headResult = await s3.headObject({ Bucket, Key: video.filePath })
   CATCH error:
     IF error.name == 'NotFound' OR error.name == 'NoSuchKey':
       throw NOT_FOUND "Файл не найден в хранилище"
     IF error.name == 'AccessDenied':
       throw S3_ACCESS_DENIED "Ошибка хранилища: доступ запрещён"
     IF isTransientError(error): retry up to 2 times with exponential backoff
     throw S3_ERROR "Ошибка хранилища: ${error.message}"

3. // Validate magic bytes
   TRY:
     rangeResult = await s3.getObject({ Bucket, Key: video.filePath, Range: 'bytes=0-15' })
     bytes = await rangeResult.Body.transformToByteArray()
   CATCH error:
     throw S3_ERROR "Ошибка чтения файла: ${error.message}"

   IF !validateMagicBytes(bytes).valid:
     await deleteObject(video.filePath)
     await db.video.delete({ where: { id: videoId } })
     throw BAD_REQUEST "Неподдерживаемый формат файла"

4. // Update video record — persist fileSize from HeadObject, durationSeconds TBD
   fileSize = headResult.ContentLength
   strategy = video.llmProviderUsed ?? 'ru'  // default to 'ru' if null
   await db.video.update({
     where: { id: videoId },
     data: { status: 'transcribing', fileSize, durationSeconds: null }
   })

5. // Enqueue STT job
   await sttQueue.add('stt', {
     videoId, userId,
     filePath: video.filePath,
     strategy
   })

6. RETURN { status: 'transcribing' }
```

## Algorithm: Validate Magic Bytes

```
INPUT: bytes: Uint8Array (16 bytes)
OUTPUT: { valid: boolean, format: string | null }

// Order: webm first (unique 4 bytes), then mov (6 bytes at offset 4),
// then mp4 (4 bytes at offset 4), then avi (4+4 bytes at offsets 0 and 8)
MAGIC_BYTES = [
  { format: 'webm', checks: [
    { offset: 0, bytes: [0x1A, 0x45, 0xDF, 0xA3] }
  ]},
  { format: 'mov',  checks: [
    { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70, 0x71, 0x74] }  // 'ftypqt' (6 bytes)
  ]},
  { format: 'mp4',  checks: [
    { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }               // 'ftyp' (4 bytes)
  ]},
  { format: 'avi',  checks: [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },              // 'RIFF' at offset 0
    { offset: 8, bytes: [0x41, 0x56, 0x49, 0x20] }               // 'AVI ' at offset 8
  ]},
]

STEPS:
1. FOR each { format, checks } IN MAGIC_BYTES:
     allChecksPass = true
     FOR each { offset, bytes: expected } IN checks:
       FOR i = 0 TO expected.length:
         IF bytes[offset + i] != expected[i]:
           allChecksPass = false
           BREAK
       IF !allChecksPass: BREAK
     IF allChecksPass: RETURN { valid: true, format }

2. RETURN { valid: false, format: null }

NOTES:
- MOV is checked before MP4 because both share 'ftyp' at offset 4,
  but MOV has additional 'qt' bytes. Checking MOV first with 6 bytes
  distinguishes it from MP4 (which only matches 4 bytes).
- AVI requires BOTH 'RIFF' at offset 0 AND 'AVI ' at offset 8.
  Checking only 'RIFF' would false-positive on WAV, ANI, and other
  RIFF-container formats.
```

## Algorithm: Generate Download URL

```
INPUT: clipId: string, userId: string
OUTPUT: { downloadUrl: string }

STEPS:
1. clip = db.clip.findFirst({ where: { id: clipId, userId } })
   IF !clip: throw NOT_FOUND
   IF clip.status != 'ready': throw BAD_REQUEST "Clip not ready"
   IF !clip.filePath: throw NOT_FOUND "Clip file not found"

2. TRY:
     command = new GetObjectCommand({ Bucket, Key: clip.filePath })
     url = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
   CATCH error:
     IF error.name == 'AccessDenied': throw S3_ACCESS_DENIED "Ошибка хранилища"
     throw S3_ERROR "Ошибка хранилища: ${error.message}"

3. // Return JSON response (NOT 302 redirect). Client handles download via:
   // window.location.href = downloadUrl
   RETURN { downloadUrl: url }
```

## Algorithm: Browser Upload (Client-Side)

```
INPUT: file: File, uploadConfig: PresignedUploadResult | MultipartUploadInit, abortController: AbortController
OUTPUT: { success: boolean, etag?: string }

// Helper: splitFile — slice File into blobs for multipart
FUNCTION splitFile(file: File, partSize: number): Blob[]
  blobs = []
  offset = 0
  WHILE offset < file.size:
    end = min(offset + partSize, file.size)
    blobs.push(file.slice(offset, end))
    offset = end
  RETURN blobs

// Helper: uploadPart — XHR PUT to presigned URL with progress
FUNCTION uploadPart(url: string, blob: Blob, onProgress: (loaded: number) => void, abortSignal: AbortSignal): string
  RETURN new Promise((resolve, reject) => {
    xhr = new XMLHttpRequest()
    xhr.open('PUT', url)

    // Wire abort signal
    abortSignal.addEventListener('abort', () => xhr.abort())

    xhr.upload.onprogress = (e) => onProgress(e.loaded)
    xhr.onload = () => {
      IF xhr.status >= 200 AND xhr.status < 300:
        resolve(xhr.getResponseHeader('ETag'))
      ELSE IF xhr.status == 403:
        reject(new UploadError('URL_EXPIRED', 'Ссылка загрузки истекла, попробуйте снова'))
      ELSE:
        reject(new UploadError('UPLOAD_FAILED', `Upload failed: HTTP ${xhr.status}`))
    }
    xhr.onerror = () => reject(new UploadError('NETWORK_ERROR', 'Ошибка сети'))
    xhr.ontimeout = () => reject(new UploadError('TIMEOUT', 'Таймаут загрузки'))
    xhr.send(blob)
  })

// Helper: updateProgress — calculate percentage, speed, ETA and update React state
FUNCTION updateProgress(loaded: number, total: number, startTime: number):
  percentage = Math.round((loaded / total) * 100)
  elapsedSec = (Date.now() - startTime) / 1000
  speedMBps = elapsedSec > 0 ? (loaded / 1024 / 1024) / elapsedSec : 0
  remaining = total - loaded
  etaSeconds = speedMBps > 0 ? (remaining / 1024 / 1024) / speedMBps : 0
  setUploadProgress({ loaded, total, percentage, speedMBps, etaSeconds })


CASE simple upload (PresignedUploadResult):
  1. startTime = Date.now()
  2. TRY:
       etag = await uploadPart(
         uploadConfig.uploadUrl,
         file,
         (loaded) => updateProgress(loaded, file.size, startTime),
         abortController.signal
       )
       RETURN { success: true, etag }
     CATCH error:
       IF error.name == 'AbortError' OR abortController.signal.aborted:
         RETURN { success: false }  // user cancelled
       IF error.code == 'URL_EXPIRED':
         showError('Ссылка загрузки истекла, попробуйте снова')
       ELSE:
         showError('Ошибка загрузки: ' + error.message)
       RETURN { success: false }

CASE multipart upload (MultipartUploadInit):
  1. blobs = splitFile(file, uploadConfig.partSize)
  2. completedParts = []
  3. totalLoaded = 0
  4. startTime = Date.now()

  5. // Upload parts with concurrency limit (3 parallel)
  6. TRY:
       FOR batch IN chunks(uploadConfig.partUrls, 3):
         IF abortController.signal.aborted: BREAK

         results = await Promise.all(batch.map(async ({ partNumber, url }) =>
           blob = blobs[partNumber - 1]
           // Retry each part up to 2 times on transient failure
           FOR attempt = 1 TO 3:
             TRY:
               etag = await uploadPart(url, blob, (loaded) => {
                 totalLoaded += loaded
                 updateProgress(totalLoaded, file.size, startTime)
               }, abortController.signal)
               completedParts.push({ partNumber, etag })
               BREAK  // success, no retry needed
             CATCH error:
               IF error.code == 'URL_EXPIRED' OR attempt == 3: throw error
               await sleep(1000 * attempt)  // exponential backoff: 1s, 2s
         ))

       // Tell server to complete multipart
       await trpc.video.completeMultipart({
         videoId: uploadConfig.videoId,
         uploadId: uploadConfig.uploadId,
         parts: completedParts
       })
       RETURN { success: true }
     CATCH error:
       IF abortController.signal.aborted:
         // User cancelled — abort multipart upload on server to free S3 resources
         TRY: await trpc.video.abortMultipart({ videoId: uploadConfig.videoId, uploadId: uploadConfig.uploadId })
         CATCH: // best-effort; stale cleanup cron handles orphans
         RETURN { success: false }
       IF error.code == 'URL_EXPIRED':
         showError('Ссылка загрузки истекла, попробуйте снова')
       ELSE:
         showError('Ошибка загрузки: ' + error.message)
       RETURN { success: false }
```

## tRPC Procedure Definitions

### video.createFromUpload

```typescript
// protectedProcedure — requires authenticated session
video.createFromUpload = protectedProcedure
  .input(z.object({
    title: z.string().min(1).max(200),
    fileName: z.string().min(1).max(500),
    fileSize: z.number().int().positive().max(4 * 1024 * 1024 * 1024),  // max 4GB
  }))
  .mutation(async ({ input, ctx }) => {
    const userId = ctx.session.user.id;

    // Rate limit: 10 uploads per hour
    await checkRateLimit('upload', userId, 10, 3600);

    // Input guards
    IF input.fileSize <= 0: throw BAD_REQUEST "Размер файла должен быть больше 0"
    IF input.fileSize > 4 * 1024 * 1024 * 1024: throw BAD_REQUEST "Максимальный размер файла: 4 ГБ"

    // Sanitize fileName (strip path components, keep only basename)
    const sanitizedFileName = extractExtension(input.fileName);
    // ^ extractExtension already strips path separators

    // Create video record
    const ext = extractExtension(input.fileName);
    const videoId = generateId();
    const key = videoSourcePath(userId, videoId, ext);

    const video = await db.video.create({
      data: {
        id: videoId,
        title: input.title,
        userId,
        status: 'uploading',
        filePath: key,
        fileSize: input.fileSize,
        sourceType: 'upload',
      }
    });

    // Generate presigned URL(s)
    const upload = await generatePresignedUploadUrl(userId, videoId, input.fileName, input.fileSize);

    return { video: { id: video.id, title: video.title, status: video.status }, upload };
  });
```

### video.completeMultipart

```typescript
video.completeMultipart = protectedProcedure
  .input(z.object({
    videoId: z.string().uuid(),
    uploadId: z.string().min(1),
    parts: z.array(z.object({
      partNumber: z.number().int().positive(),
      etag: z.string().min(1),
    })).min(1),
  }))
  .mutation(async ({ input, ctx }) => {
    const userId = ctx.session.user.id;
    // See "Algorithm: Complete Multipart Upload" above
  });
```

### video.confirmUpload

```typescript
video.confirmUpload = protectedProcedure
  .input(z.object({
    videoId: z.string().uuid(),
  }))
  .mutation(async ({ input, ctx }) => {
    const userId = ctx.session.user.id;
    // See "Algorithm: Confirm Upload" above
  });
```

### clip.download

```typescript
clip.download = protectedProcedure
  .input(z.object({
    id: z.string().uuid(),  // clipId
  }))
  .mutation(async ({ input, ctx }) => {
    const userId = ctx.session.user.id;
    // See "Algorithm: Generate Download URL" above
    // Returns { downloadUrl: string } as JSON — NOT a 302 redirect
  });
```

## API Contracts

### tRPC: video.createFromUpload (updated)
```
INPUT: { title: string, fileName: string, fileSize: number }
  - title: 1–200 chars
  - fileName: 1–500 chars (path components stripped server-side)
  - fileSize: positive integer, max 4GB (4294967296 bytes)
OUTPUT: {
  video: { id: string, title: string, status: 'uploading' },
  upload: PresignedUploadResult | MultipartUploadInit
}
ERRORS: BAD_REQUEST (invalid input), RATE_LIMITED (10/hour)
```

### tRPC: video.completeMultipart (new)
```
INPUT: { videoId: string, uploadId: string, parts: { partNumber: number, etag: string }[] }
OUTPUT: { success: boolean }
ERRORS: NOT_FOUND (video), S3_ERROR (completion failed)
```

### tRPC: video.confirmUpload (new)
```
INPUT: { videoId: string }
OUTPUT: { status: VideoStatus }
ERRORS: NOT_FOUND, CONFLICT, BAD_REQUEST (invalid format), S3_ERROR
```

### tRPC: clip.download (new)
```
INPUT: { id: string }  // clipId
OUTPUT: { downloadUrl: string }
ERRORS: NOT_FOUND, BAD_REQUEST (not ready), S3_ERROR
```

## State Transitions

```
createFromUpload() → status: 'uploading', filePath: S3 key, fileSize: declared
  ↓
[Browser uploads to S3]
  ↓
confirmUpload() → status: 'transcribing' (on success, fileSize updated from HeadObject)
               → delete video (on invalid format)
               → remain 'uploading' (if file not found in S3)
  ↓
[Stale upload cleanup cron]
  If video.status == 'uploading' AND video.createdAt < now() - 24h:
    → mark status: 'failed'
    → attempt S3 cleanup (deleteObject + abortMultipartUpload for key)
    → log warning for monitoring
```
