import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminAuth } from '../providers/AdminAuthProvider';

const MIN_PASSWORD_LENGTH = 12;

type PanelMode = 'login' | 'reset-request' | 'reset-confirm';

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

export function AdminAuthPanel({ initialMode = 'login' }: AdminAuthPanelProps) {
  const { login, requestPasswordReset, confirmPasswordReset } = useAdminAuth();
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

  const effectiveMode: PanelMode = useMemo(() => {
    if (mode === 'reset-confirm' && !resetToken) {
      return 'reset-request';
    }
    return mode;
  }, [mode, resetToken]);

  useEffect(() => {
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

  return (
    <section className="admin-auth-panel" aria-live="polite">
      <header className="admin-auth-panel__header">
        <h2 className="admin-auth-panel__title">
          {effectiveMode === 'login' && 'Admin Sign In'}
          {effectiveMode === 'reset-request' && 'Reset Password'}
          {effectiveMode === 'reset-confirm' && 'Set New Password'}
        </h2>
        <p className="admin-auth-panel__subtitle">
          {effectiveMode === 'login' && 'Access the dashboard with your admin credentials.'}
          {effectiveMode === 'reset-request' && 'Enter your email to receive reset instructions.'}
          {effectiveMode === 'reset-confirm' && 'Choose a strong password to secure your account.'}
        </p>
      </header>

      {error ? (
        <div className="admin-auth-panel__alert admin-auth-panel__alert--error" role="alert">
          {error}
        </div>
      ) : null}
      {message ? <div className="admin-auth-panel__alert admin-auth-panel__alert--info">{message}</div> : null}
      {debugToken ? (
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
    </section>
  );
}
