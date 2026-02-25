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

export function calculatePartSize(fileSize: number): number {
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

  const partUrls: { partNumber: number; url: string }[] = [];
  for (let partNumber = 1; partNumber <= numParts; partNumber++) {
    const command = new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    partUrls.push({ partNumber, url });
  }

  return { uploadId, key, partUrls, partSize };
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<void> {
  const s3 = getS3Client();
  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: getBucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
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
  } catch {
    // Best-effort: stale cleanup cron handles orphans
  }
}
