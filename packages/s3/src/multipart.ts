import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3Client, getBucket } from './client';

export type MultipartUploadInit = {
  uploadId: string;
  key: string;
  partUrls: { partNumber: number; url: string }[];
  partSize: number;
};

const MIN_PART_SIZE = 10 * 1024 * 1024; // 10MB (above S3 API min of 5MB for efficiency)
const MAX_PART_SIZE = 100 * 1024 * 1024; // 100MB
const PRESIGNED_URL_EXPIRY = 3600;

export function calculatePartSize(fileSize: number): number {
  if (fileSize <= 0) throw new Error('fileSize must be positive');
  const targetParts = 100;
  let partSize = Math.ceil(fileSize / targetParts);
  partSize = Math.max(partSize, MIN_PART_SIZE);
  partSize = Math.min(partSize, MAX_PART_SIZE);
  return partSize;
}

export async function initiateMultipartUpload(
  key: string,
  fileSize: number,
  contentType: string,
): Promise<MultipartUploadInit> {
  if (fileSize <= 0) throw new Error('fileSize must be positive');

  const s3 = getS3Client();
  const bucket = getBucket();
  const partSize = calculatePartSize(fileSize);
  const numParts = Math.ceil(fileSize / partSize);

  const createResp = await s3.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
  );

  const uploadId = createResp.UploadId;
  if (!uploadId) throw new Error('Failed to initiate multipart upload');

  // Generate presigned URLs in parallel (getSignedUrl is local signing, no network call)
  const partUrls = await Promise.all(
    Array.from({ length: numParts }, (_, i) => i + 1).map(async (partNumber) => {
      const command = new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      });
      const url = await getSignedUrl(s3, command, { expiresIn: PRESIGNED_URL_EXPIRY });
      return { partNumber, url };
    }),
  );

  return { uploadId, key, partUrls, partSize };
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<void> {
  if (parts.length === 0) throw new Error('parts array must not be empty');

  // Sort by partNumber (S3 requires sorted order)
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);

  // Validate no duplicates
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.partNumber === sorted[i - 1]!.partNumber) {
      throw new Error(`Duplicate partNumber: ${sorted[i]!.partNumber}`);
    }
  }

  const s3 = getS3Client();
  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: getBucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sorted.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  const s3 = getS3Client();
  try {
    await s3.send(
      new AbortMultipartUploadCommand({
        Bucket: getBucket(),
        Key: key,
        UploadId: uploadId,
      }),
    );
  } catch (error) {
    // Best-effort abort — stale cleanup cron handles orphans.
    // Log rather than swallow for observability.
    console.warn('Failed to abort multipart upload', { key, uploadId, error });
  }
}
