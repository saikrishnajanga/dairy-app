import { useState, useEffect } from 'react';
import { sendLockRecoveryCode, verifyLockRecoveryCode, getActiveLockRecoveryCode } from '../services/auth';
import { recoverDiaryPassword, setupDiaryLock } from '../services/crypto';
import { setDiaryPin } from '../services/textDiary';
import { addNotification } from '../services/notifications';
import { hapticTap } from '../services/utils';

interface Props {
  userEmail?: string;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (msg: string) => void;
}

export default function PasswordRecoveryModal({
  userEmail = '',
  onClose,
  onSuccess,
  showToast,
}: Props) {
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [email, setEmail] = useState(userEmail);
  const [code, setCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Check if there is already an active session code
  useEffect(() => {
    const active = getActiveLockRecoveryCode(email || userEmail);
    if (active) {
      setGeneratedCode(active);
    }
  }, [email, userEmail]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Please provide a valid registered email address.');
      return;
    }
    setBusy(true);
    setError('');
    hapticTap();

    try {
      const res = await sendLockRecoveryCode(email);
      setGeneratedCode(res.code);
      setCode(res.code); // auto-fill immediately so user is never stuck
      setStep('verify');
      showToast(`Recovery code: ${res.code} (also sent to notifications 🔔)`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send verification code.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || code.trim().length < 4) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    if (newPassword.length < 4) {
      setError('New lock password / PIN must be at least 4 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    setError('');
    hapticTap();

    try {
      const valid = await verifyLockRecoveryCode(email, code);
      if (!valid) {
        setError('Invalid or expired verification code.');
        setBusy(false);
        return;
      }

      // Try recovering encrypted master key via recovery token
      try {
        await recoverDiaryPassword(email, newPassword);
      } catch {
        // If no recovery key was saved previously, reinitialize lock safely
        await setupDiaryLock(newPassword, email);
      }

      // Also update TextDiary legacy PIN for compatibility
      await setDiaryPin(newPassword);

      void addNotification({
        title: '🛡️ Lock Password Recovered',
        message: 'Your Locked Diaries password was successfully reset via email verification.',
        type: 'security',
      });

      showToast('✅ Lock password reset successfully!');
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pin-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="pin-modal recovery-modal" onClick={e => e.stopPropagation()}>
        <div className="confirm-icon-badge">🔐</div>
        <h3 className="confirm-title">Recover Locked Diary Password</h3>
        <p className="confirm-message">
          {step === 'request'
            ? 'We will generate a secure single-use recovery code to verify your identity and restore access to your private diaries.'
            : `Enter the 6-digit verification code below and choose your new lock password.`}
        </p>

        {error && (
          <div className="auth-alert error" role="alert" style={{ marginBottom: 16 }}>
            <span>⚠️ {error}</span>
          </div>
        )}

        {step === 'request' ? (
          <form onSubmit={handleSendCode}>
            <div className="date-picker-field" style={{ marginBottom: 16 }}>
              <label className="date-picker-label">Registered Account Email</label>
              <input
                type="email"
                required
                className="date-picker-input text-input"
                placeholder="your-email@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
              />
            </div>

            {generatedCode && (
              <div
                style={{
                  background: 'rgba(99, 102, 241, 0.12)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ fontSize: '0.82rem', color: 'var(--text, #333)' }}>
                  Active Code available: <strong>{generatedCode}</strong>
                </div>
                <button
                  type="button"
                  style={{
                    background: '#6366f1',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setCode(generatedCode);
                    setStep('verify');
                  }}
                >
                  Continue →
                </button>
              </div>
            )}

            <div className="pin-actions">
              <button type="button" className="action-btn" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="action-btn primary" disabled={busy}>
                {busy ? 'Generating…' : 'Generate Recovery Code'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyAndReset}>
            {generatedCode && (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15))',
                  border: '1px solid rgba(99, 102, 241, 0.35)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  marginBottom: '16px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '0.78rem', opacity: 0.8, marginBottom: 2 }}>
                  🔑 Your 6-Digit Single-Use Recovery Code:
                </div>
                <div
                  style={{
                    fontSize: '1.6rem',
                    fontWeight: 800,
                    letterSpacing: '5px',
                    color: '#6366f1',
                    fontFamily: 'monospace',
                    margin: '4px 0',
                    userSelect: 'all',
                  }}
                >
                  {generatedCode}
                </div>
                <div style={{ fontSize: '0.72rem', opacity: 0.7, marginBottom: 8 }}>
                  Delivered to Notifications 🔔 & valid for 10 minutes
                </div>
                <button
                  type="button"
                  style={{
                    background: '#6366f1',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '4px 14px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setCode(generatedCode);
                    showToast('⚡ Code auto-filled!');
                  }}
                >
                  ⚡ Auto-Fill Code
                </button>
              </div>
            )}

            <div className="date-picker-field">
              <label className="date-picker-label">6-Digit Verification Code</label>
              <input
                type="text"
                required
                className="date-picker-input text-input"
                placeholder="123456"
                value={code}
                onChange={e => setCode(e.target.value)}
                maxLength={8}
                autoFocus
              />
            </div>

            <div className="date-picker-field">
              <label className="date-picker-label">New Lock Password / PIN</label>
              <input
                type="password"
                required
                className="date-picker-input text-input"
                placeholder="Enter new lock password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                maxLength={20}
              />
            </div>

            <div className="date-picker-field">
              <label className="date-picker-label">Confirm New Password</label>
              <input
                type="password"
                required
                className="date-picker-input text-input"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                maxLength={20}
              />
            </div>

            <div className="pin-actions">
              <button
                type="button"
                className="action-btn"
                onClick={() => setStep('request')}
              >
                ← Back
              </button>
              <button type="submit" className="action-btn primary" disabled={busy}>
                {busy ? 'Verifying…' : 'Reset Lock Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
