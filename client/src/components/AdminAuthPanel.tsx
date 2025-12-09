import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminAuth } from '../providers/AdminAuthProvider';

const MIN_PASSWORD_LENGTH = 12;

type PanelMode = 'login' | 'reset-request' | 'reset-confirm' | 'invite-accept';

type AdminAuthPanelProps = {
  initialMode?: PanelMode;
};

const getResetTokenFromLocation = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('token')?.trim() ?? '';
  } catch {
    return '';
  }
};

const clearResetTokenFromLocation = () => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    window.history.replaceState(window.history.state, document.title, url.toString());
  } catch {
    // Ignore history manipulation issues in unsupported environments.
  }
};

const getInviteTokenFromLocation = () => {
  if (typeof window === 'undefined') {
    return { token: '', isInvitePath: false };
  }

  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('token')?.trim() ?? '';
    const isInvitePath = url.pathname.toLowerCase().includes('/invite');
    return { token, isInvitePath };
  } catch {
    return { token: '', isInvitePath: false };
  }
};

const clearInviteTokenFromLocation = () => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    window.history.replaceState(window.history.state, document.title, url.toString());
  } catch {
    // Ignore history manipulation issues in unsupported environments.
  }
};

export function AdminAuthPanel({ initialMode = 'login' }: AdminAuthPanelProps) {
  const { login, requestPasswordReset, confirmPasswordReset, previewInvite, acceptInvite } = useAdminAuth();
  const [mode, setMode] = useState<PanelMode>(initialMode);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [debugToken, setDebugToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState('');
  type InvitePreviewState = ReturnType<typeof previewInvite> extends Promise<infer R> ? R : never;
  const [invitePreview, setInvitePreview] = useState<InvitePreviewState | null>(null);
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteConfirmPassword, setInviteConfirmPassword] = useState('');
  const [isInviteLoading, setIsInviteLoading] = useState(false);

  const effectiveMode: PanelMode = useMemo(() => {
    if (mode === 'reset-confirm' && !resetToken) {
      return 'reset-request';
    }
    return mode;
  }, [mode, resetToken]);

  const inviteDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    []
  );

  const formatInviteDate = (value: string | null): string => {
    if (!value) {
      return '—';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }

    return inviteDateFormatter.format(date);
  };

  useEffect(() => {
    const inviteContext = getInviteTokenFromLocation();
    if (inviteContext.isInvitePath) {
      setInviteToken(inviteContext.token);
      setMode('invite-accept');
      return;
    }

    const token = getResetTokenFromLocation();
    if (token) {
      setResetToken(token);
      setMode('reset-confirm');
    }
  }, []);

  const resetFeedback = useCallback(() => {
    setMessage(null);
    setDebugToken(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (mode !== 'invite-accept') {
      setInvitePreview(null);
      setInvitePassword('');
      setInviteConfirmPassword('');
      return;
    }

    if (!inviteToken) {
      setInvitePreview(null);
      setInvitePassword('');
      setInviteConfirmPassword('');
      return;
    }

    let cancelled = false;
    resetFeedback();
    setIsInviteLoading(true);

    const handle = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      previewInvite(inviteToken)
        .then((result) => {
          if (cancelled) {
            return;
          }

          setInvitePreview(result);
          setInvitePassword('');
          setInviteConfirmPassword('');

          if (!result.canAccept && result.reason) {
            setError(result.reason);
            setMessage(null);
          } else {
            setError(null);
            setMessage(`Invite for ${result.invite.email}. Set your password to continue.`);
          }
        })
        .catch((err) => {
          if (cancelled) {
            return;
          }
          setInvitePreview(null);
          setError(err instanceof Error ? err.message : 'Unable to load invite.');
          setMessage(null);
        })
        .finally(() => {
          if (!cancelled) {
            setIsInviteLoading(false);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
      setIsInviteLoading(false);
    };
  }, [mode, inviteToken, previewInvite, resetFeedback]);

  const switchMode = useCallback(
    (nextMode: PanelMode) => {
      resetFeedback();
      setIsSubmitting(false);
      setPassword('');
      setConfirmPassword('');
      setIdentifier('');
      setEmail('');
      if (nextMode !== 'reset-confirm') {
        setResetToken('');
      }
      if (nextMode !== 'invite-accept') {
        setInviteToken('');
        setInvitePreview(null);
        setInvitePassword('');
        setInviteConfirmPassword('');
        clearInviteTokenFromLocation();
      }
      setMode(nextMode);
    },
    [resetFeedback]
  );

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    resetFeedback();

    if (!identifier.trim() || !password) {
      setError('Email/username and password are required.');
      return;
    }

    setIsSubmitting(true);

    try {
      await login({ identifier, password, remember });
      setMessage('Welcome back!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to login.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFeedback();

    if (!email.trim()) {
      setError('Email is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await requestPasswordReset(email);
      setMessage(result.message);
      setDebugToken(result.debugToken ?? null);
      if (result.debugToken) {
        setResetToken(result.debugToken);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to request password reset.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetConfirm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFeedback();

    if (!resetToken.trim()) {
      setError('Reset token is required.');
      return;
    }

    if (!password || !confirmPassword) {
      setError('Enter and confirm your new password.');
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (password !== confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      await confirmPasswordReset(resetToken, password);
      setMessage('Password updated. You are now signed in.');
      clearResetTokenFromLocation();
      setResetToken('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInviteAccept = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetFeedback();

    const token = inviteToken.trim();

    if (!token) {
      setError('Invite token is required.');
      return;
    }

    if (!invitePreview) {
      setError('Unable to load invite details. Please refresh the link.');
      return;
    }

    if (!invitePreview.canAccept) {
      setError(invitePreview.reason ?? 'Invite cannot be accepted.');
      return;
    }

    if (!invitePassword || !inviteConfirmPassword) {
      setError('Enter and confirm your new password.');
      return;
    }

    if (invitePassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (invitePassword !== inviteConfirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      await acceptInvite({ token, password: invitePassword });
      setMessage('Welcome aboard! Redirecting to your dashboard…');
      clearInviteTokenFromLocation();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to activate admin account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="admin-auth-panel" aria-live="polite">
      <header className="admin-auth-panel__header">
        <h2 className="admin-auth-panel__title">
          {effectiveMode === 'login' && 'Admin Sign In'}
          {effectiveMode === 'reset-request' && 'Reset Password'}
          {effectiveMode === 'reset-confirm' && 'Set New Password'}
          {effectiveMode === 'invite-accept' && 'Accept Admin Invitation'}
        </h2>
        <p className="admin-auth-panel__subtitle">
          {effectiveMode === 'login' && 'Access the dashboard with your admin credentials.'}
          {effectiveMode === 'reset-request' && 'Enter your email to receive reset instructions.'}
          {effectiveMode === 'reset-confirm' && 'Choose a strong password to secure your account.'}
          {effectiveMode === 'invite-accept' && 'Join the team by setting a password for your new admin account.'}
        </p>
      </header>

      {error ? (
        <div className="admin-auth-panel__alert admin-auth-panel__alert--error" role="alert">
          {error}
        </div>
      ) : null}
      {message ? <div className="admin-auth-panel__alert admin-auth-panel__alert--info">{message}</div> : null}
      {debugToken && effectiveMode !== 'invite-accept' ? (
        <div className="admin-auth-panel__debug" role="note">
          <strong>Debug token:</strong> <code>{debugToken}</code>
        </div>
      ) : null}

      {effectiveMode === 'login' ? (
        <form className="admin-auth-panel__form" onSubmit={handleLoginSubmit}>
          <label className="admin-auth-panel__field">
            <span>Email or username</span>
            <input
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              disabled={isSubmitting}
              required
            />
          </label>

          <label className="admin-auth-panel__field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isSubmitting}
              required
            />
          </label>

          <label className="admin-auth-panel__checkbox">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              disabled={isSubmitting}
            />
            <span>Keep me signed in on this device</span>
          </label>

          <div className="admin-auth-panel__actions">
            <button type="submit" className="admin-button admin-button--primary" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="button"
              className="admin-button admin-button--ghost"
              onClick={() => switchMode('reset-request')}
              disabled={isSubmitting}
            >
              Forgot password?
            </button>
          </div>
        </form>
      ) : null}

      {effectiveMode === 'reset-request' ? (
        <form className="admin-auth-panel__form" onSubmit={handleResetRequest}>
          <label className="admin-auth-panel__field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSubmitting}
              required
            />
          </label>

          <div className="admin-auth-panel__actions">
            <button type="submit" className="admin-button admin-button--primary" disabled={isSubmitting}>
              {isSubmitting ? 'Sending…' : 'Send reset link'}
            </button>
            <button
              type="button"
              className="admin-button admin-button--ghost"
              onClick={() => switchMode('login')}
              disabled={isSubmitting}
            >
              Back to sign in
            </button>
          </div>
        </form>
      ) : null}

      {effectiveMode === 'reset-confirm' ? (
        <form className="admin-auth-panel__form" onSubmit={handleResetConfirm}>
          <label className="admin-auth-panel__field">
            <span>Reset token</span>
            <input
              type="text"
              value={resetToken}
              onChange={(event) => setResetToken(event.target.value)}
              disabled={isSubmitting}
              required
            />
          </label>

          <label className="admin-auth-panel__field">
            <span>New password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isSubmitting}
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
            <small>Use at least {MIN_PASSWORD_LENGTH} characters.</small>
          </label>

          <label className="admin-auth-panel__field">
            <span>Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={isSubmitting}
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
          </label>

          <div className="admin-auth-panel__actions">
            <button type="submit" className="admin-button admin-button--primary" disabled={isSubmitting}>
              {isSubmitting ? 'Updating…' : 'Update password'}
            </button>
            <button
              type="button"
              className="admin-button admin-button--ghost"
              onClick={() => switchMode('login')}
              disabled={isSubmitting}
            >
              Back to sign in
            </button>
          </div>
        </form>
      ) : null}

      {effectiveMode === 'invite-accept' ? (
        <form className="admin-auth-panel__form" onSubmit={handleInviteAccept}>
          <label className="admin-auth-panel__field">
            <span>Invite token</span>
            <input
              type="text"
              value={inviteToken}
              onChange={(event) => setInviteToken(event.target.value)}
              disabled={isInviteLoading || isSubmitting}
              required
            />
          </label>

          {isInviteLoading ? (
            <p className="admin-auth-panel__status" role="status">
              Validating invite…
            </p>
          ) : null}

          {invitePreview ? (
            <div className="admin-auth-panel__invite-summary" aria-live="polite">
              <p>
                <strong>Email:</strong> {invitePreview.invite.email}
              </p>
              <p>
                <strong>Username:</strong> {invitePreview.invite.username}
              </p>
              <p>
                <strong>Invited by:</strong> {invitePreview.invite.invitedBy?.username ?? '—'}
              </p>
              <p>
                <strong>Expires:</strong> {formatInviteDate(invitePreview.invite.expiresAt)}
              </p>
              {!invitePreview.canAccept && invitePreview.reason ? (
                <p className="admin-auth-panel__invite-warning" role="alert">{invitePreview.reason}</p>
              ) : null}
            </div>
          ) : null}

          <label className="admin-auth-panel__field">
            <span>New password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={invitePassword}
              onChange={(event) => setInvitePassword(event.target.value)}
              disabled={isSubmitting || isInviteLoading || !(invitePreview?.canAccept ?? false)}
              minLength={MIN_PASSWORD_LENGTH}
              required={invitePreview?.canAccept ?? false}
            />
            <small>Use at least {MIN_PASSWORD_LENGTH} characters.</small>
          </label>

          <label className="admin-auth-panel__field">
            <span>Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={inviteConfirmPassword}
              onChange={(event) => setInviteConfirmPassword(event.target.value)}
              disabled={isSubmitting || isInviteLoading || !(invitePreview?.canAccept ?? false)}
              minLength={MIN_PASSWORD_LENGTH}
              required={invitePreview?.canAccept ?? false}
            />
          </label>

          <div className="admin-auth-panel__actions">
            <button
              type="submit"
              className="admin-button admin-button--primary"
              disabled={
                isSubmitting ||
                isInviteLoading ||
                !(invitePreview?.canAccept ?? false)
              }
            >
              {isSubmitting ? 'Activating…' : 'Activate account'}
            </button>
            <button
              type="button"
              className="admin-button admin-button--ghost"
              onClick={() => switchMode('login')}
              disabled={isSubmitting || isInviteLoading}
            >
              Back to sign in
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
