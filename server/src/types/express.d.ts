import type { AdminUserPublic } from '../repositories/adminUserRepository.js';

declare global {
  namespace Express {
    interface Request {
      admin?: AdminUserPublic;
    }
  }
}

export {};
