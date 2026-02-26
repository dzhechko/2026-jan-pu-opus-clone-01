export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min timeout

import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getBucket } from '@clipmaker/s3';

/**
 * Server-side upload proxy.
 * Browser → Next.js API → S3 (MinIO/Cloud.ru).
 *
 * This avoids presigned URL issues with CORS and proxy environments
 * (e.g., Codespace port forwarding breaks S3 signatures).
 */
export async function PUT(request: NextRequest) {
  // Auth check: middleware sets x-user-id for authenticated requests
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const key = request.headers.get('x-upload-key');
  if (!key) {
    return NextResponse.json({ error: 'Missing x-upload-key header' }, { status: 400 });
  }

  // Verify the key belongs to this user (path format: videos/{userId}/{videoId}/source.ext)
  if (!key.startsWith(`videos/${userId}/`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const contentType = request.headers.get('content-type') ?? 'application/octet-stream';
  const body = await request.arrayBuffer();

  if (!body.byteLength) {
    return NextResponse.json({ error: 'Empty body' }, { status: 400 });
  }

  try {
    const s3 = getS3Client();
    await s3.send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Body: Buffer.from(body),
        ContentType: contentType,
      }),
    );

    return NextResponse.json({ ok: true, key, size: body.byteLength });
  } catch (err) {
    console.error('[upload proxy] S3 error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 502 });
  }
}
