import {
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getS3Client, getBucket } from './client';

function isS3Error(error: unknown): error is { name: string; $metadata?: { httpStatusCode?: number } } {
  return typeof error === 'object' && error !== null && 'name' in error;
}

function isTransientError(error: unknown): boolean {
  if (!isS3Error(error)) return false;
  const transientNames = ['ServiceUnavailable', 'SlowDown', 'InternalError'];
  if (transientNames.includes(error.name)) return true;
  const status = error.$metadata?.httpStatusCode;
  return status === 500 || status === 502 || status === 503;
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries && isTransientError(error)) {
        // Exponential backoff with jitter: ~1s, ~2s, ~4s
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export async function headObject(key: string): Promise<{ contentLength: number; contentType?: string }> {
  const s3 = getS3Client();
  const result = await withRetry(() =>
    s3.send(new HeadObjectCommand({ Bucket: getBucket(), Key: key })),
  );
  return {
    contentLength: result.ContentLength ?? 0,
    contentType: result.ContentType,
  };
}

export async function getObjectBytes(key: string, range?: string): Promise<Uint8Array> {
  const s3 = getS3Client();
  const result = await withRetry(() =>
    s3.send(
      new GetObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Range: range,
      }),
    ),
  );
  if (!result.Body) {
    throw new Error(`Object body is empty: ${key}`);
  }
  return result.Body.transformToByteArray();
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  const s3 = getS3Client();
  await withRetry(() =>
    s3.send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    ),
  );
}

export async function getObjectStream(key: string): Promise<import('stream').Readable> {
  const s3 = getS3Client();
  const result = await withRetry(() =>
    s3.send(new GetObjectCommand({ Bucket: getBucket(), Key: key })),
  );
  if (!result.Body) {
    throw new Error(`Object body is empty: ${key}`);
  }
  // AWS SDK v3 Body in Node.js context is Readable
  return result.Body as unknown as import('stream').Readable;
}

export async function deleteObject(key: string): Promise<void> {
  const s3 = getS3Client();
  // S3 DeleteObject is idempotent (returns 204 even if key doesn't exist).
  // Extra NoSuchKey catch is defense-in-depth for non-AWS S3 providers (Yandex/Cloud.ru).
  try {
    await withRetry(() =>
      s3.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key })),
    );
  } catch (error) {
    if (isS3Error(error) && error.name === 'NoSuchKey') return;
    throw error;
  }
}
