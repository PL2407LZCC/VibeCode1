import { createHash, randomBytes } from 'node:crypto';
import { env } from '../lib/env.js';
import {
  createAdminInvite,
  findAdminInviteById,
  findAdminInviteByTokenHash,
  listAdminInvites,
  listPendingInvitesForEmail,
  updateAdminInvite,
  type AdminInvitePublic,
  type AdminInviteWithSecrets
} from '../repositories/adminInviteRepository.js';
import {
  createAdminUser,
  findAdminUserByEmail,
  findAdminUserById,
  findAdminUserByUsername,
  listAdminUsers,
  toPublicAdminUser,
  updateAdminActiveState
} from '../repositories/adminUserRepository.js';
import { sendAdminInviteEmail } from './adminEmailService.js';
import type { AdminUserPublic } from '../repositories/adminUserRepository.js';
import { hashPassword, PasswordPolicyError } from '../lib/password.js';

const INVITE_TOKEN_LENGTH = 32;

export type AdminDirectoryAdmin = {
  id: string;
  email: string;
  username: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminDirectoryResponse = {
  admins: AdminDirectoryAdmin[];
  invites: AdminInviteResponse[];
};

export type AdminInviteResponse = {
  id: string;
  email: string;
  username: string;
  status: 'pending' | 'sent' | 'accepted' | 'expired' | 'revoked';
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  lastSentAt: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  invitedBy: {
    id: string;
    username: string;
  } | null;
};

export type AdminInvitePreviewResult = {
  invite: AdminInviteResponse;
  canAccept: boolean;
  reason: string | null;
};

export type AdminInviteAcceptanceResult = {
  admin: AdminUserPublic;
  invite: AdminInviteResponse;
};

export class AdminDirectoryError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'AdminDirectoryError';
  }
}

export class AdminInviteAcceptanceError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'AdminInviteAcceptanceError';
  }
}

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const normalizeUsername = (value: string) => value.trim();

const hashInviteToken = (token: string) => createHash('sha256').update(token).digest('hex');
const generateInviteToken = () => randomBytes(INVITE_TOKEN_LENGTH).toString('base64url');

const toInviteStatus = (status: AdminInviteWithSecrets['status']): AdminInviteResponse['status'] =>
  status.toLowerCase() as AdminInviteResponse['status'];

const mapInvite = (invite: AdminInvitePublic | AdminInviteWithSecrets): AdminInviteResponse => ({
  id: invite.id,
  email: invite.email,
  username: invite.username,
  status: toInviteStatus(invite.status),
  createdAt: invite.createdAt.toISOString(),
  updatedAt: invite.updatedAt.toISOString(),
  expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
  lastSentAt: invite.lastSentAt ? invite.lastSentAt.toISOString() : null,
  acceptedAt: invite.acceptedAt ? invite.acceptedAt.toISOString() : null,
  revokedAt: invite.revokedAt ? invite.revokedAt.toISOString() : null,
  invitedBy: invite.invitedByAdmin
    ? {
        id: invite.invitedByAdmin.id,
        username: invite.invitedByAdmin.username
      }
    : null
});

const mapAdmin = (admin: AdminUserPublic): AdminDirectoryResponse['admins'][number] => ({
  id: admin.id,
  email: admin.email,
  username: admin.username,
  isActive: admin.isActive,
  createdAt: admin.createdAt.toISOString(),
  updatedAt: admin.updatedAt.toISOString(),
  lastLoginAt: admin.lastLoginAt ? admin.lastLoginAt.toISOString() : null
});

const assertInviteMutable = (invite: AdminInviteWithSecrets) => {
  if (invite.status === 'ACCEPTED') {
    throw new AdminDirectoryError('Invite already accepted.', 409);
  }

  if (invite.status === 'REVOKED') {
    throw new AdminDirectoryError('Invite already revoked.', 409);
  }
};

const isInviteExpired = (invite: AdminInviteWithSecrets) =>
  Boolean(invite.expiresAt && invite.expiresAt.getTime() < Date.now());

