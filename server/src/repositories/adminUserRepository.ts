import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';

const adminUserSecretSelect = {
  id: true,
  email: true,
  username: true,
  passwordHash: true,
  passwordAlgorithm: true,
  passwordVersion: true,
  isActive: true,
  lastLoginAt: true,
  failedLoginAttempts: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.AdminUserSelect;

const adminUserPublicSelect = {
  id: true,
  email: true,
  username: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.AdminUserSelect;

const passwordResetTokenSelect = {
  id: true,
  tokenHash: true,
  expiresAt: true,
  consumedAt: true,
  createdAt: true,
  adminUserId: true
} satisfies Prisma.PasswordResetTokenSelect;

export type AdminUserWithSecrets = Prisma.AdminUserGetPayload<{
  select: typeof adminUserSecretSelect;
}>;

export type AdminUserPublic = Prisma.AdminUserGetPayload<{
  select: typeof adminUserPublicSelect;
}>;

export type PasswordResetTokenRecord = Prisma.PasswordResetTokenGetPayload<{
  select: typeof passwordResetTokenSelect;
}>;

export function toPublicAdminUser(user: AdminUserWithSecrets): AdminUserPublic {
  const { passwordHash: _hash, passwordAlgorithm: _alg, passwordVersion: _version, failedLoginAttempts: _attempts, ...publicFields } = user;
  return publicFields;
}

export async function listAdminUsers(): Promise<AdminUserPublic[]> {
  return prisma.adminUser.findMany({
    select: adminUserPublicSelect,
    orderBy: {
      createdAt: 'asc'
    }
  });
}

export async function createAdminUser(data: {
  email: string;
  username: string;
  passwordHash: string;
  passwordAlgorithm: string;
  passwordVersion: number;
  isActive?: boolean;
}): Promise<AdminUserWithSecrets> {
  return prisma.adminUser.create({
    data,
    select: adminUserSecretSelect
  });
}

export async function findAdminUserById(id: string): Promise<AdminUserWithSecrets | null> {
  return prisma.adminUser.findUnique({
    where: { id },
    select: adminUserSecretSelect
  });
}

export async function findAdminUserByEmail(email: string): Promise<AdminUserWithSecrets | null> {
  return prisma.adminUser.findUnique({
    where: { email },
    select: adminUserSecretSelect
  });
}

export async function findAdminUserByUsername(username: string): Promise<AdminUserWithSecrets | null> {
  return prisma.adminUser.findUnique({
    where: { username },
    select: adminUserSecretSelect
  });
}

export async function findAdminUserByIdentifier(identifier: string): Promise<AdminUserWithSecrets | null> {
  const lowered = identifier.trim().toLowerCase();
  if (lowered.includes('@')) {
    return findAdminUserByEmail(lowered);
  }

  return findAdminUserByUsername(identifier.trim());
}

export async function updateAdminPassword(
  id: string,
  data: {
    passwordHash: string;
    passwordAlgorithm: string;
    passwordVersion: number;
  }
): Promise<AdminUserWithSecrets> {
  return prisma.adminUser.update({
    where: { id },
    data,
    select: adminUserSecretSelect
  });
}

export async function recordSuccessfulLogin(
  id: string,
  timestamp: Date
): Promise<AdminUserWithSecrets> {
  return prisma.adminUser.update({
    where: { id },
    data: {
      lastLoginAt: timestamp,
      failedLoginAttempts: 0
    },
    select: adminUserSecretSelect
  });
}

export async function incrementFailedLoginAttempts(id: string): Promise<AdminUserWithSecrets> {
  return prisma.adminUser.update({
    where: { id },
    data: {
      failedLoginAttempts: {
        increment: 1
      }
    },
    select: adminUserSecretSelect
  });
}

export async function resetFailedLoginAttempts(id: string): Promise<AdminUserWithSecrets> {
  return prisma.adminUser.update({
    where: { id },
    data: {
      failedLoginAttempts: 0
    },
    select: adminUserSecretSelect
  });
}

export async function updateAdminActiveState(id: string, isActive: boolean): Promise<AdminUserWithSecrets> {
  return prisma.adminUser.update({
    where: { id },
    data: {
      isActive
    },
    select: adminUserSecretSelect
  });
}

export async function deleteResetTokensForUser(adminUserId: string): Promise<number> {
  const result = await prisma.passwordResetToken.deleteMany({
    where: {
      adminUserId,
      consumedAt: null
    }
  });

  return result.count;
}

export async function createPasswordResetToken(data: {
  adminUserId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<PasswordResetTokenRecord> {
  return prisma.passwordResetToken.create({
    data,
    select: passwordResetTokenSelect
  });
}

export async function findResetTokenByHash(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
  return prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: passwordResetTokenSelect
  });
}

export async function markResetTokenConsumed(id: string, consumedAt: Date): Promise<PasswordResetTokenRecord> {
  return prisma.passwordResetToken.update({
    where: { id },
    data: {
      consumedAt
    },
    select: passwordResetTokenSelect
  });
}

export async function consumeResetTokenIfUnused(id: string, consumedAt: Date): Promise<boolean> {
  const result = await prisma.passwordResetToken.updateMany({
    where: {
      id,
      consumedAt: null
    },
    data: {
      consumedAt
    }
  });

  return result.count > 0;
}

export async function deleteExpiredResetTokens(referenceDate: Date): Promise<number> {
  const result = await prisma.passwordResetToken.deleteMany({
    where: {
      expiresAt: {
        lt: referenceDate
      }
    }
  });

  return result.count;
}

export async function updateAdminAuthenticationState(
  id: string,
  data: Prisma.AdminUserUpdateInput
): Promise<AdminUserWithSecrets> {
  return prisma.adminUser.update({
    where: { id },
    data,
    select: adminUserSecretSelect
  });
}
