import { S3Client } from '@aws-sdk/client-s3';
import { getS3Config } from './config';

let client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!client) {
    const config = getS3Config();
    client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
    });
  }
  return client;
}

export function getBucket(): string {
  return getS3Config().bucket;
}
