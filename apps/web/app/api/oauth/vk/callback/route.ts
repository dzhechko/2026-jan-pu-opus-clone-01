import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { encryptToken } from '@clipmaker/crypto';
import { prisma } from '@clipmaker/db';
import { getOAuthRedis } from '@/lib/redis';
import { createLogger } from '@/lib/logger';

const logger = createLogger('oauth-vk-callback');
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
      `${baseUrl}${SETTINGS_URL}?error=vk_auth_failed&reason=missing_params`,
    );
  }

  try {
    // Validate state from Redis
    const redis = getOAuthRedis();
    const redisKey = `oauth:vk:${state}`;
    const userId = await redis.get(redisKey);

    if (!userId) {
      return NextResponse.redirect(
        `${baseUrl}${SETTINGS_URL}?error=vk_auth_failed&reason=invalid_state`,
      );
    }

    // Delete state immediately to prevent replay
    await redis.del(redisKey);

    // Exchange code for access_token
    const clientId = process.env.VK_PUBLISH_CLIENT_ID;
    const clientSecret = process.env.VK_PUBLISH_CLIENT_SECRET;
    const redirectUri = process.env.VK_PUBLISH_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.redirect(
        `${baseUrl}${SETTINGS_URL}?error=vk_auth_failed&reason=server_config`,
      );
    }

    const tokenRes = await fetch('https://oauth.vk.com/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(
        `${baseUrl}${SETTINGS_URL}?error=vk_auth_failed&reason=token_exchange`,
      );
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      user_id?: number;
      error?: string;
    };

    if (tokenData.error || !tokenData.access_token) {
      return NextResponse.redirect(
        `${baseUrl}${SETTINGS_URL}?error=vk_auth_failed&reason=token_invalid`,
      );
    }

    const accessToken = tokenData.access_token;

    // Encrypt the token
    const secret = process.env.PLATFORM_TOKEN_SECRET;
    if (!secret) {
      return NextResponse.redirect(
        `${baseUrl}${SETTINGS_URL}?error=vk_auth_failed&reason=server_config`,
      );
    }

    const encryptedToken = encryptToken(accessToken, secret);

    // Get user info from VK (POST to avoid token in URL/logs)
    const userInfoRes = await fetch('https://api.vk.com/method/users.get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: accessToken, v: '5.199' }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    const userInfoData = (await userInfoRes.json()) as {
      response?: Array<{
        id?: number;
        first_name?: string;
        last_name?: string;
      }>;
    };

    const vkUser = userInfoData.response?.[0];
    const name = vkUser
      ? `${vkUser.first_name ?? ''} ${vkUser.last_name ?? ''}`.trim()
      : 'VK User';
    const vkId = vkUser?.id ?? tokenData.user_id;

    // Upsert PlatformConnection
    await prisma.platformConnection.upsert({
      where: {
        userId_platform: {
          userId,
          platform: 'vk',
        },
      },
      create: {
        userId,
        platform: 'vk',
        accessTokenEncrypted: encryptedToken,
        metadata: { name, vkId },
      },
      update: {
        accessTokenEncrypted: encryptedToken,
        expiresAt: null,
        metadata: { name, vkId },
      },
    });

    return NextResponse.redirect(
      `${baseUrl}${SETTINGS_URL}?connected=vk`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ event: 'vk_oauth_callback_error', error: message });
    return NextResponse.redirect(
      `${baseUrl}${SETTINGS_URL}?error=vk_auth_failed`,
    );
  }
}
