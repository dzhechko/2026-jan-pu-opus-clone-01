import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3Client, getBucket } from './client';

export type PresignedUploadResult = {
  uploadUrl: string;
  key: string;
  expiresIn: number;
};

export async function generateUploadUrl(
  key: string,
  _fileSize: number,
  contentType: string,
): Promise<PresignedUploadResult> {
  const s3 = getS3Client();
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
    // Do NOT include ContentLength — browser sets it automatically.
    // Including it in the signature causes SignatureDoesNotMatch.
  });
  // Disable auto-checksum (CRC32) — browser doesn't send it, causing signature mismatch
  const url = await getSignedUrl(s3, command, {
    expiresIn: 3600,
    unhoistableHeaders: new Set(['x-amz-checksum-crc32']),
  });
  return { uploadUrl: url, key, expiresIn: 3600 };
}

export async function generateDownloadUrl(key: string): Promise<string> {
  const s3 = getS3Client();
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}
