import type { AdminUserPublic } from '../repositories/adminUserRepository';

declare global {
  namespace Express {
    interface Request {
      admin?: AdminUserPublic;
    }
  }
}

export {};
