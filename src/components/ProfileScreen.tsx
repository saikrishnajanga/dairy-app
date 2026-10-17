import { useState } from 'react';
import type { Profile } from '../services/profiles';
import type { AuthAccount } from '../services/auth';
import { updateAccountPassword } from '../services/auth';
import { PALETTES, type PaletteId } from '../App';
import { exportAllData } from '../services/storage';
import ConfirmDialog from './ConfirmDialog';
import PrivacyScreen from './PrivacyScreen';
import { hapticTap } from '../services/utils';

interface Props {
  profile: Profile | null;
  authAccount: AuthAccount | null;
  theme: 'dark' | 'light';
  palette: PaletteId;
  onThemeToggle: () => void;
  onPaletteChange: (p: PaletteId) => void;
  onSignOut: () => void;
  onBack: () => void;
  showToast: (msg: string) => void;
  onSwitchProfile?: () => void;
  onOpenAuthModal?: () => void;
}

export default function ProfileScreen({
  profile,
  authAccount,
  theme,
  palette,
  onThemeToggle,
  onPaletteChange,
  onSignOut,
  onBack,
  showToast,
  onSwitchProfile,
  onOpenAuthModal,
}: Props) {
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [showPrivacySettings, setShowPrivacySettings] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showConfirmSignOut, setShowConfirmSignOut] = useState(false);

  const displayName = authAccount?.name || profile?.name || 'Saikrishna';
  const displayEmail = authAccount?.email || profile?.email || 'saikrishna@example.com';
  const provider = authAccount?.provider || profile?.provider || 'local';
  const isVerified = authAccount?.isEmailConfirmed ?? true;

  const handleBackupExport = () => {
    hapticTap();
    try {
      const json = exportAllData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `voicediary_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('💾 Complete backup downloaded!');
    } catch {
      showToast('Backup export failed');
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
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
      showToast('🛡️ Account password updated successfully');
      setShowPasswordChange(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update password');
    } finally {
      setBusy(false);
    }
  };

  if (showPrivacySettings) {
    return (
      <PrivacyScreen
        onBack={() => setShowPrivacySettings(false)}
        showToast={showToast}
      />
    );
  }

  return (
    <div className="tab-content profile-screen">
      {/* Header */}
      <div className="profile-header-banner">
        <button type="button" className="action-btn back-btn" onClick={onBack}>
          ← Back
        </button>
        <h2 className="profile-screen-title">Account & Settings</h2>
      </div>

      <div className="profile-content-container">
        {/* User Card */}
        <div className="profile-user-card">
          <div className="profile-avatar-large">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="profile-user-details">
            <h3 className="profile-display-name">{displayName}</h3>
            <p className="profile-email-text">{displayEmail}</p>

            <div className="profile-badges-row">
              <span className={`provider-badge ${provider}`}>
                {provider === 'google' && '☁️ Google Account'}
                {provider === 'email' && '✉️ Email Account'}
                {provider === 'local' && '📱 On-Device Profile'}
              </span>

              {provider !== 'local' && (
                <span className={`verified-badge ${isVerified ? 'verified' : 'unverified'}`}>
                  {isVerified ? '✓ Verified' : '⏳ Pending Verification'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Cloud Sign In Banner when unauthenticated */}
        {!authAccount && onOpenAuthModal && (
          <div
            className="profile-section-card"
            style={{
              background: 'linear-gradient(135deg, rgba(66, 133, 244, 0.12), rgba(16, 185, 129, 0.12))',
              border: '1.5px solid rgba(66, 133, 244, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h4 className="profile-card-title" style={{ color: 'var(--text)', margin: '0 0 4px' }}>
                ☁️ Sign In with Google or Email
              </h4>
              <p className="profile-card-desc" style={{ margin: 0 }}>
                Enable automatic cloud backup and sync all your journal notes across phone & laptop.
              </p>
            </div>
            <button
              type="button"
              className="action-btn primary"
              onClick={onOpenAuthModal}
              style={{
                padding: '8px 18px',
                fontWeight: 700,
                fontSize: '13px',
                borderRadius: '24px',
                whiteSpace: 'nowrap',
              }}
            >
              🔑 Sign In / Sign Up
            </button>
          </div>
        )}

        {/* Theme and Palette Customization */}
        <div className="profile-section-card">
          <h4 className="profile-card-title">🎨 Appearance & Atmosphere</h4>
          <p className="profile-card-desc">
            Personalize your journal ambiance. Themes update the entire app instantly.
          </p>

          <div className="appearance-controls-group">
            <div className="appearance-toggle-row">
              <div>
                <span className="appearance-label">Theme Mode</span>
                <p className="appearance-sublabel">
                  {theme === 'dark' ? 'Dark Cosmos (OLED friendly)' : 'Warm Daylight Paper'}
                </p>
              </div>
              <button
                type="button"
                className="action-btn theme-toggle-btn"
                onClick={onThemeToggle}
              >
                {theme === 'dark' ? '☀️ Switch to Light' : '🌙 Switch to Dark'}
              </button>
            </div>

            <div className="palette-selection-row">
              <span className="appearance-label">Cozy Color Accents</span>
              <div className="palette-chips-grid">
                {PALETTES.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className={`palette-chip-btn ${palette === p.id ? 'active' : ''}`}
                    onClick={() => { hapticTap(); onPaletteChange(p.id); }}
                    title={p.desc}
                  >
                    <span className="palette-swatch-dot" style={{ backgroundColor: p.swatch }} />
                    <span className="palette-label-text">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Account Security & Password */}
        <div className="profile-section-card">
          <h4 className="profile-card-title">🛡️ Security & Privacy</h4>
          <p className="profile-card-desc">
            Manage your credentials and encryption vault settings.
          </p>

          <div className="security-actions-list">
            {provider === 'email' && (
              <button
                type="button"
                className="action-btn-row"
                onClick={() => setShowPasswordChange(!showPasswordChange)}
              >
                <span>🔑 Change Account Password</span>
                <span>{showPasswordChange ? '▲' : '▼'}</span>
              </button>
            )}

            {showPasswordChange && (
              <form onSubmit={handlePasswordChange} className="password-change-form">
                {error && <div className="auth-alert error"><span>⚠️ {error}</span></div>}
                <input
                  type="password"
                  className="lock-input"
                  placeholder="New Password (min 6 chars)"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                />
                <input
                  type="password"
                  className="lock-input"
                  placeholder="Confirm New Password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                />
                <button type="submit" className="action-btn primary" disabled={busy}>
                  {busy ? 'Updating…' : 'Update Password'}
                </button>
              </form>
            )}

            <button
              type="button"
              className="action-btn-row"
              onClick={() => setShowPrivacySettings(true)}
            >
              <span>🔒 App Lock & PIN Security Settings</span>
              <span>⚙️</span>
            </button>

            <button
              type="button"
              className="action-btn-row"
              onClick={handleBackupExport}
            >
              <span>💾 Export Full Diary Data Backup (JSON)</span>
              <span>⬇️</span>
            </button>

            {onSwitchProfile && (
              <button
                type="button"
                className="action-btn-row"
                onClick={onSwitchProfile}
              >
                <span>👥 Switch / Manage Local Profiles</span>
                <span>⇄</span>
              </button>
            )}
          </div>
        </div>

        {/* Sign Out Action */}
        <div className="profile-signout-card">
          <button
            type="button"
            className="action-btn danger signout-full-btn"
            onClick={() => setShowConfirmSignOut(true)}
          >
            🚪 Sign Out of Account
          </button>
        </div>
      </div>

      {showConfirmSignOut && (
        <ConfirmDialog
          title="Sign Out?"
          message="Your synced entries will remain safe in your cloud account. You can sign in again anytime."
          confirmLabel="Sign Out"
          onConfirm={() => {
            setShowConfirmSignOut(false);
            onSignOut();
          }}
          onCancel={() => setShowConfirmSignOut(false)}
        />
      )}
    </div>
  );
}
