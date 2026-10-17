import { useState } from 'react';
import type { Profile } from '../services/profiles';
import {
  updateProfile,
  changeProfilePassword,
  removeProfilePin,
  verifyProfilePin,
  createProfile,
  getActiveProfile,
} from '../services/profiles';
import type { AuthAccount } from '../services/auth';
import {
  updateAccountPassword,
  updateAccountProfile,
  sendPasswordResetEmail,
} from '../services/auth';
import { PALETTES, type PaletteId } from '../App';
import { exportAllData } from '../services/storage';
import { saveOrShareFile } from '../services/docExport';
import ConfirmDialog from './ConfirmDialog';
import PrivacyScreen from './PrivacyScreen';
import { hapticTap } from '../services/utils';
import { TrashIcon, EditIcon, DownloadIcon } from './Icons';

const AVATAR_OPTIONS = [
  '👑', '⚡', '🦁', '🌸', '🚀', '🎨', '🕶️', '💎',
  '🌟', '☕', '✨', '🐱', '🎧', '💼', '🧘', '🦄',
];

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
  onNavigateToTrash?: () => void;
  onProfileUpdate?: (updatedProfile?: Profile | null, updatedAccount?: AuthAccount | null) => void;
}

function isImageUrl(val?: string | null): boolean {
  if (!val) return false;
  return (
    val.startsWith('http://') ||
    val.startsWith('https://') ||
    val.startsWith('data:image/') ||
    val.startsWith('blob:')
  );
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
  onNavigateToTrash,
  onProfileUpdate,
}: Props) {
  // Navigation / sub-screen states
  const [showPrivacySettings, setShowPrivacySettings] = useState(false);
  const [showConfirmSignOut, setShowConfirmSignOut] = useState(false);

  // Profile Edit State
  const initialName = authAccount?.name || profile?.name || 'Saikrishna';
  const initialEmail = authAccount?.email || profile?.email || '';
  const initialAvatar = authAccount?.avatarUrl || profile?.avatarUrl || '';

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(initialName);
  const [editEmail, setEditEmail] = useState(initialEmail);
  const [editAvatar, setEditAvatar] = useState(initialAvatar);
  const [profileSaving, setProfileSaving] = useState(false);

  // Password / Security State
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passBusy, setPassBusy] = useState(false);
  const [passError, setPassError] = useState('');
  const [passSuccess, setPassSuccess] = useState('');
  const [resetEmailSending, setResetEmailSending] = useState(false);

  const displayName = authAccount?.name || profile?.name || 'Saikrishna';
  const displayEmail = authAccount?.email || profile?.email || 'saikrishna@example.com';
  const provider = authAccount?.provider || profile?.provider || 'local';
  const isVerified = authAccount?.isEmailConfirmed ?? true;
  const isCloudAccount = Boolean(authAccount?.email);
  const hasLocalPin = Boolean(profile?.pinHash);

  // Active avatar source
  const activeAvatarSrc = authAccount?.avatarUrl || profile?.avatarUrl || '';

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { label: '', level: '' };
    if (pass.length < 6) return { label: 'Too short (min 6 chars)', level: 'weak' };
    const hasNum = /\d/.test(pass);
    const hasLetter = /[a-zA-Z]/.test(pass);
    const hasSpecial = /[^a-zA-Z0-9]/.test(pass);
    if (pass.length >= 8 && hasNum && hasLetter && hasSpecial) {
      return { label: 'Strong & Secure', level: 'strong' };
    }
    if (pass.length >= 6 && hasNum && hasLetter) {
      return { label: 'Good Password', level: 'fair' };
    }
    return { label: 'Fair', level: 'fair' };
  };

  const passwordStrength = getPasswordStrength(newPassword);

  // Save profile changes (Name, Email, Avatar)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      showToast('⚠️ Name cannot be empty');
      return;
    }

    setProfileSaving(true);
    hapticTap();
    try {
      let updatedProf = profile;
      let updatedAcc = authAccount;

      // 1. Update local profile
      if (profile) {
        updateProfile(profile.id, {
          name: editName.trim(),
          email: editEmail.trim() || undefined,
          avatarUrl: editAvatar || undefined,
        });
        updatedProf = {
          ...profile,
          name: editName.trim(),
          email: editEmail.trim() || undefined,
          avatarUrl: editAvatar || undefined,
        };
      } else {
        const created = await createProfile(editName.trim());
        updateProfile(created.id, {
          email: editEmail.trim() || undefined,
          avatarUrl: editAvatar || undefined,
        });
        updatedProf = {
          ...created,
          email: editEmail.trim() || undefined,
          avatarUrl: editAvatar || undefined,
        };
      }

      // 2. If signed in with cloud account, update metadata
      if (authAccount) {
        try {
          const cloudUpdated = await updateAccountProfile({
            name: editName.trim(),
            avatarUrl: editAvatar || undefined,
          });
          if (cloudUpdated) {
            updatedAcc = cloudUpdated;
          }
        } catch (cloudErr) {
          console.warn('Cloud profile update skipped:', cloudErr);
        }
      }

      onProfileUpdate?.(updatedProf, updatedAcc);
      setIsEditingProfile(false);
      showToast('👤 Profile updated successfully!');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  // Password update form submit
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError('');
    setPassSuccess('');

    const minLen = isCloudAccount ? 6 : 4;
    if (newPassword.length < minLen) {
      setPassError(`Password must be at least ${minLen} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError('Passwords do not match.');
      return;
    }

    setPassBusy(true);
    hapticTap();

    try {
      if (isCloudAccount) {
        // Cloud account password update via Supabase
        await updateAccountPassword(newPassword);
        const msg = `🎉 Password set successfully! You can now log in using ${authAccount?.email} and your new password on any device.`;
        setPassSuccess(msg);
        showToast('🛡️ Account password updated successfully!');
      } else {
        // Local profile PIN update
        let targetId = profile?.id;
        if (!targetId) {
          const fresh = await createProfile(displayName);
          targetId = fresh.id;
        }

        await changeProfilePassword(targetId, newPassword, currentPassword || undefined);
        const refreshed = getActiveProfile();
        onProfileUpdate?.(refreshed, authAccount);

        setPassSuccess('🔒 Profile password/PIN updated successfully!');
        showToast('🔒 Profile password/PIN updated successfully!');
      }

      setNewPassword('');
      setConfirmPassword('');
      setCurrentPassword('');
    } catch (err: unknown) {
      setPassError(err instanceof Error ? err.message : 'Could not update password');
    } finally {
      setPassBusy(false);
    }
  };

  // Remove local profile PIN protection
  const handleRemoveLocalPin = async () => {
    if (!profile) return;
    setPassError('');
    setPassSuccess('');

    if (hasLocalPin && currentPassword) {
      const ok = await verifyProfilePin(profile.id, currentPassword);
      if (!ok) {
        setPassError('Current PIN is incorrect.');
        return;
      }
    }

    hapticTap();
    removeProfilePin(profile.id);
    const refreshed = getActiveProfile();
    onProfileUpdate?.(refreshed, authAccount);
    setCurrentPassword('');
    setPassSuccess('🔓 Password/PIN protection removed.');
    showToast('🔓 Password protection removed');
  };

  // Send password reset email
  const handleSendResetEmail = async () => {
    const targetEmail = authAccount?.email || displayEmail;
    if (!targetEmail) return;
    setResetEmailSending(true);
    setPassError('');
    hapticTap();
    try {
      await sendPasswordResetEmail(targetEmail);
      setPassSuccess(`📧 Password reset link sent to ${targetEmail}. Check your inbox!`);
      showToast(`📧 Reset link sent to ${targetEmail}`);
    } catch (err: unknown) {
      setPassError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setResetEmailSending(false);
    }
  };

  // Export full JSON backup (works on mobile & web)
  const handleBackupExport = async () => {
    hapticTap();
    try {
      const json = exportAllData();
      const bytes = new TextEncoder().encode(json);
      const filename = `voicediary_backup_${new Date().toISOString().slice(0, 10)}.json`;
      await saveOrShareFile({
        filename,
        bytes,
        mime: 'application/json',
        title: 'VoiceDiary Pro Backup',
        dialogTitle: 'Save VoiceDiary Backup',
      });
      showToast('💾 Backup exported successfully!');
    } catch {
      showToast('Backup export failed');
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
        {/* User Profile Card */}
        <div className="profile-user-card" style={{ position: 'relative' }}>
          {/* Avatar Container: NEVER render raw image URL as text */}
          <div className="profile-avatar-large">
            {isImageUrl(activeAvatarSrc) ? (
              <img
                src={activeAvatarSrc}
                alt={displayName}
                className="profile-avatar-large-img"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : activeAvatarSrc && !activeAvatarSrc.includes('/') && activeAvatarSrc.length <= 4 ? (
              <span style={{ fontSize: '32px' }}>{activeAvatarSrc}</span>
            ) : (
              <span>{displayName.trim().charAt(0).toUpperCase()}</span>
            )}
          </div>

          <div className="profile-user-details" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <h3 className="profile-display-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </h3>
              <button
                type="button"
                className="profile-edit-trigger-btn"
                onClick={() => {
                  hapticTap();
                  setIsEditingProfile(!isEditingProfile);
                  setEditName(displayName);
                  setEditEmail(displayEmail);
                  setEditAvatar(activeAvatarSrc);
                }}
              >
                {isEditingProfile ? '✕ Cancel' : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <EditIcon size={14} />
                    <span>Edit Profile</span>
                  </span>
                )}
              </button>
            </div>

            <p className="profile-email-text" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayEmail || 'No email associated'}
            </p>

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

              {hasLocalPin && (
                <span className="security-mode-badge local">
                  🔒 PIN Protected
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Inline Profile Editor */}
        {isEditingProfile && (
          <form onSubmit={handleSaveProfile} className="profile-edit-card">
            <h4 className="profile-card-title" style={{ margin: 0 }}>
              ✏️ Edit Profile Details
            </h4>
            <p className="profile-card-desc" style={{ margin: 0 }}>
              Update your display name, email, and choose a personal avatar icon.
            </p>

            {/* Avatar Picker */}
            <div className="avatar-selector-wrap">
              <span className="profile-input-label">Choose Avatar Icon</span>
              <div className="avatar-options-grid">
                {AVATAR_OPTIONS.map(em => (
                  <button
                    key={em}
                    type="button"
                    className={`avatar-option-btn ${editAvatar === em ? 'selected' : ''}`}
                    onClick={() => {
                      hapticTap();
                      setEditAvatar(em);
                    }}
                  >
                    {em}
                  </button>
                ))}
                {editAvatar && (
                  <button
                    type="button"
                    className="avatar-option-btn"
                    title="Use Initial Letter"
                    onClick={() => {
                      hapticTap();
                      setEditAvatar('');
                    }}
                    style={{ fontSize: '13px', fontWeight: 800 }}
                  >
                    ABC
                  </button>
                )}
              </div>
            </div>

            {/* Display Name Input */}
            <div className="profile-input-group">
              <label className="profile-input-label">Display Name</label>
              <input
                type="text"
                className="profile-text-input"
                placeholder="Your Name (e.g. Saikrishna)"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                required
              />
            </div>

            {/* Email Input */}
            <div className="profile-input-group">
              <label className="profile-input-label">Email Address</label>
              <input
                type="email"
                className="profile-text-input"
                placeholder="name@example.com"
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
              />
            </div>

            <div className="profile-form-actions">
              <button
                type="submit"
                className="action-btn primary"
                disabled={profileSaving}
                style={{ padding: '9px 20px', borderRadius: '20px', fontWeight: 700 }}
              >
                {profileSaving ? 'Saving…' : '✓ Save Profile Changes'}
              </button>
              <button
                type="button"
                className="action-btn"
                onClick={() => setIsEditingProfile(false)}
                style={{ padding: '9px 16px', borderRadius: '20px' }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

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

        {/* Change Password & Security Section */}
        <div className="profile-section-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h4 className="profile-card-title">🔑 Change Password & Security</h4>
              <p className="profile-card-desc">
                {isCloudAccount
                  ? `Set or update password for ${authAccount?.email} to log in with Email & Password.`
                  : 'Set or update your personal diary password / lock PIN.'}
              </p>
            </div>
            <span className={`security-mode-badge ${isCloudAccount ? 'cloud' : 'local'}`}>
              {isCloudAccount ? '☁️ Cloud Account' : hasLocalPin ? '🔒 PIN Active' : '🔓 Unlocked'}
            </span>
          </div>

          <div className="security-actions-list">
            {/* Change Password Dropdown Button */}
            <button
              type="button"
              className="action-btn-row"
              onClick={() => {
                hapticTap();
                setShowPasswordChange(!showPasswordChange);
                setPassError('');
                setPassSuccess('');
              }}
              style={{
                borderColor: showPasswordChange ? 'var(--primary)' : undefined,
                background: showPasswordChange ? 'var(--surface-hover)' : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '17px' }}>🔑</span>
                <span style={{ fontWeight: 700 }}>
                  {isCloudAccount
                    ? 'Set / Change Email Account Password'
                    : hasLocalPin
                    ? 'Change Profile Password / PIN'
                    : 'Set Profile Password / PIN'}
                </span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {showPasswordChange ? '▲ Close' : '▼ Expand'}
              </span>
            </button>

            {/* Expandable Password Form */}
            {showPasswordChange && (
              <form onSubmit={handlePasswordChange} className="password-change-form">
                {/* Informative message for Google-signed in users */}
                {isCloudAccount && (
                  <div
                    style={{
                      padding: '10px 14px',
                      background: 'rgba(59, 130, 246, 0.08)',
                      borderRadius: '8px',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      fontSize: '12.5px',
                      color: 'var(--text)',
                      lineHeight: '1.5',
                    }}
                  >
                    💡 <strong>Email & Password Login:</strong> You are currently signed in with{' '}
                    <strong>{authAccount?.email}</strong> via {provider === 'google' ? 'Google' : 'Email'}.
                    By setting a password below, you can sign in anytime using either Google or with your Email (
                    <code>{authAccount?.email}</code>) and this password!
                  </div>
                )}

                {passError && (
                  <div className="auth-alert error" style={{ padding: '10px 12px', fontSize: '13px' }}>
                    <span>⚠️ {passError}</span>
                  </div>
                )}
                {passSuccess && (
                  <div
                    className="auth-alert success"
                    style={{
                      padding: '12px 14px',
                      fontSize: '13px',
                      background: 'rgba(16, 185, 129, 0.12)',
                      color: '#10b981',
                      border: '1px solid #10b981',
                      borderRadius: '8px',
                      lineHeight: '1.5',
                    }}
                  >
                    <span>{passSuccess}</span>
                  </div>
                )}

                {/* Current PIN/Password if local profile has PIN */}
                {hasLocalPin && !isCloudAccount && (
                  <div className="profile-input-group">
                    <label className="profile-input-label">Current PIN / Password</label>
                    <div className="password-input-row">
                      <input
                        type={showCurrentPass ? 'text' : 'password'}
                        className="profile-text-input"
                        placeholder="Enter current PIN"
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        className="password-eye-btn"
                        onClick={() => setShowCurrentPass(!showCurrentPass)}
                        title={showCurrentPass ? 'Hide password' : 'Show password'}
                      >
                        {showCurrentPass ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>
                )}

                {/* New Password Input */}
                <div className="profile-input-group">
                  <label className="profile-input-label">
                    {isCloudAccount ? 'New Password (min 6 characters)' : 'New PIN / Password (min 4 characters)'}
                  </label>
                  <div className="password-input-row">
                    <input
                      type={showNewPass ? 'text' : 'password'}
                      className="profile-text-input"
                      placeholder={isCloudAccount ? 'Enter at least 6 characters' : 'Enter 4+ digits or characters'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="password-eye-btn"
                      onClick={() => setShowNewPass(!showNewPass)}
                      title={showNewPass ? 'Hide password' : 'Show password'}
                    >
                      {showNewPass ? '🙈' : '👁️'}
                    </button>
                  </div>

                  {newPassword && (
                    <div className="password-strength-indicator">
                      <div className="password-strength-bar">
                        <div className={`password-strength-fill ${passwordStrength.level}`} />
                      </div>
                      <span>{passwordStrength.label}</span>
                    </div>
                  )}
                </div>

                {/* Confirm New Password Input */}
                <div className="profile-input-group">
                  <label className="profile-input-label">Confirm New Password</label>
                  <div className="password-input-row">
                    <input
                      type={showConfirmPass ? 'text' : 'password'}
                      className="profile-text-input"
                      placeholder="Re-enter new password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="password-eye-btn"
                      onClick={() => setShowConfirmPass(!showConfirmPass)}
                      title={showConfirmPass ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPass ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                <div className="profile-form-actions">
                  <button
                    type="submit"
                    className="action-btn primary"
                    disabled={passBusy}
                    style={{ padding: '10px 22px', borderRadius: '20px', fontWeight: 700 }}
                  >
                    {passBusy ? 'Updating…' : isCloudAccount ? '✓ Set Account Password' : '✓ Update Password'}
                  </button>

                  {/* Remove PIN button for local profiles */}
                  {hasLocalPin && !isCloudAccount && (
                    <button
                      type="button"
                      className="action-btn"
                      onClick={handleRemoveLocalPin}
                      style={{ padding: '9px 16px', borderRadius: '20px', color: 'var(--danger)' }}
                    >
                      🔓 Remove Password Lock
                    </button>
                  )}

                  {/* Forgot Password Reset Email for Cloud accounts */}
                  {isCloudAccount && (
                    <button
                      type="button"
                      className="action-btn"
                      onClick={handleSendResetEmail}
                      disabled={resetEmailSending}
                      style={{ padding: '9px 16px', borderRadius: '20px' }}
                    >
                      {resetEmailSending ? 'Sending Link…' : '📧 Email Me Reset Link'}
                    </button>
                  )}
                </div>
              </form>
            )}

            {/* App Lock & Master PIN */}
            <button
              type="button"
              className="action-btn-row"
              onClick={() => {
                hapticTap();
                setShowPrivacySettings(true);
              }}
            >
              <span>🔒 App Lock & Master PIN Settings</span>
              <span>⚙️</span>
            </button>

            {/* Full Diary Backup Export */}
            <button
              type="button"
              className="action-btn-row"
              onClick={handleBackupExport}
            >
              <span>💾 Export Full Diary Data Backup (JSON)</span>
              <DownloadIcon size={16} />
            </button>

            {/* Recycle Bin / Trash (30-Day Recovery) */}
            {onNavigateToTrash && (
              <button
                type="button"
                className="action-btn-row"
                onClick={() => {
                  hapticTap();
                  onNavigateToTrash();
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <TrashIcon size={16} color="var(--danger)" />
                  <span>Recycle Bin (Recover Deleted Items)</span>
                </span>
                <span>→</span>
              </button>
            )}

            {/* Profile Switcher */}
            {onSwitchProfile && (
              <button
                type="button"
                className="action-btn-row"
                onClick={() => {
                  hapticTap();
                  onSwitchProfile();
                }}
              >
                <span>👥 Switch / Manage On-Device Profiles</span>
                <span>⇄</span>
              </button>
            )}
          </div>
        </div>

        {/* Theme and Atmosphere Customization */}
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
                onClick={() => {
                  hapticTap();
                  onThemeToggle();
                }}
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
                    onClick={() => {
                      hapticTap();
                      onPaletteChange(p.id);
                    }}
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

        {/* Sign Out Action */}
        <div className="profile-signout-card">
          <button
            type="button"
            className="action-btn danger signout-full-btn"
            onClick={() => {
              hapticTap();
              setShowConfirmSignOut(true);
            }}
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
