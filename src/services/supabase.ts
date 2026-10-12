// ═══════════════════════════════════════════════════════════
//  Supabase client — the cloud behind "Continue with Google".
//
//  Not configured until VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
//  are present in .env.local — every other module checks
//  isSupabaseConfigured() first so the app keeps working offline /
//  without an account.
// ═══════════════════════════════════════════════════════════

import { Capacitor } from '@capacitor/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function isSupabaseConfigured(): boolean {
  return !!url && /^https?:\/\//.test(url) && !url.includes('YOUR-PROJECT') && !!anonKey && !anonKey.includes('YOUR-');
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        flowType: 'pkce',
        // On Android the OAuth code arrives via the voicediary:// deep
        // link (handled manually in auth.ts), not in the address bar.
        detectSessionInUrl: !Capacitor.isNativePlatform(),
        storageKey: 'vd_supabase_auth',
      },
    });
  }
  return client;
}
