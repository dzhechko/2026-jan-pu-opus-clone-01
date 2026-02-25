import jwt from 'jsonwebtoken';

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET environment variable is not set');
  }
  return secret;
}

/** Access token lifetime in seconds (15 minutes) */
export const ACCESS_TOKEN_MAX_AGE = 900;

/** Refresh token lifetime in seconds (7 days) */
export const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60;

/** Remember-me refresh token lifetime in seconds (30 days) */
export const REMEMBER_ME_MAX_AGE = 30 * 24 * 60 * 60;

type AccessTokenUser = {
  id: string;
  email: string;
  planId: string;
};

type AccessTokenPayload = {
  id: string;
  email: string;
  planId: string;
  role: 'user';
};

type VerificationTokenPayload = {
  userId: string;
  email: string;
  purpose: 'email_verification';
};

type ResetTokenPayload = {
  userId: string;
  purpose: 'password_reset';
};

/**
 * Sign an access token (15 min expiry).
 */
export function signAccessToken(user: AccessTokenUser): string {
  const payload: AccessTokenPayload = {
    id: user.id,
    email: user.email,
    planId: user.planId,
    role: 'user',
  };

  return jwt.sign(payload, getSecret(), {
    expiresIn: ACCESS_TOKEN_MAX_AGE,
  });
}

/**
 * Sign a refresh token (7d default, 30d with rememberMe).
 */
export function signRefreshToken(
  user: { id: string; email: string; planId: string },
  rememberMe?: boolean,
): string {
  const expiresIn = rememberMe ? REMEMBER_ME_MAX_AGE : REFRESH_TOKEN_MAX_AGE;

  return jwt.sign(
    { id: user.id, email: user.email, planId: user.planId, type: 'refresh' },
    getSecret(),
    { expiresIn },
  );
}

/**
 * Sign an email verification token (24h expiry).
 */
export function signVerificationToken(userId: string, email: string): string {
  const payload: VerificationTokenPayload = {
    userId,
    email,
    purpose: 'email_verification',
  };

  return jwt.sign(payload, getSecret(), { expiresIn: '24h' });
}

/**
 * Sign a password reset token (1h expiry).
 */
export function signResetToken(userId: string): string {
  const payload: ResetTokenPayload = {
    userId,
    purpose: 'password_reset',
  };

  return jwt.sign(payload, getSecret(), { expiresIn: '1h' });
}

/**
 * Verify and decode a JWT token.
 * Throws if the token is expired or invalid.
 */
export function verifyToken<T extends Record<string, unknown>>(
  token: string,
): T {
  const decoded = jwt.verify(token, getSecret(), { clockTolerance: 30 });
  return decoded as unknown as T;
}
