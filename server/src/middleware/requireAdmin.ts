import type { Request, Response, NextFunction } from 'express';
import {
  ADMIN_SESSION_COOKIE,
  clearAdminSessionCookie,
  getSessionTokenFromRequest,
  verifyAdminSessionToken
} from '../lib/adminSession.js';
import { findAdminUserById, toPublicAdminUser } from '../repositories/adminUserRepository.js';

const ADMIN_HEADER = 'x-admin-token';

const legacyAdminPlaceholder = {
  id: 'legacy-admin',
  email: 'legacy-admin@localhost',
  username: 'legacy-admin',
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0)
} as const;

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const sessionToken = getSessionTokenFromRequest(req);

  if (sessionToken) {
    const verification = verifyAdminSessionToken(sessionToken);

    if (verification.status === 'VALID') {
      const admin = await findAdminUserById(verification.claims.sub);

      if (admin && admin.isActive) {
        req.admin = toPublicAdminUser(admin);
        return next();
      }
    } else if (verification.status === 'EXPIRED') {
      clearAdminSessionCookie(res);
    }
  }

  const headerToken = req.headers[ADMIN_HEADER] ?? req.headers[ADMIN_HEADER.toLowerCase()];
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const providedToken = typeof headerToken === 'string' ? headerToken : Array.isArray(headerToken) ? headerToken[0] : bearerToken;
  const expectedToken = process.env.ADMIN_API_KEY;

  if (providedToken && expectedToken && providedToken === expectedToken) {
    req.admin = legacyAdminPlaceholder;
    return next();
  }

  return res.status(401).json({ message: 'Unauthorized' });
}

export default requireAdmin;
