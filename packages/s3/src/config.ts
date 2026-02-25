import { env } from '@clipmaker/config';

export type S3Config = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
};

export function getS3Config(): S3Config {
  const endpoint = env.S3_ENDPOINT;
  const accessKeyId = env.S3_ACCESS_KEY;
  const secretAccessKey = env.S3_SECRET_KEY;

  if (!endpoint) throw new Error('Missing S3 configuration: S3_ENDPOINT');
  if (!accessKeyId) throw new Error('Missing S3 configuration: S3_ACCESS_KEY');
  if (!secretAccessKey) throw new Error('Missing S3 configuration: S3_SECRET_KEY');

  return {
    endpoint,
    region: env.S3_REGION ?? 'ru-central-1',
    accessKeyId,
    secretAccessKey,
    bucket: env.S3_BUCKET,
    forcePathStyle: true,
  };
}
