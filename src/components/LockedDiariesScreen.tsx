import { useState, useEffect, useCallback } from 'react';
import {
  getLockedTextEntries,
  createTextEntry,
  type TextDiaryEntry,
} from '../services/textDiary';
import {
  isLockedSessionActive,
  unlockDiarySession,
  setupDiaryLock,
  hasDiaryLockSet,
  lockSession,
  touchLockedSession,
} from '../services/crypto';
import { verifyPin, setDiaryPin, hasPinSet } from '../services/textDiary';
import PasswordRecoveryModal from './PasswordRecoveryModal';
import FullScreenEditor from './FullScreenEditor';
import { hapticTap } from '../services/utils';

interface Props {
  userEmail?: string;
  onOpenEditor: (entry: TextDiaryEntry) => void;
  showToast: (msg: string) => void;
}

export default function LockedDiariesScreen({
  userEmail = '',
  onOpenEditor,
  showToast,
}: Props) {
  const [unlocked, setUnlocked] = useState(() => isLockedSessionActive());
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [error, setError] = useState('');
  const [hasLock, setHasLock] = useState(() => hasDiaryLockSet() || hasPinSet());
  const [showSetup, setShowSetup] = useState(() => !hasLock);
  const [showRecovery, setShowRecovery] = useState(false);
  const [lockedEntries, setLockedEntries] = useState<TextDiaryEntry[]>([]);
  const [editingEntry, setEditingEntry] = useState<TextDiaryEntry | null>(null);

  // Load entries when unlocked
  const loadEntries = useCallback(() => {
    setLockedEntries(getLockedTextEntries());
  }, []);

  useEffect(() => {
    if (unlocked) {
      loadEntries();
    }
  }, [unlocked, loadEntries]);

  // Auto-lock when user switches away / page becomes hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && unlocked) {
        lockSession();
        setUnlocked(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [unlocked]);

  // Touch session on click to prevent timeout while active
  const handleUserActivity = () => {
    if (unlocked) touchLockedSession();
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    hapticTap();

    if (!passwordInput.trim()) {
      setError('Please enter your lock password or PIN');
      return;
    }

    // Try AES-GCM unlock first
    let ok = false;
    if (hasDiaryLockSet()) {
      ok = await unlockDiarySession(passwordInput);
    }
    // Fallback to legacy pin check
    if (!ok && hasPinSet()) {
      ok = await verifyPin(passwordInput);
      if (ok) {
        // Automatically upgrade to AES-GCM lock
        await setupDiaryLock(passwordInput, userEmail);
      }
    }

    if (ok) {
      setUnlocked(true);
      setPasswordInput('');
      setError('');
      showToast('🔓 Locked Diaries unlocked');
    } else {
      setError('Incorrect password or PIN. Try again.');
      setPasswordInput('');
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    hapticTap();

    if (passwordInput.length < 4) {
      setError('Password/PIN must be at least 4 characters');
      return;
    }
    if (passwordInput !== confirmInput) {
      setError('Passwords do not match');
      return;
    }

    try {
      await setupDiaryLock(passwordInput, userEmail);
      await setDiaryPin(passwordInput);
      setHasLock(true);
      setShowSetup(false);
      setUnlocked(true);
      setPasswordInput('');
      setConfirmInput('');
      showToast('🔒 Locked Diaries security initialized!');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    }
  };

  const handleCreateLockedEntry = () => {
    hapticTap();
    // Create new locked note
    const entry = createTextEntry('Private Thought', '');
    entry.locked = true;
    setEditingEntry(entry);
  };

  const handleLockNow = () => {
    hapticTap();
    lockSession();
    setUnlocked(false);
    showToast('🔒 Locked Diaries secured');
  };

  // If currently writing in full-screen editor
  if (editingEntry) {
    return (
      <FullScreenEditor
        entry={editingEntry}
        isLockedScreen={true}
        onBack={() => {
          setEditingEntry(null);
          loadEntries();
        }}
        onDelete={() => {
          setEditingEntry(null);
          loadEntries();
        }}
        showToast={showToast}
      />
    );
  }

  // If locked, show security gate
  if (!unlocked) {
    return (
      <div className="tab-content locked-diaries-gate">
        <div className="locked-gate-card">
          <div className="locked-gate-icon-orb">
            <span className="locked-orb-emoji">🔐</span>
          </div>

          <h2 className="locked-gate-title">
            {showSetup ? 'Set Up Locked Diaries' : 'Locked Diaries Vault'}
          </h2>
          <p className="locked-gate-desc">
            {showSetup
              ? 'Protect your most intimate voice thoughts and personal notes with client-side encryption.'
              : 'Enter your vault password or PIN to decrypt and access your private entries.'}
          </p>

          {error && (
            <div className="auth-alert error" role="alert">
              <span>⚠️ {error}</span>
            </div>
          )}

          {showSetup ? (
            <form onSubmit={handleSetup} className="locked-gate-form">
              <input
                type="password"
                className="lock-input"
                placeholder="Choose a password or PIN (min 4 chars)"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                autoFocus
              />
              <input
                type="password"
                className="lock-input"
                placeholder="Confirm password"
                value={confirmInput}
                onChange={e => setConfirmInput(e.target.value)}
              />
              <button type="submit" className="action-btn primary locked-gate-submit-btn">
                🛡️ Initialize Vault & Encrypt
              </button>
            </form>
          ) : (
            <form onSubmit={handleUnlock} className="locked-gate-form">
              <input
                type="password"
                className="lock-input"
                placeholder="Enter Vault Password or PIN"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                autoFocus
              />
              <button type="submit" className="action-btn primary locked-gate-submit-btn">
                🔓 Unlock Vault
              </button>

              <div className="locked-gate-recovery-box">
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => setShowRecovery(true)}
                >
                  Forgot Password? Recover via Email
                </button>
              </div>
            </form>
          )}
        </div>

        {showRecovery && (
          <PasswordRecoveryModal
            userEmail={userEmail}
            onClose={() => setShowRecovery(false)}
            onSuccess={() => {
              setShowRecovery(false);
              setUnlocked(true);
            }}
            showToast={showToast}
          />
        )}
      </div>
    );
  }

  // Unlocked Vault View
  return (
    <div className="tab-content locked-diaries-vault" onClick={handleUserActivity}>
      <div className="vault-header">
        <div className="vault-header-info">
          <div className="vault-badge">
            <span className="vault-dot" />
            <span>Vault Unlocked (Auto-locks in 5m)</span>
          </div>
          <h2 className="vault-title">🔒 Your Private Vault</h2>
          <p className="vault-subtitle">
            These entries are encrypted and invisible in public lists and search previews.
          </p>
        </div>

        <div className="vault-actions">
          <button
            type="button"
            className="action-btn primary"
            onClick={handleCreateLockedEntry}
          >
            ✍️ New Locked Note
          </button>
          <button
            type="button"
            className="action-btn"
            onClick={handleLockNow}
            title="Lock now"
          >
            🔒 Lock Vault
          </button>
        </div>
      </div>

      {lockedEntries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-emoji">🛡️</div>
          <div className="empty-title">No locked entries yet</div>
          <div className="empty-desc">
            Keep your personal confessions, secret notes, or sensitive thoughts here.
          </div>
          <button
            type="button"
            className="action-btn primary"
            onClick={handleCreateLockedEntry}
            style={{ marginTop: 16 }}
          >
            Create Your First Locked Entry
          </button>
        </div>
      ) : (
        <div className="diary-grid">
          {lockedEntries.map(entry => (
            <div
              key={entry.id}
              className="diary-entry-card locked-card"
              onClick={() => setEditingEntry(entry)}
            >
              <div className="entry-header">
                <span className="entry-date">
                  📅 {entry.entryDate || entry.date}
                </span>
                <span className="locked-pill-tag">🔒 Encrypted</span>
              </div>
              <h3 className="entry-title">{entry.title || 'Untitled Private Note'}</h3>
              <p className="entry-preview">
                {entry.content.replace(/<[^>]*>/g, '').slice(0, 100) || 'Click to view note…'}
              </p>
              <div className="entry-footer">
                <span className="entry-time">{entry.time}</span>
                <span className="entry-open-hint">Tap to Open →</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
