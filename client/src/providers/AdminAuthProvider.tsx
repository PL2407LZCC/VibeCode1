import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AdminUser } from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

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

type AdminAuthContextValue = {
  status: AdminAuthStatus;
  admin: AdminUser | null;
  error: string | null;
  clearError: () => void;
  login: (input: LoginInput) => Promise<LoginResult>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<PasswordResetRequestResult>;
  confirmPasswordReset: (token: string, password: string) => Promise<PasswordResetConfirmResult>;
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

    let payload: { admin?: AdminUser } | null = null;
    try {
      payload = (await response.json()) as { admin?: AdminUser; message?: string };
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
      fetchWithAuth
    }),
    [status, admin, error, clearError, login, logout, requestPasswordReset, confirmPasswordReset, fetchWithAuth]
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
