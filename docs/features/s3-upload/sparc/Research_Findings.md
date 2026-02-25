# Research Findings: S3 Upload

## Cloud.ru S3 Compatibility

### Endpoint & Auth
- **Endpoint:** `https://s3.cloud.ru`
- **Region:** `ru-central-1`
- **Auth:** AWS Signature V4
- **Access Key format:** `<tenant_id>:<key_id>` (differs from standard AWS)
- **Secret Key:** standard format

### SDK Compatibility
Cloud.ru S3 is fully compatible with:
- AWS SDK for JavaScript v3 (`@aws-sdk/client-s3`)
- `@aws-sdk/s3-request-presigner` for presigned URLs
- All standard S3 operations (PutObject, GetObject, CreateMultipartUpload, etc.)

### Configuration for AWS SDK v3
```typescript
import { S3Client } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: 'ru-central-1',
  endpoint: 'https://s3.cloud.ru',
  credentials: {
    accessKeyId: '<tenant_id>:<key_id>',
    secretAccessKey: '<secret>',
  },
  forcePathStyle: true, // Required for non-AWS S3
});
```

### Supported Operations (confirmed)
- PutObject, GetObject, DeleteObject, HeadObject, CopyObject
- CreateMultipartUpload, UploadPart, CompleteMultipartUpload, AbortMultipartUpload
- ListObjects, ListObjectsV2
- Bucket operations (CreateBucket, DeleteBucket, etc.)
- CORS configuration (PutBucketCors) — needed for browser uploads
- Lifecycle policies (PutBucketLifecycleConfiguration)

### Limitations
- Single PutObject max: ~5GB (standard S3 limit)
- Multipart upload: parts 5MB–5GB, up to 10,000 parts
- Presigned URL max expiry: 7 days (standard S3)

## Browser Direct Upload Patterns

### Presigned PUT URL (simple upload)
- Best for files <100MB
- Single PUT request from browser to S3
- No server proxy needed
- Progress via XMLHttpRequest `upload.onprogress`

### Presigned Multipart Upload (large files)
- Required for files >5GB, recommended >100MB
- Server initiates multipart, generates presigned URL per part
- Browser uploads parts in parallel (3-5 concurrent)
- Server completes multipart after all parts uploaded
- More complex but enables: progress per part, resume on failure, parallel uploads

### Decision: Hybrid Approach
- Files ≤100MB: presigned PUT (simpler, fewer round-trips)
- Files >100MB: presigned multipart (progress, reliability for large webinar recordings)
- Threshold at 100MB balances simplicity vs reliability

## File Validation: Magic Bytes

### Video Format Signatures
| Format | Magic Bytes | Offset |
|--------|-------------|--------|
| MP4 | `66 74 79 70` (ftyp) | 4 |
| WebM | `1A 45 DF A3` | 0 |
| MOV | `66 74 79 70 71 74` (ftypqt) | 4 |
| AVI | `52 49 46 46` (RIFF) + `41 56 49 20` (AVI ) | 0, 8 |

### Validation Strategy
1. Client-side: read first 16 bytes via FileReader, check magic bytes before upload
2. Server-side: after upload completion, HeadObject + read first 16 bytes via GetObject Range header, verify before processing

## CORS Configuration for Browser Uploads

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://clipmaker.ru", "http://localhost:3000"],
      "AllowedMethods": ["PUT", "POST", "GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag", "x-amz-request-id"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

## S3 Path Conventions

```
clipmaker-storage/
├── videos/{userId}/{videoId}/source.{ext}      # Original upload
├── clips/{userId}/{videoId}/{clipId}.mp4        # Rendered clips
├── thumbnails/{userId}/{videoId}/{clipId}.jpg   # Clip thumbnails
└── temp/{uploadId}/                             # Multipart temp (auto-cleanup)
```

## Existing Code Analysis

### Already Implemented
- `VideoUploader` component: drag-and-drop, file picker, MIME check, 4GB limit
- `trpc.video.createFromUpload`: creates Video record, checks minutes limit
- `trpc.video.createFromUrl`: creates Video record for URL imports
- Prisma `Video` model: `filePath`, `status`, `sourceType` fields

### Gaps to Fill
- `createFromUpload` returns `{ video, uploadUrl: '' }` — need real presigned URL
- No S3 client exists anywhere in codebase
- No upload completion confirmation endpoint
- No progress tracking in UI
- No magic bytes validation (only MIME check)
- Workers reference `video.filePath` but it's always empty string
