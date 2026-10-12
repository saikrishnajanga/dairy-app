// ═══════════════════════════════════════════════════════════
//  Google login (Supabase Auth → Google provider)
//
//  Web: standard full-page OAuth redirect; detectSessionInUrl picks
//       the session up when Supabase sends the user back.
//
//  Android: OAuth inside the app WebView is rejected by Google
//       (403 disallowed_useragent), so the consent URL is opened in a
//       Chrome Custom Tab (@capacitor/browser) instead. Google hands
//       off to voicediary://login-callback, we catch that deep link,
//       close the tab and exchange the PKCE code for a session.
// ═══════════════════════════════════════════════════════════

import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App as CapacitorApp } from '@capacitor/app';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

/** Custom scheme registered in AndroidManifest.xml. Must also be listed
 *  in Supabase → Authentication → URL Configuration → Redirect URLs. */
export const REDIRECT_SCHEME = 'voicediary';
const NATIVE_REDIRECT_URL = `${REDIRECT_SCHEME}://login-callback`;

export interface GoogleAccount {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

/** Google user id of the signed-in account (null when signed out). */
let currentUserId: string | null = null;

export function getCurrentUserId(): string | null {
  return currentUserId;
}

function toAccount(user: User): GoogleAccount {
  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  return {
    id: user.id,
    email: user.email ?? meta.email ?? '',
    name: meta.full_name || meta.name || user.email || 'Google user',
    avatarUrl: meta.picture || meta.avatar_url,
  };
}

function accountOf(session: Session | null): GoogleAccount | null {
  return session?.user ? toAccount(session.user) : null;
}

/**
 * Start "Continue with Google".
 * Android: resolves once the consent screen is open (the sign-in itself
 * finishes later, via the deep link). Web: resolves just as the page
 * navigates to Google.
 */
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

/** Finish the OAuth round trip that came back through the deep link. */
async function handleDeepLink(url: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !url.startsWith(`${REDIRECT_SCHEME}://`)) return;

  // Dismiss the Custom Tab first — also when the user cancelled
  // (?error=access_denied), so we never leave a dead Google page behind.
  if (Capacitor.isNativePlatform()) await Browser.close().catch(() => {});

  let code: string | null = null;
  try { code = new URL(url).searchParams.get('code'); } catch { /* not ours */ }
  if (!code) return; // cancelled or unrelated link

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) console.warn('Google sign-in failed:', error.message);
}

/**
 * Wire up auth events. `onChange` receives the signed-in account (or
 * null) plus the Supabase event name — App.tsx syncs data on
 * INITIAL_SESSION / SIGNED_OUT. Returns a cleanup function.
 */
export function initAuth(
  onChange: (account: GoogleAccount | null, event: AuthChangeEvent) => void
): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  let disposed = false;
  const pluginListeners: { remove(): Promise<void> }[] = [];

  const emit = (account: GoogleAccount | null, event: AuthChangeEvent) => {
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

  // Cold start: Android can launch the app directly with the callback URL.
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
  if (!supabase) return;
  if (Capacitor.isNativePlatform()) await Browser.close().catch(() => {});
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
