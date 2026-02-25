import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_MAX_AGE, REFRESH_TOKEN_MAX_AGE, REMEMBER_ME_MAX_AGE } from './jwt';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** Base cookie options: HttpOnly, Secure in production, SameSite=Lax */
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: 'lax' as const,
};

/**
 * Set access and refresh token cookies on a NextResponse.
 *
 * @param res - The NextResponse to set cookies on
 * @param accessToken - JWT access token
 * @param refreshToken - JWT refresh token
 * @param rememberMe - If true, refresh token gets 30-day maxAge instead of 7-day
 */
export function setAuthCookies(
  res: NextResponse,
  accessToken: string,
  refreshToken: string,
  rememberMe?: boolean,
): void {
  res.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, {
    ...AUTH_COOKIE_OPTIONS,
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });

  res.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...AUTH_COOKIE_OPTIONS,
    path: '/',
    maxAge: rememberMe ? REMEMBER_ME_MAX_AGE : REFRESH_TOKEN_MAX_AGE,
  });
}

/**
 * Clear access and refresh token cookies from a NextResponse.
 */
export function clearAuthCookies(res: NextResponse): void {
  res.cookies.set(ACCESS_TOKEN_COOKIE, '', {
    ...AUTH_COOKIE_OPTIONS,
    path: '/',
    maxAge: 0,
  });

  res.cookies.set(REFRESH_TOKEN_COOKIE, '', {
    ...AUTH_COOKIE_OPTIONS,
    path: '/',
    maxAge: 0,
  });
}
