import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import { prisma } from '@clipmaker/db';
import { getObjectStream } from '@clipmaker/s3';

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*;\x00-\x1F]/g, '').replace(/\s+/g, '_').slice(0, 100) || 'clip';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const { clipId } = await params;
  const userId = request.headers.get('x-user-id');
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const clip = await prisma.clip.findFirst({
    where: { id: clipId, userId },
    select: { filePath: true, title: true },
  });

  if (!clip?.filePath) {
    return new NextResponse('Not Found', { status: 404 });
  }

  try {
    const nodeStream = await getObjectStream(clip.filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;
    const filename = `${sanitizeFilename(clip.title)}.mp4`;
    const encodedFilename = encodeURIComponent(filename);

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[clip/file] S3 error:', err);
    return new NextResponse('Not Found', { status: 404 });
  }
}
