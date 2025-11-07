import type { Request, Response, NextFunction } from 'express';

const ADMIN_HEADER = 'x-admin-token';

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const headerToken = req.headers[ADMIN_HEADER] ?? req.headers[ADMIN_HEADER.toLowerCase()];
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const providedToken = typeof headerToken === 'string' ? headerToken : Array.isArray(headerToken) ? headerToken[0] : bearerToken;
  const expectedToken = process.env.ADMIN_API_KEY;

  if (!expectedToken) {
    return res.status(500).json({ message: 'Admin token is not configured.' });
  }

  if (!providedToken || providedToken !== expectedToken) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  return next();
}

export default requireAdmin;
