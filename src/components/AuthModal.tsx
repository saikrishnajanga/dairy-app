import { useState } from 'react';
import {
  signInWithEmail,
  signUpWithEmail,
  sendPasswordResetEmail,
  signInWithGoogle,
  type AuthAccount,
} from '../services/auth';
import { getSupabase, isSupabaseConfigured } from '../services/supabase';
import { hapticTap } from '../services/utils';

interface Props {
  onSuccess: (account?: AuthAccount) => void;
  onContinueAsGuest: () => void;
}

type AuthMode = 'signin' | 'signup' | 'forgot';

export default function AuthModal({ onSuccess, onContinueAsGuest }: Props) {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [hasSentResetEmail, setHasSentResetEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const supabaseConfigured = isSupabaseConfigured();

  const handleGoogleSignIn = async () => {
    if (!supabaseConfigured) {
      setError('Cloud login is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.');
      return;
    }
    setGoogleBusy(true);
    setError('');
    hapticTap();
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!supabaseConfigured) {
      setError('Cloud backend not connected. You can continue as Guest locally!');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }

    if (mode === 'forgot') {
      if (!hasSentResetEmail) {
        setBusy(true);
        hapticTap();
        try {
          await sendPasswordResetEmail(email);
          setHasSentResetEmail(true);
          setMessage(`Reset code sent to ${email}. Check your email and enter the code below with your new password.`);
        } catch (err: unknown) {
          const rawMsg = err instanceof Error ? err.message : String(err);
          if (rawMsg.toLowerCase().includes('rate limit')) {
            setError('Email rate limit reached (Supabase limits to ~3 emails/hr). If you received an email earlier, click "Already have a code" below to set your new password now!');
          } else {
            setError(rawMsg || 'Failed to send password reset email.');
          }
        } finally {
          setBusy(false);
        }
        return;
      } else {
        // User entered code and new password
        if (!resetToken.trim()) {
          setError('Please enter the 6-digit code or token from your email.');
          return;
        }
        if (!password || password.length < 6) {
          setError('New password must be at least 6 characters.');
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          return;
        }

        setBusy(true);
        hapticTap();
        try {
          const supabase = getSupabase();
          if (!supabase) throw new Error('Cloud backend is not connected.');

          let verified = false;
          let verifyErr: any = null;

          const { data: d1, error: e1 } = await supabase.auth.verifyOtp({
            email: email.trim(),
            token: resetToken.trim(),
            type: 'recovery',
          });
          if (d1?.session) verified = true;
          else verifyErr = e1;

          if (!verified) {
            const { data: d2, error: e2 } = await supabase.auth.verifyOtp({
              email: email.trim(),
              token: resetToken.trim(),
              type: 'email',
            });
            if (d2?.session) verified = true;
            else verifyErr = e2 || verifyErr;
          }

          if (!verified) {
            throw new Error(verifyErr?.message || 'Invalid or expired code. Please check your email.');
          }

          const { error: updateErr } = await supabase.auth.updateUser({ password });
          if (updateErr) throw updateErr;

          setMessage('🎉 Password successfully updated! Signing you in...');
          setTimeout(() => {
            onSuccess();
          }, 1200);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'Could not reset password.');
        } finally {
          setBusy(false);
        }
        return;
      }
    }

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    hapticTap();

    try {
      if (mode === 'signup') {
        const res = await signUpWithEmail(email, password, name);
        if (res.requiresVerification) {
          setMessage('Account created! A confirmation email has been sent. Please verify before signing in.');
          setMode('signin');
        } else if (res.user) {
          onSuccess(res.user);
        }
      } else {
        const user = await signInWithEmail(email, password);
        onSuccess(user);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed. Please check your credentials.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-overlay">
      <div className="auth-card" role="dialog" aria-modal="true">
        <div className="auth-header">
          <div className="auth-brand">
            <img src="/logo.png" alt="Voice Diary Logo" className="auth-logo" />
            <h2 className="auth-title">VOICE DIARY <span className="auth-title-pro">PRO</span></h2>
          </div>
          <p className="auth-subtitle">
            {mode === 'signin' && 'Sign in to sync your diary across all devices'}
            {mode === 'signup' && 'Create an account to start your personal voice journal'}
            {mode === 'forgot' && 'Reset your account password via email'}
          </p>
        </div>

        {error && (
          <div className="auth-alert error" role="alert">
            <span className="auth-alert-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="auth-alert success" role="alert">
            <span className="auth-alert-icon">✅</span>
            <span>{message}</span>
          </div>
        )}

        {/* Google OAuth Button */}
        {mode !== 'forgot' && (
          <>
            <button
              type="button"
              className="auth-google-btn"
              onClick={handleGoogleSignIn}
              disabled={googleBusy || busy}
            >
              <svg className="google-icon-svg" viewBox="0 0 24 24" width="20" height="20">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{googleBusy ? 'Connecting to Google…' : 'Continue with Google'}</span>
            </button>

            <div className="auth-divider">
              <span>or continue with email</span>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && (
            <div className="auth-field">
              <label htmlFor="auth-name" className="auth-label">Your Name</label>
              <input
                id="auth-name"
                type="text"
                className="auth-input"
                placeholder="e.g. Saikrishna"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={50}
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-email" className="auth-label">Email Address</label>
            <input
              id="auth-email"
              type="email"
              required
              className="auth-input"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              disabled={mode === 'forgot' && hasSentResetEmail}
            />
          </div>

          {mode === 'forgot' && hasSentResetEmail && (
            <>
              <div className="auth-field">
                <label htmlFor="auth-reset-token" className="auth-label">6-Digit Code / Token from Email</label>
                <input
                  id="auth-reset-token"
                  type="text"
                  required
                  className="auth-input"
                  placeholder="e.g. 123456"
                  value={resetToken}
                  onChange={e => setResetToken(e.target.value)}
                  autoComplete="one-time-code"
                />
              </div>

              <div className="auth-field">
                <label htmlFor="auth-password" className="auth-label">New Password</label>
                <input
                  id="auth-password"
                  type="password"
                  required
                  className="auth-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <div className="auth-field">
                <label htmlFor="auth-confirm-password" className="auth-label">Confirm New Password</label>
                <input
                  id="auth-confirm-password"
                  type="password"
                  required
                  className="auth-input"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </>
          )}

          {mode !== 'forgot' && (
            <div className="auth-field">
              <div className="auth-field-header">
                <label htmlFor="auth-password" className="auth-label">Password</label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    className="auth-link-btn"
                    onClick={() => { setMode('forgot'); setHasSentResetEmail(false); setError(''); setMessage(''); }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                id="auth-password"
                type="password"
                required
                className="auth-input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </div>
          )}

          {mode === 'signup' && (
            <div className="auth-field">
              <label htmlFor="auth-confirm-password" className="auth-label">Confirm Password</label>
              <input
                id="auth-confirm-password"
                type="password"
                required
                className="auth-input"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={busy || googleBusy}
          >
            {busy ? 'Processing…' : (
              mode === 'signin' ? 'Sign In' :
              mode === 'signup' ? 'Create Account' :
              hasSentResetEmail ? 'Verify Code & Set Password' :
              'Send Reset Code'
            )}
          </button>
          {mode === 'forgot' && !hasSentResetEmail && (
            <button
              type="button"
              className="auth-link-btn"
              style={{ display: 'block', margin: '12px auto 0', textAlign: 'center', color: 'var(--accent, #6366f1)', fontSize: '0.82rem' }}
              onClick={() => {
                setHasSentResetEmail(true);
                setError('');
                setMessage('Enter the 6-digit code or token from your email inbox with your new password.');
              }}
            >
              📩 Already have a reset code from your email? Enter it here →
            </button>
          )}
          {mode === 'forgot' && hasSentResetEmail && (
            <button
              type="button"
              className="auth-link-btn"
              style={{ display: 'block', margin: '8px auto 0', textAlign: 'center' }}
              onClick={() => { setHasSentResetEmail(false); setError(''); setMessage(''); }}
            >
              ← Resend code or change email
            </button>
          )}
        </form>

        <div className="auth-footer">
          {mode === 'signin' && (
            <p className="auth-footer-text">
              Don't have an account?{' '}
              <button
                type="button"
                className="auth-link-btn highlight"
                onClick={() => { setMode('signup'); setError(''); setMessage(''); }}
              >
                Sign up
              </button>
            </p>
          )}

          {mode === 'signup' && (
            <p className="auth-footer-text">
              Already have an account?{' '}
              <button
                type="button"
                className="auth-link-btn highlight"
                onClick={() => { setMode('signin'); setError(''); setMessage(''); }}
              >
                Sign in
              </button>
            </p>
          )}

          {mode === 'forgot' && (
            <p className="auth-footer-text">
              Remember your password?{' '}
              <button
                type="button"
                className="auth-link-btn highlight"
                onClick={() => { setMode('signin'); setError(''); setMessage(''); }}
              >
                Back to Sign in
              </button>
            </p>
          )}

          <div className="auth-guest-box">
            <button
              type="button"
              className="auth-guest-btn"
              onClick={onContinueAsGuest}
            >
              Continue Offline as Guest (Local Only) →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
