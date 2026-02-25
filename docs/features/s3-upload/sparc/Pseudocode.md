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
type S3Paths = {
  videoSource: (userId: string, videoId: string, ext: string) => string;
  clip: (userId: string, videoId: string, clipId: string) => string;
  thumbnail: (userId: string, videoId: string, clipId: string) => string;
};

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
2. Create S3Client with:
   - endpoint: S3_ENDPOINT
   - region: S3_REGION (default 'ru-central-1')
   - credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY }
   - forcePathStyle: true
3. Export singleton (module-level, lazy-initialized)
```

## Algorithm: Generate Presigned Upload URL

```
INPUT: userId: string, videoId: string, fileName: string, fileSize: number
OUTPUT: PresignedUploadResult | MultipartUploadInit

STEPS:
1. ext = extractExtension(fileName)  // .mp4, .webm, etc.
2. key = `videos/${userId}/${videoId}/source.${ext}`

3. IF fileSize <= 100MB:
   // Simple presigned PUT
   command = new PutObjectCommand({ Bucket, Key: key, ContentLength: fileSize })
   url = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
   RETURN { uploadUrl: url, key, expiresIn: 3600 }

4. IF fileSize > 100MB:
   // Multipart upload
   partSize = calculatePartSize(fileSize)  // min 10MB, max 100MB
   numParts = ceil(fileSize / partSize)

   createResp = await s3.createMultipartUpload({ Bucket, Key: key })
   uploadId = createResp.UploadId

   partUrls = []
   FOR partNumber = 1 TO numParts:
     command = new UploadPartCommand({
       Bucket, Key: key, UploadId: uploadId, PartNumber: partNumber
     })
     url = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
     partUrls.push({ partNumber, url })

   RETURN { uploadId, key, partUrls, partSize }

HELPER calculatePartSize(fileSize):
  // Target ~100 parts for optimal parallel upload
  targetParts = 100
  partSize = ceil(fileSize / targetParts)
  partSize = max(partSize, 10 * 1024 * 1024)   // min 10MB
  partSize = min(partSize, 100 * 1024 * 1024)   // max 100MB
  RETURN partSize
```

## Algorithm: Complete Multipart Upload

```
INPUT: key: string, uploadId: string, parts: { partNumber: number, etag: string }[]
OUTPUT: { success: boolean }

STEPS:
1. await s3.completeMultipartUpload({
     Bucket, Key: key, UploadId: uploadId,
     MultipartUpload: { Parts: parts.map(p => ({ PartNumber: p.partNumber, ETag: p.etag })) }
   })
2. RETURN { success: true }

ERROR: If any part missing → abort multipart upload, clean up
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
   headResult = await s3.headObject({ Bucket, Key: video.filePath })
   IF !headResult: throw NOT_FOUND "File not found in storage"

3. // Validate magic bytes
   rangeResult = await s3.getObject({ Bucket, Key: video.filePath, Range: 'bytes=0-15' })
   bytes = await rangeResult.Body.transformToByteArray()
   IF !validateMagicBytes(bytes):
     await s3.deleteObject({ Bucket, Key: video.filePath })
     await db.video.delete({ where: { id: videoId } })
     throw BAD_REQUEST "Invalid file format"

4. // Update video record
   fileSize = headResult.ContentLength
   await db.video.update({
     where: { id: videoId },
     data: { status: 'transcribing' }
   })

5. // Enqueue STT job
   await sttQueue.add('stt', {
     videoId, userId,
     filePath: video.filePath,
     strategy: video.llmProviderUsed
   })

6. RETURN { status: 'transcribing' }
```

## Algorithm: Validate Magic Bytes

```
INPUT: bytes: Uint8Array (16 bytes)
OUTPUT: { valid: boolean, format: string | null }

MAGIC_BYTES = {
  mp4:  { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },  // 'ftyp'
  webm: { offset: 0, bytes: [0x1A, 0x45, 0xDF, 0xA3] },
  mov:  { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },  // 'ftyp' (same as mp4)
  avi:  { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },  // 'RIFF'
}

STEPS:
1. FOR each format, signature IN MAGIC_BYTES:
     match = true
     FOR i = 0 TO signature.bytes.length:
       IF bytes[signature.offset + i] != signature.bytes[i]:
         match = false
         BREAK
     IF match: RETURN { valid: true, format }

2. RETURN { valid: false, format: null }
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

2. command = new GetObjectCommand({ Bucket, Key: clip.filePath })
   url = await getSignedUrl(s3Client, command, { expiresIn: 3600 })

3. RETURN { downloadUrl: url }
```

## Algorithm: Browser Upload (Client-Side)

```
INPUT: file: File, uploadConfig: PresignedUploadResult | MultipartUploadInit
OUTPUT: { success: boolean, etag?: string }

CASE simple upload (PresignedUploadResult):
  1. xhr = new XMLHttpRequest()
  2. xhr.upload.onprogress = (e) => updateProgress(e.loaded, e.total)
  3. xhr.open('PUT', uploadConfig.uploadUrl)
  4. xhr.setRequestHeader('Content-Type', file.type)
  5. xhr.send(file)
  6. ON complete: return { success: true, etag: xhr.getResponseHeader('ETag') }

CASE multipart upload (MultipartUploadInit):
  1. parts = splitFile(file, uploadConfig.partSize)
  2. completedParts = []
  3. totalLoaded = 0

  4. // Upload parts with concurrency limit (3 parallel)
  5. FOR batch IN chunks(uploadConfig.partUrls, 3):
     await Promise.all(batch.map(async ({ partNumber, url }) =>
       blob = parts[partNumber - 1]
       etag = await uploadPart(url, blob, (loaded) => {
         totalLoaded += loaded
         updateProgress(totalLoaded, file.size)
       })
       completedParts.push({ partNumber, etag })
     ))

  6. // Tell server to complete multipart
  7. await trpc.video.completeMultipart({ uploadId, parts: completedParts })
  8. RETURN { success: true }
```

## API Contracts

### tRPC: video.createFromUpload (updated)
```
INPUT: { title: string, fileName: string, fileSize: number }
OUTPUT: {
  video: { id, title, status },
  upload: PresignedUploadResult | MultipartUploadInit
}
```

### tRPC: video.completeMultipart (new)
```
INPUT: { videoId: string, uploadId: string, parts: { partNumber: number, etag: string }[] }
OUTPUT: { success: boolean }
```

### tRPC: video.confirmUpload (new)
```
INPUT: { videoId: string }
OUTPUT: { status: VideoStatus }
ERRORS: NOT_FOUND, CONFLICT, BAD_REQUEST (invalid format)
```

### tRPC: clip.download (new)
```
INPUT: { id: string }  // clipId
OUTPUT: { downloadUrl: string }
ERRORS: NOT_FOUND, BAD_REQUEST (not ready)
```

## State Transitions

```
createFromUpload() → status: 'uploading', filePath: S3 key
  ↓
[Browser uploads to S3]
  ↓
confirmUpload() → status: 'transcribing' (on success)
               → delete video (on invalid format)
               → remain 'uploading' (if file not found in S3)
```