const assertInviteAcceptable = (invite: AdminInviteWithSecrets) => {
  if (invite.status === 'ACCEPTED' || invite.acceptedAt) {
    throw new AdminInviteAcceptanceError('Invite already accepted.', 409);
  }

  if (invite.status === 'REVOKED' || invite.revokedAt) {
    throw new AdminInviteAcceptanceError('Invite has been revoked.', 410);
  }

  if (invite.status === 'EXPIRED' || isInviteExpired(invite)) {
    throw new AdminInviteAcceptanceError('Invite has expired.', 410);
  }
};

const resolveInviteByToken = async (token: string): Promise<AdminInviteWithSecrets> => {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new AdminInviteAcceptanceError('Invite token is required.', 400);
  }

  const tokenHash = hashInviteToken(trimmed);
  const invite = await findAdminInviteByTokenHash(tokenHash);

  if (!invite) {
    throw new AdminInviteAcceptanceError('Invite not found.', 404);
  }

  return invite;
};

export async function listAdminDirectory(): Promise<AdminDirectoryResponse> {
  const [admins, invites] = await Promise.all([listAdminUsers(), listAdminInvites()]);

  return {
    admins: admins.map(mapAdmin),
    invites: invites.map(mapInvite)
  };
}

export async function issueAdminInvite(input: {
  email: string;
  username: string;
  invitedByAdminId?: string | null;
}): Promise<{ invite: AdminInviteResponse; token: string; expiresAt: Date | null }> {
  const rawEmail = input.email?.trim();
  const rawUsername = input.username?.trim();

  if (!rawEmail) {
    throw new AdminDirectoryError('Email is required.', 400);
  }

  if (!rawUsername) {
    throw new AdminDirectoryError('Username is required.', 400);
  }

  const email = normalizeEmail(rawEmail);
  const username = normalizeUsername(rawUsername);

  const [existingByEmail, existingByUsername] = await Promise.all([
    findAdminUserByEmail(email),
    findAdminUserByUsername(username)
  ]);

  if (existingByEmail) {
    throw new AdminDirectoryError('An admin with that email already exists.', 409);
  }

  if (existingByUsername) {
    throw new AdminDirectoryError('An admin with that username already exists.', 409);
  }

  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.ADMIN_INVITE_TOKEN_TTL_MS);

  const pendingInvites = await listPendingInvitesForEmail(email);
  const latestInvite = pendingInvites[0] ?? null;

  let inviteRecord: AdminInviteWithSecrets;

  if (latestInvite) {
    inviteRecord = await updateAdminInvite(latestInvite.id, {
      tokenHash,
      status: 'SENT',
      expiresAt,
      lastSentAt: now,
      acceptedAt: null,
      revokedAt: null,
      invitedByAdmin: input.invitedByAdminId
        ? {
            connect: {
              id: input.invitedByAdminId
            }
          }
        : {
            disconnect: true
          },
      username
    });
  } else {
    inviteRecord = await createAdminInvite({
      email,
      username,
      tokenHash,
      status: 'SENT',
      expiresAt,
      lastSentAt: now,
      invitedByAdmin: input.invitedByAdminId
        ? {
            connect: {
              id: input.invitedByAdminId
            }
          }
        : undefined
    });
  }

  await sendAdminInviteEmail({
    email,
    username,
    token,
    invitedBy: inviteRecord.invitedByAdmin?.username ?? null,
    expiresAt
  });

  return {
    invite: mapInvite(inviteRecord),
    token,
    expiresAt
  };
}

