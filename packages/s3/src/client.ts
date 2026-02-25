import { S3Client } from '@aws-sdk/client-s3';
import { getS3Config } from './config';

// Use globalThis to survive Next.js hot-reload without leaking connections
const globalForS3 = globalThis as unknown as { __clipmakerS3Client?: S3Client };

let cachedBucket: string | null = null;

export function getS3Client(): S3Client {
  if (!globalForS3.__clipmakerS3Client) {
    const config = getS3Config();
    globalForS3.__clipmakerS3Client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
    });
    cachedBucket = config.bucket;
  }
  return globalForS3.__clipmakerS3Client;
}

export function getBucket(): string {
  if (!cachedBucket) {
    cachedBucket = getS3Config().bucket;
  }
  return cachedBucket;
}

export function resetS3Client(): void {
  if (globalForS3.__clipmakerS3Client) {
    globalForS3.__clipmakerS3Client.destroy();
    globalForS3.__clipmakerS3Client = undefined;
  }
  cachedBucket = null;
}
