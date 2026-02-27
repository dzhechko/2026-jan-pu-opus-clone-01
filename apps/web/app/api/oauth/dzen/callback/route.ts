import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { encryptToken } from '@clipmaker/crypto';
import { prisma } from '@clipmaker/db';
import { getOAuthRedis } from '@/lib/redis';
import { createLogger } from '@/lib/logger';

const logger = createLogger('oauth-dzen-callback');
const SETTINGS_URL = '/dashboard/settings';
const FETCH_TIMEOUT = 15_000; // 15 seconds

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const baseUrl = request.nextUrl.origin;

  // Validate required params
  if (!code || !state) {
    return NextResponse.redirect(
      `${baseUrl}${SETTINGS_URL}?error=dzen_auth_failed&reason=missing_params`,
    );
  }

  try {
    // Validate state from Redis
    const redis = getOAuthRedis();
    const redisKey = `oauth:dzen:${state}`;
    const userId = await redis.get(redisKey);

    if (!userId) {
      return NextResponse.redirect(
        `${baseUrl}${SETTINGS_URL}?error=dzen_auth_failed&reason=invalid_state`,
      );
    }

    // Delete state immediately to prevent replay
    await redis.del(redisKey);

    // Exchange code for tokens via Yandex OAuth
    const clientId = process.env.YANDEX_CLIENT_ID;
    const clientSecret = process.env.YANDEX_CLIENT_SECRET;
    const redirectUri = process.env.YANDEX_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.redirect(
        `${baseUrl}${SETTINGS_URL}?error=dzen_auth_failed&reason=server_config`,
      );
    }

    const tokenRes = await fetch('https://oauth.yandex.ru/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(
        `${baseUrl}${SETTINGS_URL}?error=dzen_auth_failed&reason=token_exchange`,
      );
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };

    if (tokenData.error || !tokenData.access_token) {
      return NextResponse.redirect(
        `${baseUrl}${SETTINGS_URL}?error=dzen_auth_failed&reason=token_invalid`,
      );
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    // Encrypt tokens
    const secret = process.env.PLATFORM_TOKEN_SECRET;
    if (!secret) {
      return NextResponse.redirect(
        `${baseUrl}${SETTINGS_URL}?error=dzen_auth_failed&reason=server_config`,
      );
    }

    const encryptedAccessToken = encryptToken(accessToken, secret);
    const encryptedRefreshToken = refreshToken
      ? encryptToken(refreshToken, secret)
      : null;

    // Calculate expiration time
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    // Get publisher info from Dzen API
    let publisherName = 'Дзен канал';
    try {
      const publisherRes = await fetch(
        'https://zen.yandex.ru/media-api/v3/publisher',
        {
          headers: { Authorization: `OAuth ${accessToken}` },
          signal: AbortSignal.timeout(FETCH_TIMEOUT),
        },
      );
      if (publisherRes.ok) {
        const publisherData = (await publisherRes.json()) as {
          publisher?: { title?: string };
        };
        if (publisherData.publisher?.title) {
          publisherName = publisherData.publisher.title;
        }
      }
    } catch {
      // Non-critical — use default name
    }

    // Upsert PlatformConnection
    await prisma.platformConnection.upsert({
      where: {
        userId_platform: {
          userId,
          platform: 'dzen',
        },
      },
      create: {
        userId,
        platform: 'dzen',
        accessTokenEncrypted: encryptedAccessToken,
        refreshTokenEncrypted: encryptedRefreshToken,
        expiresAt,
        metadata: { publisherName },
      },
      update: {
        accessTokenEncrypted: encryptedAccessToken,
        refreshTokenEncrypted: encryptedRefreshToken,
        expiresAt,
        metadata: { publisherName },
      },
    });

    return NextResponse.redirect(
      `${baseUrl}${SETTINGS_URL}?connected=dzen`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ event: 'dzen_oauth_callback_error', error: message });
    return NextResponse.redirect(
      `${baseUrl}${SETTINGS_URL}?error=dzen_auth_failed`,
    );
  }
}
