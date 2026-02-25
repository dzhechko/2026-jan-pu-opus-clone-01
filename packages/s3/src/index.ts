// Client
export { getS3Client, getBucket, resetS3Client } from './client';
export type { S3Config } from './config';

// Paths
export { videoSourcePath, clipPath, thumbnailPath } from './paths';

// Presigned URLs
export { generateUploadUrl, generateDownloadUrl } from './presign';
export type { PresignedUploadResult } from './presign';

// Multipart
export {
  initiateMultipartUpload,
  completeMultipartUpload,
  abortMultipartUpload,
  calculatePartSize,
} from './multipart';
export type { MultipartUploadInit } from './multipart';

// Operations
export { headObject, getObjectBytes, putObject, deleteObject } from './operations';

// Validation
export { validateMagicBytes } from './validation';
