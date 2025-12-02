import jwt from 'jsonwebtoken';
import type { AdminUserPublic, AdminUserWithSecrets } from '../repositories/adminUserRepository';
import { env } from './env';

export const ADMIN_SESSION_COOKIE = 'admin_session';
const SESSION_ALGORITHM: jwt.Algorithm = 'HS256';
const SESSION_VERSION = 1;

type SessionClaims = {
  sub: string;
  email: string;
  username: string;
  ver: number;
};

export type CreateSessionOptions = {
  remember?: boolean;
};

export type SessionTokenResult = {
  token: string;
  maxAgeMs: number;
};

function resolveSessionMaxAge(options: CreateSessionOptions = {}) {
  return options.remember ? env.ADMIN_SESSION_REMEMBER_MS : env.ADMIN_SESSION_TTL_MS;
}

function toClaims(admin: AdminUserWithSecrets | AdminUserPublic): SessionClaims {
  return {
    sub: admin.id,
    email: admin.email,
    username: admin.username,
    ver: SESSION_VERSION
  };
}

export function createAdminSessionToken(admin: AdminUserWithSecrets | AdminUserPublic, options: CreateSessionOptions = {}): SessionTokenResult {
  const maxAgeMs = resolveSessionMaxAge(options);
  const expiresInSeconds = Math.max(1, Math.round(maxAgeMs / 1000));

  const token = jwt.sign(toClaims(admin), env.ADMIN_SESSION_SECRET, {
    expiresIn: expiresInSeconds,
    algorithm: SESSION_ALGORITHM
  });

  return { token, maxAgeMs };
}

export type VerifySessionResult =
  | { status: 'VALID'; claims: SessionClaims }
  | { status: 'EXPIRED' }
  | { status: 'INVALID' };

export function verifyAdminSessionToken(token: string): VerifySessionResult {
  try {
    const decoded = jwt.verify(token, env.ADMIN_SESSION_SECRET, {
      algorithms: [SESSION_ALGORITHM]
    });

    const claims = decoded as SessionClaims & jwt.JwtPayload;

    if (claims.ver !== SESSION_VERSION || typeof claims.sub !== 'string') {
      return { status: 'INVALID' };
    }

    return {
      status: 'VALID',
      claims: {
        sub: claims.sub,
        email: claims.email,
        username: claims.username,
        ver: claims.ver
      }
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return { status: 'EXPIRED' };
    }

    return { status: 'INVALID' };
  }
}

export function clearAdminSessionCookie(res: import('express').Response) {
  res.clearCookie(ADMIN_SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production'
  });
}
