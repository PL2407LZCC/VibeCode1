import { randomBytes, createHash } from 'node:crypto';
import { env } from '../lib/env.js';
import {
  createPasswordResetToken,
  deleteResetTokensForUser,
  findAdminUserByEmail,
  findAdminUserByIdentifier,
  findAdminUserById,
  findResetTokenByHash,
  incrementFailedLoginAttempts,
  consumeResetTokenIfUnused,
  toPublicAdminUser,
  updateAdminAuthenticationState
} from '../repositories/adminUserRepository.js';
import type {
  AdminUserPublic,
  AdminUserWithSecrets
} from '../repositories/adminUserRepository.js';
import { hashPassword, PasswordPolicyError, verifyPassword } from '../lib/password.js';

const MAX_FAILED_ATTEMPTS = 10;
const RESET_TOKEN_BYTE_LENGTH = 32;

export type AuthenticationStatus =
  | {
      status: 'SUCCESS';
      admin: AdminUserPublic;
      needsPasswordUpgrade: boolean;
    }
  | {
      status: 'INVALID_CREDENTIALS';
      remainingAttempts: number;
    }
  | {
      status: 'ACCOUNT_LOCKED';
    }
  | {
      status: 'ACCOUNT_DISABLED';
    };

export type PasswordResetRequestResult = {
  token: string | null;
  admin: AdminUserPublic | null;
  expiresAt: Date | null;
};

export type PasswordResetConfirmationStatus =
  | { status: 'SUCCESS'; admin: AdminUserPublic }
  | { status: 'INVALID_OR_EXPIRED' }
  | { status: 'POLICY_VIOLATION'; message: string };

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashResetToken(rawToken: string) {
  return createHash('sha256').update(rawToken).digest('hex');
}

function generateResetToken() {
  const tokenBuffer = randomBytes(RESET_TOKEN_BYTE_LENGTH);
  return tokenBuffer.toString('base64url');
}

export async function authenticateWithPassword(
  identifier: string,
  password: string
): Promise<AuthenticationStatus> {
  const trimmedIdentifier = identifier.trim();
  if (!trimmedIdentifier || !password) {
    return {
      status: 'INVALID_CREDENTIALS',
      remainingAttempts: MAX_FAILED_ATTEMPTS
    };
  }

  const admin = await findAdminUserByIdentifier(trimmedIdentifier);

  if (!admin) {
    // Avoid user enumeration. Artificial delay could be added if needed.
    return {
      status: 'INVALID_CREDENTIALS',
      remainingAttempts: MAX_FAILED_ATTEMPTS
    };
  }

  if (!admin.isActive) {
    return { status: 'ACCOUNT_DISABLED' };
  }

  if (admin.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
    return { status: 'ACCOUNT_LOCKED' };
  }

  const verification = await verifyPassword(
    {
      hash: admin.passwordHash,
      algorithm: admin.passwordAlgorithm,
      version: admin.passwordVersion
    },
    password
  );

  if (!verification.valid) {
    const updatedAdmin = await incrementFailedLoginAttempts(admin.id);
    const attemptsRemaining = Math.max(0, MAX_FAILED_ATTEMPTS - updatedAdmin.failedLoginAttempts);
    if (attemptsRemaining <= 0) {
      return { status: 'ACCOUNT_LOCKED' };
    }

    return {
      status: 'INVALID_CREDENTIALS',
      remainingAttempts: attemptsRemaining
    };
  }

  const now = new Date();
  let needsPasswordUpgrade = verification.needsRehash;
  let updatedAdmin: AdminUserWithSecrets;

  if (verification.needsRehash) {
    const upgradedHash = await hashPassword(password, { skipPolicy: true });
    updatedAdmin = await updateAdminAuthenticationState(admin.id, {
      lastLoginAt: now,
      failedLoginAttempts: 0,
      passwordHash: upgradedHash.hash,
      passwordAlgorithm: upgradedHash.algorithm,
      passwordVersion: upgradedHash.version
    });
    needsPasswordUpgrade = true;
  } else {
    updatedAdmin = await updateAdminAuthenticationState(admin.id, {
      lastLoginAt: now,
      failedLoginAttempts: 0
    });
  }

  return {
    status: 'SUCCESS',
    admin: toPublicAdminUser(updatedAdmin),
    needsPasswordUpgrade
  };
}

export async function requestPasswordReset(email: string): Promise<PasswordResetRequestResult> {
  if (!email) {
    return { token: null, admin: null, expiresAt: null };
  }

  const normalizedEmail = normalizeEmail(email);
  const admin = await findAdminUserByEmail(normalizedEmail);

  if (!admin || !admin.isActive) {
    return { token: null, admin: null, expiresAt: null };
  }

  await deleteResetTokensForUser(admin.id);

  const token = generateResetToken();
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TOKEN_TTL_MS);

  await createPasswordResetToken({
    adminUserId: admin.id,
    tokenHash,
    expiresAt
  });

  return {
    token,
    admin: toPublicAdminUser(admin),
    expiresAt
  };
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<PasswordResetConfirmationStatus> {
  if (!token || !newPassword) {
    return { status: 'INVALID_OR_EXPIRED' };
  }

  const tokenHash = hashResetToken(token);
  const resetToken = await findResetTokenByHash(tokenHash);

  if (!resetToken || resetToken.consumedAt) {
    return { status: 'INVALID_OR_EXPIRED' };
  }

  const now = new Date();
  if (resetToken.expiresAt.getTime() < now.getTime()) {
    return { status: 'INVALID_OR_EXPIRED' };
  }

  const admin = await findAdminUserById(resetToken.adminUserId);
  if (!admin || !admin.isActive) {
    return { status: 'INVALID_OR_EXPIRED' };
  }

  try {
    const newHash = await hashPassword(newPassword);
    const consumed = await consumeResetTokenIfUnused(resetToken.id, now);
    if (!consumed) {
      return { status: 'INVALID_OR_EXPIRED' };
    }

    const updatedAdmin = await updateAdminAuthenticationState(admin.id, {
      passwordHash: newHash.hash,
      passwordAlgorithm: newHash.algorithm,
      passwordVersion: newHash.version,
      failedLoginAttempts: 0,
      updatedAt: now
    });

    return {
      status: 'SUCCESS',
      admin: toPublicAdminUser(updatedAdmin)
    };
  } catch (error) {
    if (error instanceof PasswordPolicyError) {
      return { status: 'POLICY_VIOLATION', message: error.message };
    }

    throw error;
  }
}
