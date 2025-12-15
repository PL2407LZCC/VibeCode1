import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useAdminManagement } from '../hooks/useAdminManagement';
import type { AdminInvite, AdminUser } from '../types';

type StatusKind = 'success' | 'error';

type AdminManagementPanelProps = {
  onStatus: (kind: StatusKind, message: string) => void;
};

const formatDateTime = (formatter: Intl.DateTimeFormat, value: string | null): string => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return formatter.format(date);
};

const getInviteStatusLabel = (invite: AdminInvite): string => {
  if (invite.status === 'accepted') {
    return 'Accepted';
  }

  if (invite.status === 'expired') {
    return 'Expired';
  }

  if (invite.status === 'revoked') {
    return 'Revoked';
  }

  if (invite.status === 'sent') {
    return 'Sent';
  }

  return 'Pending';
};

export function AdminManagementPanel({ onStatus }: AdminManagementPanelProps) {
  const { admins, invites, isLoading, error, refresh, inviteAdmin, resendInvite, revokeInvite, updateAdminStatus } = useAdminManagement();
  const [formState, setFormState] = useState({ email: '', username: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mutatingAdminId, setMutatingAdminId] = useState<string | null>(null);
  const [mutatingInviteId, setMutatingInviteId] = useState<string | null>(null);
  const [debugToken, setDebugToken] = useState<string | null>(null);
  const [debugExpiresAt, setDebugExpiresAt] = useState<string | null>(null);
  const lastErrorRef = useRef<string | null>(null);

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }), []);

  useEffect(() => {
    if (error && error !== lastErrorRef.current) {
      lastErrorRef.current = error;
      onStatus('error', error);
    }

    if (!error) {
      lastErrorRef.current = null;
    }
  }, [error, onStatus]);

  const activeAdmins = admins.filter((admin) => admin.isActive).length;
  const inactiveAdmins = admins.length - activeAdmins;
  const pendingInvites = invites.filter((invite) => invite.status === 'pending' || invite.status === 'sent').length;

  const resetDebugInfo = () => {
    setDebugToken(null);
    setDebugExpiresAt(null);
  };

  const handleRefresh = async () => {
    resetDebugInfo();
    setIsRefreshing(true);

    try {
      await refresh();
      onStatus('success', 'Admin directory refreshed.');
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : 'Unable to refresh admin directory.';
      onStatus('error', message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetDebugInfo();

    const submittedEmail = formState.email.trim();
    const submittedUsername = formState.username.trim();

    try {
      setIsSubmitting(true);
      const result = await inviteAdmin({ email: submittedEmail, username: submittedUsername });
      setFormState({ email: '', username: '' });

      if (result.debugToken) {
        setDebugToken(result.debugToken);
      }

      if (result.expiresAt) {
        setDebugExpiresAt(result.expiresAt);
      }

      onStatus('success', `Invite sent to ${submittedEmail}.`);
    } catch (inviteError) {
      const message = inviteError instanceof Error ? inviteError.message : 'Unable to send invite.';
      onStatus('error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleAdmin = async (admin: AdminUser) => {
    resetDebugInfo();
    setMutatingAdminId(admin.id);

    try {
      const updated = await updateAdminStatus(admin.id, !admin.isActive);
      onStatus('success', updated.isActive ? `${updated.username} reactivated.` : `${updated.username} disabled.`);
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : 'Unable to update admin.';
      onStatus('error', message);
    } finally {
      setMutatingAdminId(null);
    }
  };

  const handleResendInvite = async (invite: AdminInvite) => {
    resetDebugInfo();
    setMutatingInviteId(invite.id);

    try {
      const result = await resendInvite(invite.id);

      if (result.debugToken) {
        setDebugToken(result.debugToken);
      }

      if (result.expiresAt) {
        setDebugExpiresAt(result.expiresAt);
      }

      onStatus('success', `Invite re-sent to ${invite.email}.`);
    } catch (resendError) {
      const message = resendError instanceof Error ? resendError.message : 'Unable to resend invite.';
      onStatus('error', message);
    } finally {
      setMutatingInviteId(null);
    }
  };

  const handleRevokeInvite = async (invite: AdminInvite) => {
    resetDebugInfo();

    const confirmed = typeof window !== 'undefined' && typeof window.confirm === 'function'
      ? window.confirm(`Revoke invite for ${invite.email}?`)
      : true;

    if (!confirmed) {
      return;
    }

    setMutatingInviteId(invite.id);

    try {
      await revokeInvite(invite.id);
      onStatus('success', `Invite revoked for ${invite.email}.`);
    } catch (revokeError) {
      const message = revokeError instanceof Error ? revokeError.message : 'Unable to revoke invite.';
      onStatus('error', message);
    } finally {
      setMutatingInviteId(null);
    }
  };

  const isBusy = isLoading || isSubmitting || isRefreshing || mutatingAdminId !== null || mutatingInviteId !== null;

  return (
    <div className="admin-management">
      <div className="admin-management__intro">
        <div>
          <h3 className="admin-management__title">Admin directory</h3>
          <p className="admin-management__subtitle">Invite new teammates and manage access to the control panel.</p>
        </div>
        <div className="admin-management__actions">
          <button type="button" className="admin-button admin-button--ghost" onClick={() => void handleRefresh()} disabled={isRefreshing || isLoading}>
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="admin-management__stats">
        <div className="admin-management__stat">
          <span className="admin-management__stat-label">Active admins</span>
          <span className="admin-management__stat-value">{activeAdmins}</span>
        </div>
        <div className="admin-management__stat">
          <span className="admin-management__stat-label">Disabled</span>
          <span className="admin-management__stat-value">{inactiveAdmins}</span>
        </div>
        <div className="admin-management__stat">
          <span className="admin-management__stat-label">Pending invites</span>
          <span className="admin-management__stat-value">{pendingInvites}</span>
        </div>
      </div>

      <form className="admin-management__form" onSubmit={handleInviteSubmit}>
        <div className="admin-management__form-grid">
          <label className="admin-management__field">
            <span className="admin-management__field-label">Email address</span>
            <input
              type="email"
              value={formState.email}
              onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="admin@example.com"
              required
              disabled={isBusy}
            />
          </label>
          <label className="admin-management__field">
            <span className="admin-management__field-label">Username</span>
            <input
              type="text"
              value={formState.username}
              onChange={(event) => setFormState((prev) => ({ ...prev, username: event.target.value }))}
              placeholder="janedoe"
              required
              disabled={isBusy}
            />
          </label>
        </div>
        <div className="admin-management__form-actions">
          <button type="submit" className="admin-button admin-button--primary" disabled={isBusy}>
            {isSubmitting ? 'Sending invite…' : 'Send invite'}
          </button>
        </div>
      </form>

      {debugToken ? (
        <div className="admin-management__debug">
          <strong>Debug token</strong>
          <code>{debugToken}</code>
          <small>
            {debugExpiresAt ? `Expires ${formatDateTime(dateFormatter, debugExpiresAt)}.` : 'Token expiry not provided.'}
            {' '}Use this for local testing only.
          </small>
        </div>
      ) : null}

      <section className="admin-management__section">
        <header className="admin-management__section-header">
          <h4>Current admins</h4>
          <span className="admin-management__section-count">{admins.length}</span>
        </header>
        {admins.length === 0 ? (
          <p className="admin-empty">No admin accounts configured.</p>
        ) : (
          <div className="admin-table__wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Username</th>
                  <th scope="col">Email</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last login</th>
                  <th scope="col" className="admin-table__actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin.id}>
                    <td data-label="Username">{admin.username}</td>
                    <td data-label="Email">{admin.email}</td>
                    <td data-label="Status">
                      <span className={`admin-badge ${admin.isActive ? 'admin-badge--success' : 'admin-badge--muted'}`}>
                        {admin.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td data-label="Last login">{formatDateTime(dateFormatter, admin.lastLoginAt)}</td>
                    <td className="admin-table__actions">
                      <button
                        type="button"
                        className="admin-button admin-button--ghost"
                        onClick={() => void handleToggleAdmin(admin)}
                        disabled={isLoading || mutatingAdminId === admin.id}
                      >
                        {admin.isActive ? 'Disable' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-management__section">
        <header className="admin-management__section-header">
          <h4>Invitations</h4>
          <span className="admin-management__section-count">{invites.length}</span>
        </header>
        {invites.length === 0 ? (
          <p className="admin-empty">No pending invites.</p>
        ) : (
          <div className="admin-table__wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Username</th>
                  <th scope="col">Status</th>
                  <th scope="col">Invited by</th>
                  <th scope="col">Last sent</th>
                  <th scope="col">Expires</th>
                  <th scope="col" className="admin-table__actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.id}>
                    <td data-label="Email">{invite.email}</td>
                    <td data-label="Username">{invite.username}</td>
                    <td data-label="Status">
                      <span className={`admin-badge admin-badge--${invite.status}`}>
                        {getInviteStatusLabel(invite)}
                      </span>
                    </td>
                    <td data-label="Invited by">{invite.invitedBy?.username ?? '—'}</td>
                    <td data-label="Last sent">{formatDateTime(dateFormatter, invite.lastSentAt)}</td>
                    <td data-label="Expires">{formatDateTime(dateFormatter, invite.expiresAt)}</td>
                    <td className="admin-table__actions">
                      <div className="admin-management__invite-actions">
                        <button
                          type="button"
                          className="admin-button admin-button--ghost"
                          onClick={() => void handleResendInvite(invite)}
                          disabled={
                            invite.status !== 'pending' && invite.status !== 'sent' ? true : mutatingInviteId === invite.id || isLoading
                          }
                        >
                          Resend
                        </button>
                        <button
                          type="button"
                          className="admin-button admin-button--danger"
                          onClick={() => void handleRevokeInvite(invite)}
                          disabled={
                            invite.status === 'accepted' || invite.status === 'revoked' ? true : mutatingInviteId === invite.id || isLoading
                          }
                        >
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
