import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, SignJWT, errors as joseErrors } from 'jose';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Access token lifetime in seconds (15 minutes). */
const ACCESS_TOKEN_MAX_AGE = 900;

/** Cookie names. */
const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

/** Clock tolerance for JWT verification (seconds). */
const CLOCK_TOLERANCE = 30;

/**
 * Public paths that do not require authentication.
 * Checked via `startsWith` so sub-paths are included automatically.
 */
const PUBLIC_PATH_PREFIXES: readonly string[] = [
  '/login',
  '/register',
  '/verify-email',
  '/reset-password',
  '/forgot-password',
  '/api/auth/',
  '/api/health',
  '/api/webhooks/',
  '/_next/',
  '/favicon.ico',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lazily encode the secret once per cold start. */
let cachedSecret: Uint8Array | undefined;

function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;

  const raw = process.env.NEXTAUTH_SECRET;
  if (!raw) {
    throw new Error('NEXTAUTH_SECRET environment variable is not set');
  }

  cachedSecret = new TextEncoder().encode(raw);
  return cachedSecret;
}

type AccessTokenPayload = {
  id: string;
  email: string;
  planId: string;
  role: string;
};

type RefreshTokenPayload = {
  id: string;
  type: 'refresh';
};

/**
 * Return `true` when the request targets a public path (or the exact root `/`).
 */
function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;

  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Verify a JWT and return the payload.
 * Throws JWTExpired, JWTClaimValidationFailed, or JWSSignatureVerificationFailed.
 */
async function verifyAccessToken(
  token: string,
): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    clockTolerance: CLOCK_TOLERANCE,
  });

  return payload as unknown as AccessTokenPayload;
}

/**
 * Verify the refresh token and return its payload.
 */
async function verifyRefreshToken(
  token: string,
): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    clockTolerance: CLOCK_TOLERANCE,
  });

  // Ensure the token is actually a refresh token.
  // We do not need a rich jose error here — any throw redirects to /login.
  if ((payload as Record<string, unknown>).type !== 'refresh') {
    throw new Error('Token is not a refresh token');
  }

  return payload as unknown as RefreshTokenPayload;
}

/**
 * Issue a fresh access token using jose's SignJWT (Edge-compatible).
 */
async function signAccessToken(user: {
  id: string;
  email: string;
  planId: string;
}): Promise<string> {
  return new SignJWT({
    id: user.id,
    email: user.email,
    planId: user.planId,
    role: 'user',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_MAX_AGE}s`)
    .sign(getSecret());
}

/**
 * Attach user info headers to the forwarded request so that downstream
 * Server Components and API routes can read them without re-verifying the JWT.
 */
function attachUserHeaders(
  request: NextRequest,
  user: AccessTokenPayload,
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', user.id);
  requestHeaders.set('x-user-email', user.email);
  requestHeaders.set('x-user-plan', user.planId);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

/**
 * Build a redirect response to /login that also clears both auth cookies.
 */
function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL('/login', request.url);
  const response = NextResponse.redirect(loginUrl);

  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);

  return response;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // 1. Public routes — pass through but strip any client-injected x-user-* headers.
  if (isPublicPath(pathname)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete('x-user-id');
    requestHeaders.delete('x-user-email');
    requestHeaders.delete('x-user-plan');
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  // 2. No tokens at all — redirect to login.
  if (!accessToken && !refreshToken) {
    return redirectToLogin(request);
  }

  // 3. Try verifying the access token.
  if (accessToken) {
    try {
      const user = await verifyAccessToken(accessToken);
      return attachUserHeaders(request, user);
    } catch (error: unknown) {
      // Expired — fall through to refresh flow below.
      if (error instanceof joseErrors.JWTExpired) {
        // Continue to step 4.
      } else {
        // Tampered / malformed — clear everything.
        return redirectToLogin(request);
      }
    }
  }

  // 4. Access token is missing or expired — attempt silent refresh.
  if (!refreshToken) {
    return redirectToLogin(request);
  }

  try {
    const refreshPayload = await verifyRefreshToken(refreshToken);

    // The refresh token is valid. Unfortunately we cannot query the DB from
    // Edge Runtime to load the full user profile (email, planId). Instead we
    // embed a minimal set of claims that *must* be present in every refresh
    // token. If the refresh token was issued by our server-side jwt.ts helper
    // (which only stores `userId`), we fall back to defaults. A proper DB
    // lookup happens on the next API call; this keeps the middleware fast.
    //
    // Extract claims from the refresh token payload.
    const payload = refreshPayload as unknown as Record<string, unknown>;
    const userId = (payload.id ?? payload.userId ?? '') as string;
    const email = (payload.email ?? '') as string;
    const planId = (payload.planId ?? 'free') as string;

    if (!userId) {
      return redirectToLogin(request);
    }

    const newAccessToken = await signAccessToken({
      id: userId,
      email,
      planId,
    });

    // Attach user headers to the request.
    const user: AccessTokenPayload = {
      id: userId,
      email,
      planId,
      role: 'user',
    };

    const response = attachUserHeaders(request, user);

    // Set the fresh access token as an HttpOnly cookie.
    response.cookies.set(ACCESS_COOKIE, newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });

    return response;
  } catch {
    // Refresh token is invalid or expired — force re-login.
    return redirectToLogin(request);
  }
}

// ---------------------------------------------------------------------------
// Matcher — skip static files and Next.js internals that are not API routes.
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    /*
     * Match all paths except:
     *  - _next/static  (static files)
     *  - _next/image   (image optimization)
     *  - favicon.ico   (browser favicon)
     *  - public folder assets (common image/font extensions)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$).*)',
  ],
};
