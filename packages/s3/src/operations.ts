import {
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getS3Client, getBucket } from './client';

function isTransientError(error: unknown): boolean {
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  const transientNames = ['ServiceUnavailable', 'SlowDown', 'InternalError'];
  if (err.name && transientNames.includes(err.name)) return true;
  const status = err.$metadata?.httpStatusCode;
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
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
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

export async function getObjectBytes(
  key: string,
  range?: string,
): Promise<{ body: ReadableStream | Uint8Array; contentLength: number }> {
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
  return {
    body: result.Body as ReadableStream | Uint8Array,
    contentLength: result.ContentLength ?? 0,
  };
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

export async function deleteObject(key: string): Promise<void> {
  const s3 = getS3Client();
  try {
    await withRetry(() =>
      s3.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key })),
    );
  } catch (error) {
    const err = error as { name?: string };
    if (err.name === 'NoSuchKey') return; // idempotent
    throw error;
  }
}
