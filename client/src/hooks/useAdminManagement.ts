import { useCallback, useEffect, useState } from 'react';
import type { AdminInvite, AdminUser } from '../types';
import { UnauthorizedError, useAdminAuth } from '../providers/AdminAuthProvider';

type InviteAdminInput = {
  email: string;
  username: string;
};

type InviteAdminResult = {
  invite: AdminInvite;
  debugToken?: string;
  expiresAt?: string | null;
};

type ResendInviteResult = {
  invite?: AdminInvite;
  debugToken?: string;
  expiresAt?: string | null;
};

type AdminManagementState = {
  admins: AdminUser[];
  invites: AdminInvite[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  inviteAdmin: (input: InviteAdminInput) => Promise<InviteAdminResult>;
  resendInvite: (inviteId: string) => Promise<ResendInviteResult>;
  revokeInvite: (inviteId: string) => Promise<void>;
  updateAdminStatus: (adminId: string, isActive: boolean) => Promise<AdminUser>;
};

const KNOWN_INVITE_STATUSES = new Set(['pending', 'sent', 'accepted', 'expired', 'revoked']);

const parseAdminUser = (value: unknown): AdminUser => {
  const record = (value ?? {}) as Record<string, unknown>;

  const id = typeof record.id === 'string' ? record.id : String(record.id ?? '');
  const email = typeof record.email === 'string' ? record.email : '';
  const username = typeof record.username === 'string' ? record.username : '';
  const isActive = typeof record.isActive === 'boolean' ? record.isActive : Boolean(record.isActive);
  const lastLoginAt = typeof record.lastLoginAt === 'string' ? record.lastLoginAt : null;
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : '';
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : '';

  return {
    id,
    email,
    username,
    isActive,
    lastLoginAt,
    createdAt,
    updatedAt
  };
};

const parseInvite = (value: unknown): AdminInvite => {
  const record = (value ?? {}) as Record<string, unknown>;

  const id = typeof record.id === 'string' ? record.id : String(record.id ?? '');
  const email = typeof record.email === 'string' ? record.email : '';
  const username = typeof record.username === 'string' ? record.username : '';
  const statusRaw = typeof record.status === 'string' ? record.status.toLowerCase() : '';
  const status = KNOWN_INVITE_STATUSES.has(statusRaw) ? (statusRaw as AdminInvite['status']) : 'pending';
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : '';
  const expiresAt = typeof record.expiresAt === 'string' ? record.expiresAt : null;
  const lastSentAt = typeof record.lastSentAt === 'string' ? record.lastSentAt : null;
  const acceptedAt = typeof record.acceptedAt === 'string' ? record.acceptedAt : null;
  const revokedAt = typeof record.revokedAt === 'string' ? record.revokedAt : null;

  const invitedByRecord = record.invitedBy as Record<string, unknown> | undefined;
  const invitedBy = invitedByRecord
    ? {
        id: typeof invitedByRecord.id === 'string' ? invitedByRecord.id : String(invitedByRecord.id ?? ''),
        username: typeof invitedByRecord.username === 'string' ? invitedByRecord.username : ''
      }
    : null;

  return {
    id,
    email,
    username,
    status,
    createdAt,
    expiresAt,
    lastSentAt,
    acceptedAt,
    revokedAt,
    invitedBy
  };
};

const tryParseJson = async (response: Response): Promise<any> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export function useAdminManagement(): AdminManagementState {
  const { fetchWithAuth } = useAdminAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchWithAuth('/admin/users');
      const payload = await tryParseJson(response);

      const adminPayload = Array.isArray(payload?.admins) ? payload.admins : payload;
      const invitePayload = Array.isArray(payload?.invites) ? payload.invites : [];

      setAdmins(Array.isArray(adminPayload) ? adminPayload.map(parseAdminUser) : []);
      setInvites(Array.isArray(invitePayload) ? invitePayload.map(parseInvite) : []);
      return true;
    } catch (err) {
      const message = err instanceof UnauthorizedError ? err.message : err instanceof Error ? err.message : 'Unable to load admin accounts.';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    void load();
  }, [load]);

  const inviteAdmin = useCallback(
    async ({ email, username }: InviteAdminInput): Promise<InviteAdminResult> => {
      const trimmedEmail = email.trim();
      const trimmedUsername = username.trim();

      if (!trimmedEmail) {
        throw new Error('Email is required.');
      }

      if (!trimmedUsername) {
        throw new Error('Username is required.');
      }

      try {
        const response = await fetchWithAuth('/admin/users/invite', {
          method: 'POST',
          body: JSON.stringify({ email: trimmedEmail, username: trimmedUsername })
        });

        const payload = await tryParseJson(response);
        const resultInvite = parseInvite(payload?.invite ?? payload);

        await load();

        return {
          invite: resultInvite,
          debugToken: typeof payload?.debugToken === 'string' ? payload.debugToken : undefined,
          expiresAt: typeof payload?.expiresAt === 'string' ? payload.expiresAt : null
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to send invite.';
        setError(message);
        throw err instanceof Error ? err : new Error(message);
      }
    },
    [fetchWithAuth, load]
  );

  const resendInvite = useCallback(
    async (inviteId: string): Promise<ResendInviteResult> => {
      if (!inviteId) {
        throw new Error('Invite id is required.');
      }

      try {
        const response = await fetchWithAuth(`/admin/users/invites/${inviteId}/resend`, {
          method: 'POST'
        });

        const payload = await tryParseJson(response);
        const refreshedInvite = payload?.invite ? parseInvite(payload.invite) : undefined;

        await load();

        return {
          invite: refreshedInvite,
          debugToken: typeof payload?.debugToken === 'string' ? payload.debugToken : undefined,
          expiresAt: typeof payload?.expiresAt === 'string' ? payload.expiresAt : null
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to resend invite.';
        setError(message);
        throw err instanceof Error ? err : new Error(message);
      }
    },
    [fetchWithAuth, load]
  );

  const revokeInvite = useCallback(
    async (inviteId: string): Promise<void> => {
      if (!inviteId) {
        throw new Error('Invite id is required.');
      }

      try {
        await fetchWithAuth(`/admin/users/invites/${inviteId}`, {
          method: 'DELETE'
        });

        await load();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to revoke invite.';
        setError(message);
        throw err instanceof Error ? err : new Error(message);
      }
    },
    [fetchWithAuth, load]
  );

  const updateAdminStatus = useCallback(
    async (adminId: string, isActive: boolean): Promise<AdminUser> => {
      if (!adminId) {
        throw new Error('Admin id is required.');
      }

      try {
        const response = await fetchWithAuth(`/admin/users/${adminId}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive })
        });

        const payload = await tryParseJson(response);
        const updatedAdmin = parseAdminUser(payload?.admin ?? payload);

        await load();

        return updatedAdmin;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to update admin status.';
        setError(message);
        throw err instanceof Error ? err : new Error(message);
      }
    },
    [fetchWithAuth, load]
  );

  const refresh = useCallback(async () => {
    const success = await load();
    if (!success) {
      throw new Error('Unable to refresh admin accounts.');
    }
  }, [load]);

  return {
    admins,
    invites,
    isLoading,
    error,
    refresh,
    inviteAdmin,
    resendInvite,
    revokeInvite,
    updateAdminStatus
  };
}
