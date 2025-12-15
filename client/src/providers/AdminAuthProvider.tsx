import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AdminInvite, AdminUser } from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const KNOWN_INVITE_STATUSES: ReadonlySet<AdminInvite['status']> = new Set(['pending', 'sent', 'accepted', 'expired', 'revoked']);

const parseInvite = (value: unknown): AdminInvite => {
  const record = (value ?? {}) as Record<string, unknown>;

  const id = typeof record.id === 'string' ? record.id : String(record.id ?? '');
  const email = typeof record.email === 'string' ? record.email : '';
  const username = typeof record.username === 'string' ? record.username : '';
  const statusRaw = typeof record.status === 'string' ? record.status.toLowerCase() : '';
  const status = KNOWN_INVITE_STATUSES.has(statusRaw as AdminInvite['status']) ? (statusRaw as AdminInvite['status']) : 'pending';
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
    invitedBy,
    createdAt,
    expiresAt,
    lastSentAt,
    acceptedAt,
    revokedAt
  };
};

export class UnauthorizedError extends Error {
  constructor(message = 'Session expired. Please sign in again.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export type AdminAuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type LoginInput = {
  identifier: string;
  password: string;
  remember?: boolean;
};

type LoginResult = {
  admin: AdminUser;
  needsPasswordUpgrade: boolean;
};

type PasswordResetRequestResult = {
  message: string;
  debugToken?: string;
  expiresAt?: string;
  admin?: AdminUser | null;
};

type PasswordResetConfirmResult = {
  admin: AdminUser;
};

type InvitePreviewResult = {
  invite: AdminInvite;
  canAccept: boolean;
  reason: string | null;
};

type AcceptInviteInput = {
  token: string;
  password: string;
};

type AcceptInviteResult = {
  admin: AdminUser;
  invite: AdminInvite;
};

type AdminAuthContextValue = {
  status: AdminAuthStatus;
  admin: AdminUser | null;
  error: string | null;
  clearError: () => void;
  login: (input: LoginInput) => Promise<LoginResult>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<PasswordResetRequestResult>;
  confirmPasswordReset: (token: string, password: string) => Promise<PasswordResetConfirmResult>;
  previewInvite: (token: string) => Promise<InvitePreviewResult>;
  acceptInvite: (input: AcceptInviteInput) => Promise<AcceptInviteResult>;
  fetchWithAuth: (path: string, init?: RequestInit) => Promise<Response>;
};

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

const readErrorMessage = async (response: Response) => {
  try {
    const payload = await response.clone().json();
    if (payload && typeof payload.message === 'string' && payload.message.trim().length > 0) {
      return payload.message.trim();
    }
  } catch {
    // Ignore parse issues; caller will fall back to default messages.
  }

  return null;
};

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [status, setStatus] = useState<AdminAuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const loadSession = useCallback(async () => {
    setStatus('loading');

    try {
      const response = await fetch(`${API_URL}/auth/session`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error((await readErrorMessage(response)) ?? 'Unable to verify admin session.');
      }

      const payload = (await response.json()) as { admin: AdminUser | null };
      if (isMounted.current) {
        if (payload?.admin) {
          setAdmin(payload.admin);
          setStatus('authenticated');
        } else {
          setAdmin(null);
          setStatus('unauthenticated');
        }
      }
    } catch (sessionError) {
      console.error('Failed to load admin session', sessionError);
      if (isMounted.current) {
        setAdmin(null);
        setStatus('unauthenticated');
      }
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const fetchWithAuth = useCallback(
    async (path: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers ?? {});
      const body = init?.body as BodyInit | null | undefined;
      const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

      if (body && !isFormData && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const response = await fetch(`${API_URL}${path}`, {
        ...init,
        headers,
        credentials: 'include'
      });

      if (response.status === 401) {
        const message = (await readErrorMessage(response)) ?? 'Session expired. Please sign in again.';
        if (isMounted.current) {
          setAdmin(null);
          setStatus('unauthenticated');
        }
        throw new UnauthorizedError(message);
      }

      if (!response.ok) {
        const message = (await readErrorMessage(response)) ?? `Request failed (${response.status}).`;
        throw new Error(message);
      }

      return response;
    },
    []
  );

  const login = useCallback(
    async ({ identifier, password, remember }: LoginInput): Promise<LoginResult> => {
      if (!identifier.trim() || !password) {
        throw new Error('Email/username and password are required.');
      }

      setError(null);

      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ identifier, password, remember: Boolean(remember) })
      });

      if (!response.ok) {
        const message = (await readErrorMessage(response)) ?? 'Unable to login with the provided credentials.';
        throw new Error(message);
      }

      const payload = (await response.json()) as { admin: AdminUser; needsPasswordUpgrade?: boolean };

      if (!payload?.admin) {
        throw new Error('Login succeeded but no admin profile was returned.');
      }

      if (isMounted.current) {
        setAdmin(payload.admin);
        setStatus('authenticated');
      }

      return {
        admin: payload.admin,
        needsPasswordUpgrade: Boolean(payload.needsPasswordUpgrade)
      };
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (logoutError) {
      console.warn('Failed to call logout endpoint', logoutError);
    } finally {
      if (isMounted.current) {
        setAdmin(null);
        setStatus('unauthenticated');
      }
    }
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<PasswordResetRequestResult> => {
    if (!email.trim()) {
      throw new Error('Email is required.');
    }

    const response = await fetch(`${API_URL}/auth/password-reset/request`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });

    const payload = (await response.json()) as PasswordResetRequestResult & { message?: string };

    if (!response.ok) {
      throw new Error(payload?.message ?? 'Unable to process password reset request.');
    }

    return {
      message: payload.message ?? 'If the account exists, an email will be sent shortly.',
      debugToken: payload.debugToken,
      expiresAt: payload.expiresAt,
      admin: payload.admin ?? null
    };
  }, []);

  const confirmPasswordReset = useCallback(async (token: string, password: string): Promise<PasswordResetConfirmResult> => {
    if (!token || !password) {
      throw new Error('Reset token and new password are required.');
    }

    const response = await fetch(`${API_URL}/auth/password-reset/confirm`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token, password })
    });

    type PasswordResetConfirmPayload = { admin?: AdminUser; message?: string };

    let payload: PasswordResetConfirmPayload | null = null;
    try {
      payload = (await response.json()) as PasswordResetConfirmPayload;
    } catch {
      // Some error responses might not include JSON.
    }

    if (!response.ok || !payload?.admin) {
      const message = payload?.message ?? 'Unable to complete password reset.';
      throw new Error(message);
    }

    if (isMounted.current) {
      setAdmin(payload.admin);
      setStatus('authenticated');
    }

    return { admin: payload.admin };
  }, []);

  const previewInvite = useCallback(async (token: string): Promise<InvitePreviewResult> => {
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      throw new Error('Invite token is required.');
    }

    const response = await fetch(`${API_URL}/auth/invite/preview`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token: trimmedToken })
    });

    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message = payload?.message ?? 'Unable to preview invite.';
      throw new Error(message);
    }

    const invitePayload = payload?.invite ?? payload;
    const invite = parseInvite(invitePayload);
    const reason = typeof payload?.reason === 'string' ? payload.reason : null;
    const canAccept = typeof payload?.canAccept === 'boolean'
      ? payload.canAccept
      : (invite.status === 'pending' || invite.status === 'sent') && !reason;

    return {
      invite,
      canAccept,
      reason
    };
  }, []);

  const acceptInvite = useCallback(async ({ token, password }: AcceptInviteInput): Promise<AcceptInviteResult> => {
    const trimmedToken = token.trim();
    if (!trimmedToken || !password) {
      throw new Error('Invite token and password are required.');
    }

    setError(null);

    const response = await fetch(`${API_URL}/auth/invite/accept`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token: trimmedToken, password })
    });

    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok || !payload?.admin) {
      const message = payload?.message ?? 'Unable to activate admin account.';
      throw new Error(message);
    }

    const invite = parseInvite(payload.invite);
    const adminPayload = payload.admin as AdminUser;

    if (isMounted.current) {
      setAdmin(adminPayload);
      setStatus('authenticated');
    }

    return {
      admin: adminPayload,
      invite
    };
  }, []);

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      status,
      admin,
      error,
      clearError,
      login,
      logout,
      requestPasswordReset,
      confirmPasswordReset,
      previewInvite,
      acceptInvite,
      fetchWithAuth
    }),
    [status, admin, error, clearError, login, logout, requestPasswordReset, confirmPasswordReset, previewInvite, acceptInvite, fetchWithAuth]
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider.');
  }
  return context;
}
