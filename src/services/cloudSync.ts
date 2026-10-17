// ═══════════════════════════════════════════════════════════
//  Cloud sync — mirrors the account's diary data in Supabase.
//
//  Storage model: one row per content key, (user_id, key) → value,
//  where value is the plain JSON array the app keeps locally.
//  Row-level security in the database guarantees a user only ever sees
//  their own rows.
//
//  Merge rule: union by id, newer edit wins per item. A sync can add
//  or update entries but can NEVER lose anything written on this
//  device — matching the app's "no text loss" promise.
// ═══════════════════════════════════════════════════════════

import { getSupabase } from './supabase';
import { getCurrentUserId } from './auth';
import { scopedKey, getActiveProfileId } from './profiles';
import { encryptText, decryptText } from './security';
import { safeLSWrite } from './utils';

export const SYNC_KEYS = ['voicediary_entries', 'vd_text_diary', 'vd_translations'] as const;

const PUSH_DELAY_MS = 1000;

export type SyncState = 'idle' | 'saving' | 'synced' | 'offline' | 'error';
let currentSyncState: SyncState = 'idle';
const syncListeners = new Set<(state: SyncState) => void>();

export function getSyncState(): SyncState {
  if (!navigator.onLine) return 'offline';
  return currentSyncState;
}

function setSyncState(state: SyncState) {
  currentSyncState = state;
  syncListeners.forEach(l => l(state));
}

export function subscribeSyncState(listener: (state: SyncState) => void): () => void {
  syncListeners.add(listener);
  listener(getSyncState());
  return () => { syncListeners.delete(listener); };
}

interface Syncable {
  id: string;
  timestamp?: number;
  lastEdited?: number;
}

const stamp = (x: Syncable) => x.lastEdited ?? x.timestamp ?? 0;

/** Union two lists by id — newer edit wins per item, nothing dropped. */
export function mergeLists<T extends Syncable>(local: T[], remote: T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of local) merged.set(item.id, item);
  for (const item of remote) {
    const current = merged.get(item.id);
    if (!current || stamp(item) > stamp(current)) merged.set(item.id, item);
  }
  return Array.from(merged.values()).sort((a, b) => stamp(b) - stamp(a));
}

/** Read the active profile's copy of a key (handles encrypted + legacy plain). */
function readLocal(base: string): unknown[] {
  try {
    const raw = localStorage.getItem(scopedKey(base)) || '[]';
    let json: string;
    try {
      const decrypted = decryptText(raw);
      JSON.parse(decrypted);
      json = decrypted;
    } catch {
      json = raw; // legacy unencrypted
    }
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(base: string, value: unknown): void {
  safeLSWrite(scopedKey(base), encryptText(JSON.stringify(value)));
}

/**
 * The sync target exists when a session is live in Supabase.
 */
function syncTarget(): { userId: string } | null {
  if (!getSupabase()) return null;
  const userId = getCurrentUserId();
  if (!userId) return null;
  const activeId = getActiveProfileId();
  // Allow if it's the account's profile or if no conflicting profile
  if (activeId && activeId !== `g-${userId}` && activeId !== `u-${userId}`) {
    // If it's a strictly local profile, don't sync
    if (!activeId.startsWith('g-') && !activeId.startsWith('u-')) {
      return null;
    }
  }
  return { userId };
}

/** Download every cloud row and merge it into the active profile. */
export async function pullFromCloud(): Promise<boolean> {
  const target = syncTarget();
  if (!target) return false;
  const supabase = getSupabase()!;

  setSyncState('saving');
  try {
    const { data, error } = await supabase
      .from('diary_data')
      .select('key, value')
      .eq('user_id', target.userId);

    if (error) {
      console.warn('cloud pull failed:', error.message);
      setSyncState('error');
      return false;
    }

    for (const row of data ?? []) {
      if (!(SYNC_KEYS as readonly string[]).includes(row.key)) continue;
      const remote = Array.isArray(row.value) ? (row.value as Syncable[]) : [];
      const merged = mergeLists(readLocal(row.key) as Syncable[], remote);
      writeLocal(row.key, merged);
    }
    setSyncState('synced');
    return true;
  } catch {
    setSyncState('error');
    return false;
  }
}

async function pushKey(base: string): Promise<void> {
  const target = syncTarget();
  if (!target) return;
  if (!navigator.onLine) {
    setSyncState('offline');
    return;
  }
  const supabase = getSupabase()!;

  setSyncState('saving');
  try {
    const { error } = await supabase.from('diary_data').upsert(
      {
        user_id: target.userId,
        key: base,
        value: readLocal(base),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,key' }
    );
    if (error) {
      console.warn('cloud push failed:', error.message);
      setSyncState('error');
    } else {
      setSyncState('synced');
    }
  } catch {
    setSyncState('error');
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function schedulePush(base: string): void {
  if (!(SYNC_KEYS as readonly string[]).includes(base)) return;
  if (!syncTarget()) return;
  const existing = timers.get(base);
  if (existing) clearTimeout(existing);
  timers.set(
    base,
    setTimeout(() => {
      timers.delete(base);
      void pushKey(base);
    }, PUSH_DELAY_MS)
  );
}

export async function pushAllToCloud(): Promise<void> {
  await Promise.all(SYNC_KEYS.map(k => pushKey(k)));
}