export async function resendAdminInvite(inviteId: string, invitedByAdminId?: string | null): Promise<{
  invite: AdminInviteResponse;
  token: string;
  expiresAt: Date | null;
}> {
  if (!inviteId) {
    throw new AdminDirectoryError('Invite id is required.', 400);
  }

  const invite = await findAdminInviteById(inviteId);
  if (!invite) {
    throw new AdminDirectoryError('Invite not found.', 404);
  }

  assertInviteMutable(invite);

  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.ADMIN_INVITE_TOKEN_TTL_MS);

  const updated = await updateAdminInvite(invite.id, {
    tokenHash,
    status: 'SENT',
    expiresAt,
    lastSentAt: now,
    acceptedAt: null,
    revokedAt: null,
    invitedByAdmin: invitedByAdminId
      ? {
          connect: {
            id: invitedByAdminId
          }
        }
      : {
          disconnect: true
        }
  });

  await sendAdminInviteEmail({
    email: updated.email,
    username: updated.username,
    token,
    invitedBy: updated.invitedByAdmin?.username ?? null,
    expiresAt
  });

  return {
    invite: mapInvite(updated),
    token,
    expiresAt
  };
}

export async function previewAdminInvite(token: string): Promise<AdminInvitePreviewResult> {
  const invite = await resolveInviteByToken(token);
  const expired = invite.status === 'EXPIRED' || isInviteExpired(invite);

  let canAccept = true;
  let reason: string | null = null;

  if (invite.status === 'ACCEPTED' || invite.acceptedAt) {
    canAccept = false;
    reason = 'Invite already accepted.';
  } else if (invite.status === 'REVOKED' || invite.revokedAt) {
    canAccept = false;
    reason = 'Invite has been revoked.';
  } else if (expired) {
    canAccept = false;
    reason = 'Invite has expired.';
  }

  return {
    invite: mapInvite(invite),
    canAccept,
    reason
  };
}

export async function acceptAdminInvite(input: { token: string; password: string }): Promise<AdminInviteAcceptanceResult> {
  const { token, password } = input;

  if (!token || !password) {
    throw new AdminInviteAcceptanceError('Invite token and password are required.', 400);
  }

  const invite = await resolveInviteByToken(token);
  assertInviteAcceptable(invite);

  const [existingByEmail, existingByUsername] = await Promise.all([
    findAdminUserByEmail(invite.email),
    findAdminUserByUsername(invite.username)
  ]);

  if (existingByEmail || existingByUsername) {
    throw new AdminInviteAcceptanceError('An admin account already exists for this invite.', 409);
  }

  let passwordRecord;
  try {
    passwordRecord = await hashPassword(password);
  } catch (error) {
    if (error instanceof PasswordPolicyError) {
      throw new AdminInviteAcceptanceError(error.message, 422);
    }
    throw error;
  }

  const newAdmin = await createAdminUser({
    email: invite.email,
    username: invite.username,
    passwordHash: passwordRecord.hash,
    passwordAlgorithm: passwordRecord.algorithm,
    passwordVersion: passwordRecord.version,
    isActive: true
  });

  const now = new Date();
  const acceptedInvite = await updateAdminInvite(invite.id, {
    status: 'ACCEPTED',
    acceptedAt: now,
    revokedAt: null
  });

  return {
    admin: toPublicAdminUser(newAdmin),
    invite: mapInvite(acceptedInvite)
  };
}

export async function revokeAdminInvite(inviteId: string): Promise<AdminInviteResponse> {
  if (!inviteId) {
    throw new AdminDirectoryError('Invite id is required.', 400);
  }

  const invite = await findAdminInviteById(inviteId);
  if (!invite) {
    throw new AdminDirectoryError('Invite not found.', 404);
  }

  assertInviteMutable(invite);

  const now = new Date();
  const updated = await updateAdminInvite(invite.id, {
    status: 'REVOKED',
    revokedAt: now
  });

  return mapInvite(updated);
}

export async function updateAdminActivation(adminId: string, isActive: boolean, actingAdminId?: string | null): Promise<AdminDirectoryAdmin> {
  if (!adminId) {
    throw new AdminDirectoryError('Admin id is required.', 400);
  }

  if (!isActive && actingAdminId && adminId === actingAdminId) {
    throw new AdminDirectoryError('You cannot disable your own account.', 400);
  }

  const existing = await findAdminUserById(adminId);
  if (!existing) {
    throw new AdminDirectoryError('Admin not found.', 404);
  }

  const updated = await updateAdminActiveState(adminId, isActive);
  return mapAdmin(toPublicAdminUser(updated));
}
