import { useState } from 'react';
import { updateAccountPassword } from '../services/auth';
import { hapticTap } from '../services/utils';

interface Props {
  email?: string;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (msg: string) => void;
}

export default function ResetPasswordModal({
  email = '',
  onClose,
  onSuccess,
  showToast,
}: Props) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const calculateStrength = (pass: string) => {
    if (!pass) return 0;
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 10) score += 1;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    return score;
  };

  const strength = calculateStrength(newPassword);

  const getStrengthLabel = (score: number) => {
    if (score <= 1) return { label: 'Weak', color: '#ef4444' };
    if (score <= 3) return { label: 'Moderate', color: '#f59e0b' };
    return { label: 'Strong', color: '#10b981' };
  };

  const strengthInfo = getStrengthLabel(strength);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    hapticTap();

    try {
      await updateAccountPassword(newPassword);
      // Clean up recovery fragments from URL so refreshing won't re-trigger
      try {
        window.history.replaceState(null, '', window.location.pathname);
      } catch { /* ignore */ }

      showToast('🎉 Account password updated successfully!');
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update password. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pin-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="pin-modal recovery-modal" onClick={e => e.stopPropagation()}>
        <div className="confirm-icon-badge">🔑</div>
        <h3 className="confirm-title">Set New Account Password</h3>
        <p className="confirm-message">
          {email
            ? `Your password reset request for ${email} has been verified. Enter your new password below.`
            : 'Your password reset link has been verified! Choose a new password to secure your account.'}
        </p>

        {error && (
          <div className="auth-alert error" role="alert" style={{ marginBottom: 16 }}>
            <span>⚠️ {error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="date-picker-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="date-picker-label">New Password</label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '0.8rem',
                  color: 'var(--accent, #6366f1)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {showPassword ? 'Hide 🙈' : 'Show 👁️'}
              </button>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              className="date-picker-input text-input"
              placeholder="Minimum 6 characters"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              minLength={6}
              autoFocus
            />
          </div>

          {newPassword && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 4 }}>
                <span style={{ color: 'var(--text-muted, #94a3b8)' }}>Strength:</span>
                <span style={{ color: strengthInfo.color, fontWeight: 600 }}>{strengthInfo.label}</span>
              </div>
              <div style={{ height: 4, width: '100%', background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${(strength / 5) * 100}%`,
                    background: strengthInfo.color,
                    transition: 'all 0.3s ease',
                  }}
                />
              </div>
            </div>
          )}

          <div className="date-picker-field" style={{ marginBottom: 20 }}>
            <label className="date-picker-label">Confirm New Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              className="date-picker-input text-input"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              minLength={6}
            />
          </div>

          <div className="pin-actions">
            <button type="button" className="action-btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="action-btn primary" disabled={busy}>
              {busy ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
