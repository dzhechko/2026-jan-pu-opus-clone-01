export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min timeout

import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { PutObjectCommand, UploadPartCommand } from '@aws-sdk/client-s3';
import { getS3Client, getBucket } from '@clipmaker/s3';

/**
 * Server-side upload proxy.
 * Browser → Next.js API → S3 (MinIO/Cloud.ru).
 *
 * Supports two modes:
 * 1. Simple upload: PUT with x-upload-key → PutObjectCommand
 * 2. Multipart part: PUT with x-upload-key + x-upload-id + x-upload-part → UploadPartCommand
 *
 * Codespace proxy limits request bodies to ~16 MB, so files > 8 MB
 * use multipart mode with 10 MB parts (each under the proxy limit).
 */
export async function PUT(request: NextRequest) {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const key = request.headers.get('x-upload-key');
  if (!key) {
    return NextResponse.json({ error: 'Missing x-upload-key header' }, { status: 400 });
  }

  if (!key.startsWith(`videos/${userId}/`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.arrayBuffer();
  if (!body.byteLength) {
    return NextResponse.json({ error: 'Empty body' }, { status: 400 });
  }

  const uploadId = request.headers.get('x-upload-id');
  const partNumberStr = request.headers.get('x-upload-part');

  try {
    const s3 = getS3Client();
    const bucket = getBucket();

    if (uploadId && partNumberStr) {
      // Multipart part upload
      const partNumber = parseInt(partNumberStr, 10);
      if (isNaN(partNumber) || partNumber < 1) {
        return NextResponse.json({ error: 'Invalid x-upload-part' }, { status: 400 });
      }

      const resp = await s3.send(
        new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: Buffer.from(body),
          ContentLength: body.byteLength,
        }),
      );

      const etag = resp.ETag ?? '';
      console.log(`[upload proxy] Part ${partNumber}: ${body.byteLength} bytes → ${key}`);
      return NextResponse.json({ ok: true, etag });
    }

    // Simple upload
    const contentType = request.headers.get('content-type') ?? 'application/octet-stream';
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from(body),
        ContentType: contentType,
        ContentLength: body.byteLength,
      }),
    );

    console.log(`[upload proxy] Simple: ${body.byteLength} bytes → ${key}`);
    return NextResponse.json({ ok: true, key, size: body.byteLength });
  } catch (err) {
    console.error('[upload proxy] S3 error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 502 });
  }
}
