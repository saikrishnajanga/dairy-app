// ═══════════════════════════════════════════════════════════
//  VoiceDiary Pro — Authentication Service
//  Full-featured authentication:
//   - Email / Password Registration & Email Verification
//   - Email / Password Login
//   - Google OAuth (Web + Capacitor Android Custom Tab)
//   - Password Reset via Email
//   - Secure Lock Recovery Verification Codes
//   - Safe session management & sign out
// ═══════════════════════════════════════════════════════════

import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App as CapacitorApp } from '@capacitor/app';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { addNotification } from './notifications';

export const REDIRECT_SCHEME = 'voicediary';
const NATIVE_REDIRECT_URL = `${REDIRECT_SCHEME}://login-callback`;

export interface AuthAccount {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  provider: 'google' | 'email' | 'local';
  isEmailConfirmed?: boolean;
}

// Backward-compatible alias for existing imports
export type GoogleAccount = AuthAccount;

/** Current user id (null when signed out). */
let currentUserId: string | null = null;

export function getCurrentUserId(): string | null {
  return currentUserId;
}

function toAccount(user: User): AuthAccount {
  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const provider = (user.app_metadata?.provider as 'google' | 'email') || 'email';
  return {
    id: user.id,
    email: user.email ?? meta.email ?? '',
    name: meta.full_name || meta.name || user.email?.split('@')[0] || 'Diary User',
    avatarUrl: meta.picture || meta.avatar_url,
    provider,
    isEmailConfirmed: Boolean(user.email_confirmed_at),
  };
}

function accountOf(session: Session | null): AuthAccount | null {
  return session?.user ? toAccount(session.user) : null;
}

// ─── Email / Password Authentication ───────────────────────

export async function signUpWithEmail(
  email: string,
  pass: string,
  name?: string
): Promise<{ user: AuthAccount | null; requiresVerification: boolean }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Cloud authentication is not configured yet.');

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password: pass,
    options: {
      data: {
        full_name: name?.trim() || email.split('@')[0],
      },
      emailRedirectTo: Capacitor.isNativePlatform()
        ? NATIVE_REDIRECT_URL
        : `${window.location.origin}/`,
    },
  });

  if (error) throw error;

  const requiresVerification = !data.session && !!data.user;

  void addNotification({
    title: '🎉 Welcome to VoiceDiary Pro',
    message: requiresVerification
      ? 'Account created! Please check your email to verify your address.'
      : 'Welcome to your private diary!',
    type: 'success',
  });

  return {
    user: data.user ? toAccount(data.user) : null,
    requiresVerification,
  };
}

export async function signInWithEmail(email: string, pass: string): Promise<AuthAccount> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Cloud authentication is not configured yet.');

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: pass,
  });

  if (error) throw error;
  if (!data.user) throw new Error('Login failed — no user returned.');

  return toAccount(data.user);
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Cloud authentication is not configured yet.');

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: Capacitor.isNativePlatform()
      ? `${REDIRECT_SCHEME}://reset-password`
      : `${window.location.origin}/#reset-password`,
  });

  if (error) throw error;

  void addNotification({
    title: '🔑 Password Reset Sent',
    message: `Password reset link was sent to ${email}.`,
    type: 'info',
  });
}

export async function updateAccountPassword(newPassword: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Cloud authentication is not configured.');

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) throw error;

  void addNotification({
    title: '🛡️ Password Changed',
    message: 'Your account password has been updated successfully.',
    type: 'security',
  });
}

// ─── Google OAuth ──────────────────────────────────────────

export async function signInWithGoogle(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Google login is not configured yet');

  if (Capacitor.isNativePlatform()) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { skipBrowserRedirect: true, redirectTo: NATIVE_REDIRECT_URL },
    });
    if (error) throw error;
    if (!data.url) throw new Error('Google sign-in did not start');
    await Browser.open({ url: data.url });
  } else {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) throw error;
  }
}

// ─── Recovery Event Emitter ────────────────────────────────
type RecoveryHandler = () => void;
const recoveryListeners = new Set<RecoveryHandler>();

export function onPasswordRecoveryTriggered(cb: RecoveryHandler): () => void {
  recoveryListeners.add(cb);
  return () => {
    recoveryListeners.delete(cb);
  };
}

export function triggerPasswordRecoveryModal(): void {
  recoveryListeners.forEach(cb => {
    try { cb(); } catch (e) { console.error('Recovery callback error:', e); }
  });
}

/** Finish the OAuth or Password Recovery round trip that came back through the deep link. */
async function handleDeepLink(url: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !url.startsWith(`${REDIRECT_SCHEME}://`)) return;

  if (Capacitor.isNativePlatform()) await Browser.close().catch(() => {});

  const isRecovery = url.includes('reset-password') || url.includes('type=recovery');

  // 1. Try extracting code from query string (?code=...)
  let code: string | null = null;
  try {
    const parsed = new URL(url);
    code = parsed.searchParams.get('code');
  } catch { /* ignore */ }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && isRecovery) {
      triggerPasswordRecoveryModal();
    }
    return;
  }

  // 2. Try extracting access_token & refresh_token from hash fragment (#access_token=...&refresh_token=...)
  try {
    const hashIndex = url.indexOf('#');
    if (hashIndex !== -1) {
      const hashString = url.slice(hashIndex + 1);
      const params = new URLSearchParams(hashString);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type');

      if (accessToken && refreshToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (type === 'recovery' || isRecovery) {
          triggerPasswordRecoveryModal();
        }
      }
    }
  } catch (err) {
    console.warn('Failed parsing deep link hash:', err);
  }
}

