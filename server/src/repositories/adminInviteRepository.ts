import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';

const invitedBySelect = {
  id: true,
  username: true
} satisfies Prisma.AdminUserSelect;

const adminInviteSecretSelect = {
  id: true,
  email: true,
  username: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  expiresAt: true,
  lastSentAt: true,
  acceptedAt: true,
  revokedAt: true,
  tokenHash: true,
  invitedByAdmin: {
    select: invitedBySelect
  }
} satisfies Prisma.AdminInviteSelect;

const adminInvitePublicSelect = {
  id: true,
  email: true,
  username: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  expiresAt: true,
  lastSentAt: true,
  acceptedAt: true,
  revokedAt: true,
  invitedByAdmin: {
    select: invitedBySelect
  }
} satisfies Prisma.AdminInviteSelect;

export type AdminInviteWithSecrets = Prisma.AdminInviteGetPayload<{
  select: typeof adminInviteSecretSelect;
}>;

export type AdminInvitePublic = Prisma.AdminInviteGetPayload<{
  select: typeof adminInvitePublicSelect;
}>;

export async function listAdminInvites(): Promise<AdminInvitePublic[]> {
  return prisma.adminInvite.findMany({
    select: adminInvitePublicSelect,
    orderBy: {
      createdAt: 'asc'
    }
  });
}

export async function findAdminInviteByEmail(email: string): Promise<AdminInviteWithSecrets | null> {
  return prisma.adminInvite.findFirst({
    where: {
      email: email.trim().toLowerCase()
    },
    select: adminInviteSecretSelect,
    orderBy: {
      createdAt: 'desc'
    }
  });
}

export async function findAdminInviteById(id: string): Promise<AdminInviteWithSecrets | null> {
  return prisma.adminInvite.findUnique({
    where: { id },
    select: adminInviteSecretSelect
  });
}

export async function findAdminInviteByTokenHash(tokenHash: string): Promise<AdminInviteWithSecrets | null> {
  return prisma.adminInvite.findUnique({
    where: { tokenHash },
    select: adminInviteSecretSelect
  });
}

export async function createAdminInvite(data: Prisma.AdminInviteCreateInput): Promise<AdminInviteWithSecrets> {
  return prisma.adminInvite.create({
    data,
    select: adminInviteSecretSelect
  });
}

export async function updateAdminInvite(
  id: string,
  data: Prisma.AdminInviteUpdateInput
): Promise<AdminInviteWithSecrets> {
  return prisma.adminInvite.update({
    where: { id },
    data,
    select: adminInviteSecretSelect
  });
}

export async function listPendingInvitesForEmail(email: string): Promise<AdminInviteWithSecrets[]> {
  return prisma.adminInvite.findMany({
    where: {
      email: email.trim().toLowerCase(),
      status: {
        in: ['PENDING', 'SENT']
      }
    },
    select: adminInviteSecretSelect,
    orderBy: {
      createdAt: 'desc'
    }
  });
}
