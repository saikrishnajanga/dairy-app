// ═══════════════════════════════════════════════════════════
//  Cloud sync — mirrors the Google account's profile in Supabase.
//
//  Storage model: one row per content key, (user_id, key) → value,
//  where value is the plain JSON array the app already keeps locally.
//  Row-level security in the database guarantees a user only ever sees
//  their own rows.
//
//  Merge rule: union by id, newer edit wins per item. A sync can add
//  or update entries but can NEVER lose anything written on this
//  device — matching the app's "no text loss" promise.
//
//  Only the Google-owned profile ever syncs; local profiles stay
//  strictly on the device.
// ═══════════════════════════════════════════════════════════

import { getSupabase } from './supabase';
import { getCurrentUserId } from './auth';
import { scopedKey, getActiveProfileId } from './profiles';
import { encryptText, decryptText } from './security';
import { safeLSWrite } from './utils';

/** Content keys that travel to the cloud. PINs and the voice draft
 *  deliberately stay local — a PIN must unlock this device, and a
 *  half-finished transcript is worthless anywhere else. */
export const SYNC_KEYS = ['voicediary_entries', 'vd_text_diary', 'vd_translations'] as const;

const PUSH_DELAY_MS = 1200;

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
 * The sync target exists only when a Google session is live AND the
 * profile on screen is the one that session owns — local profiles and
 * other people's data never leave the device.
 */
function syncTarget(): { userId: string } | null {
  if (!getSupabase()) return null;
  const userId = getCurrentUserId();
  if (!userId) return null;
  if (getActiveProfileId() !== `g-${userId}`) return null;
  return { userId };
}

/** Download every cloud row and merge it into the active profile.
 *  Returns true when at least the download succeeded. */
export async function pullFromCloud(): Promise<boolean> {
  const target = syncTarget();
  if (!target) return false;
  const supabase = getSupabase()!;

  const { data, error } = await supabase
    .from('diary_data')
    .select('key, value')
    .eq('user_id', target.userId);
  if (error) {
    console.warn('cloud pull failed:', error.message);
    return false;
  }

  for (const row of data ?? []) {
    if (!(SYNC_KEYS as readonly string[]).includes(row.key)) continue;
    const remote = Array.isArray(row.value) ? (row.value as Syncable[]) : [];
    const merged = mergeLists(readLocal(row.key) as Syncable[], remote);
    writeLocal(row.key, merged);
  }
  return true;
}

async function pushKey(base: string): Promise<void> {
  const target = syncTarget();
  if (!target) return;
  const supabase = getSupabase()!;

  const { error } = await supabase.from('diary_data').upsert(
    {
      user_id: target.userId,
      key: base,
      value: readLocal(base),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,key' }
  );
  if (error) console.warn('cloud push failed:', error.message);
}

// Debounced so rapid edits (typing in the diary, save bursts) upload once.
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Schedule an upload of one content key — a no-op unless the Google
 *  profile is active and signed in. Called by the local stores after
 *  every write. */
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

/** Upload every syncable key right after sign-in so existing local
 *  entries become visible on the account's other devices. */
export async function pushAllToCloud(): Promise<void> {
  await Promise.all(SYNC_KEYS.map(k => pushKey(k)));
}
