import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { prisma } from '@clipmaker/db';
import { getObjectStream } from '@clipmaker/s3';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clipId: string }> },
) {
  const { clipId } = await params;
  const userId = request.headers.get('x-user-id');
  if (!userId) return new NextResponse('Unauthorized', { status: 401 });

  const clip = await prisma.clip.findFirst({
    where: { id: clipId, userId },
    select: { thumbnailPath: true },
  });

  if (!clip?.thumbnailPath) {
    return new NextResponse('Not Found', { status: 404 });
  }

  try {
    const nodeStream = await getObjectStream(clip.thumbnailPath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }
}