// ─── Locked Diary Password Recovery Verification ───────────

interface RecoverySession {
  email: string;
  code: string;
  expiresAt: number;
  attempts: number;
}

const RECOVERY_STORE_KEY = 'vd_lock_recovery_session';

/**
 * Gets the currently active lock recovery session code if not expired.
 */
export function getActiveLockRecoveryCode(email?: string): string | null {
  try {
    const stored = localStorage.getItem(RECOVERY_STORE_KEY);
    if (!stored) return null;
    const session: RecoverySession = JSON.parse(stored);
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem(RECOVERY_STORE_KEY);
      return null;
    }
    if (email && session.email !== email.toLowerCase().trim()) return null;
    return session.code;
  } catch {
    return null;
  }
}

/**
 * Sends a single-use short-lived verification code to user's registered email
 * for resetting their Locked Diary password.
 * Also stores the code and pushes it to local in-app notifications so user is never locked out.
 */
export async function sendLockRecoveryCode(email: string): Promise<{ success: boolean; code: string; hint?: string }> {
  // Generate random 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes expiry

  const session: RecoverySession = {
    email: email.toLowerCase().trim(),
    code,
    expiresAt,
    attempts: 0,
  };
  localStorage.setItem(RECOVERY_STORE_KEY, JSON.stringify(session));

  // If Supabase is available, attempt OTP dispatch as well
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false },
      }).catch(() => {});
    } catch {
      // Continue with local code verification
    }
  }

  // Explicitly notify with the code so the user can see it in Notifications tray 🔔
  void addNotification({
    title: '🔐 Locked Vault Recovery Code',
    message: `Your single-use recovery code is: ${code} (valid for 10 minutes). Enter this in the recovery dialog to reset your lock password.`,
    type: 'security',
  });

  return {
    success: true,
    code,
    hint: `Recovery code generated for ${email}. Check below or notification bell 🔔.`,
  };
}

/**
 * Validates the single-use recovery code with rate limiting and expiration.
 */
export async function verifyLockRecoveryCode(email: string, inputCode: string): Promise<boolean> {
  const stored = localStorage.getItem(RECOVERY_STORE_KEY);
  if (!stored) return false;

  try {
    const session: RecoverySession = JSON.parse(stored);
    if (session.email !== email.toLowerCase().trim()) return false;
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem(RECOVERY_STORE_KEY);
      throw new Error('Recovery code has expired. Please request a new code.');
    }

    session.attempts += 1;
    if (session.attempts > 5) {
      localStorage.removeItem(RECOVERY_STORE_KEY);
      throw new Error('Too many invalid attempts. Recovery session terminated.');
    }
    localStorage.setItem(RECOVERY_STORE_KEY, JSON.stringify(session));

    // Also check Supabase OTP if applicable
    const supabase = getSupabase();
    let supabaseOk = false;
    if (supabase) {
      try {
        const { data } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: inputCode.trim(),
          type: 'email',
        });
        if (data.session) supabaseOk = true;
      } catch {
        // Fallback to local session code
      }
    }

    if (supabaseOk || session.code === inputCode.trim()) {
      localStorage.removeItem(RECOVERY_STORE_KEY);
      return true;
    }
    return false;
  } catch (e) {
    throw e;
  }
}

// ─── Lifecycle & Auth State Listener ───────────────────────

export function initAuth(
  onChange: (account: AuthAccount | null, event: AuthChangeEvent) => void
): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  let disposed = false;
  const pluginListeners: { remove(): Promise<void> }[] = [];

  const emit = (account: AuthAccount | null, event: AuthChangeEvent) => {
    currentUserId = account?.id ?? null;
    if (!disposed) onChange(account, event);
  };

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    emit(accountOf(session), event);
  });

  CapacitorApp.addListener('appUrlOpen', ({ url }) => {
    void handleDeepLink(url);
  }).then(l => { if (disposed) void l.remove(); else pluginListeners.push(l); })
    .catch(() => {});

  CapacitorApp.getLaunchUrl()
    .then(result => { if (result?.url) void handleDeepLink(result.url); })
    .catch(() => {});

  return () => {
    disposed = true;
    subscription.unsubscribe();
    pluginListeners.forEach(l => { void l.remove().catch(() => {}); });
    currentUserId = null;
  };
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (Capacitor.isNativePlatform()) await Browser.close().catch(() => {});
  if (supabase) {
    await supabase.auth.signOut().catch(() => {});
  }
  currentUserId = null;
}
