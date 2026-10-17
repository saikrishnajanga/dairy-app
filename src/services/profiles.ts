// ═══════════════════════════════════════════════════════════
//  On-device profiles ("sign up" without a server)
//
//  Everything lives in localStorage on the phone — no account, no
//  network, no email. Each profile owns its own slice of the app's
//  data by suffixing the storage keys, so two people sharing a phone
//  never see each other's diary.
//
//  A profile can optionally be protected by a PIN. PINs are stored as
//  a salted SHA-256 digest, never in clear text.
// ═══════════════════════════════════════════════════════════

import { genId } from './utils';
import { sha256Hex, decryptText } from './security';

export interface Profile {
  id: string;
  name: string;
  /** Salted SHA-256 of the optional PIN. */
  pinHash?: string;
  createdAt: number;
  provider?: 'google' | 'email' | 'local';
  email?: string;
  avatarUrl?: string;
}

const PROFILES_KEY = 'vd_profiles';
const ACTIVE_KEY = 'vd_active_profile';
const PIN_SALT = '_vd_profile_salt';

/** Storage keys that hold per-profile content. */
export const CONTENT_BASE_KEYS = [
  'voicediary_entries',   // voice diary entries
  'vd_text_diary',        // rich-text diary entries
  'vd_diary_pin',         // diary PIN (per profile)
  'vd_translations',      // saved translations
  'vd_voice_draft',       // unsaved voice transcript
] as const;

function read(): Profile[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function write(profiles: Profile[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export function listProfiles(): Profile[] { return read(); }

export function getActiveProfileId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function getActiveProfile(): Profile | null {
  const id = getActiveProfileId();
  return id ? read().find(p => p.id === id) ?? null : null;
}

/**
 * Suffix appended to content storage keys for the active profile.
 * Empty when no profile exists yet (keeps legacy/global data working).
 */
export function activeSuffix(): string {
  const id = getActiveProfileId();
  return id ? `::${id}` : '';
}

/** Resolve a base storage key for the currently active profile. */
export function scopedKey(base: string): string {
  return base + activeSuffix();
}

/** Move data that predates profiles into the first profile created. */
function migrateLegacyData(profileId: string) {
  for (const base of CONTENT_BASE_KEYS) {
    const legacy = localStorage.getItem(base);
    if (legacy === null) continue;
    const scoped = `${base}::${profileId}`;
    if (localStorage.getItem(scoped) === null) localStorage.setItem(scoped, legacy);
    localStorage.removeItem(base);
  }
}

export async function createProfile(name: string, pin?: string): Promise<Profile> {
  const profile: Profile = {
    id: genId(),
    name: name.trim() || 'Me',
    createdAt: Date.now(),
  };
  if (pin) profile.pinHash = await sha256Hex(pin + PIN_SALT);

  const profiles = read();
  profiles.push(profile);
  write(profiles);

  // The very first profile adopts whatever is already on the device.
  if (profiles.length === 1) migrateLegacyData(profile.id);

  setActiveProfile(profile.id);
  return profile;
}

export function setActiveProfile(id: string) {
  localStorage.setItem(ACTIVE_KEY, id);
}

export async function ensureUserProfile(account: {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  provider?: 'google' | 'email' | 'local';
}): Promise<Profile> {
  const prefix = account.provider === 'google' ? 'g-' : 'u-';
  const id = `${prefix}${account.id}`;
  const profiles = read();
  const existing = profiles.find(p => p.id === id);
  if (existing) {
    if (account.email && !existing.email) existing.email = account.email;
    if (account.name && existing.name === 'Me') existing.name = account.name;
    write(profiles);
    setActiveProfile(id);
    return existing;
  }

  const profile: Profile = {
    id,
    name: account.name.trim() || 'Me',
    createdAt: Date.now(),
    provider: (account.provider as 'google' | 'email') || 'email',
  };
  if (account.email) profile.email = account.email;
  if (account.avatarUrl) profile.avatarUrl = account.avatarUrl;

  profiles.push(profile);
  write(profiles);
  if (profiles.length === 1) migrateLegacyData(id);

  setActiveProfile(id);
  return profile;
}

/**
 * Legacy Google profile helper for backward compatibility
 */
export async function ensureGoogleProfile(account: {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}): Promise<Profile> {
  return ensureUserProfile({ ...account, provider: 'google' });
}

export function updateProfile(
  id: string,
  updates: Partial<Pick<Profile, 'name' | 'email' | 'avatarUrl' | 'pinHash'>>
) {
  const profiles = read();
  const index = profiles.findIndex(p => p.id === id);
  if (index >= 0) {
    profiles[index] = { ...profiles[index], ...updates };
    write(profiles);
  }
}

export async function setProfilePin(id: string, pin: string) {
  updateProfile(id, { pinHash: await sha256Hex(pin + PIN_SALT) });
}

export function removeProfilePin(id: string) {
  const profiles = read();
  const index = profiles.findIndex(p => p.id === id);
  if (index >= 0) {
    delete profiles[index].pinHash;
    write(profiles);
  }
}

/** True when the PIN is correct (also true when the profile has no PIN). */
export async function verifyProfilePin(id: string, pin: string): Promise<boolean> {
  const profile = read().find(p => p.id === id);
  if (!profile?.pinHash) return true;
  return (await sha256Hex(pin + PIN_SALT)) === profile.pinHash;
}

export function profileHasPin(id: string): boolean {
  return !!read().find(p => p.id === id)?.pinHash;
}

/** Change or set password/PIN on a profile, checking old PIN if one exists. */
export async function changeProfilePassword(
  profileId: string,
  newPin: string,
  currentPin?: string
): Promise<void> {
  const profile = read().find(p => p.id === profileId);
  if (!profile) throw new Error('Profile not found.');

  if (profile.pinHash) {
    if (!currentPin) {
      throw new Error('Please enter your current PIN/password.');
    }
    const matches = await verifyProfilePin(profileId, currentPin);
    if (!matches) {
      throw new Error('Current PIN/password is incorrect.');
    }
  }

  await setProfilePin(profileId, newPin);
}

/** Delete a profile and every piece of data that belonged to it. */
export function deleteProfile(id: string) {
  for (const base of CONTENT_BASE_KEYS) localStorage.removeItem(`${base}::${id}`);

  const remaining = read().filter(p => p.id !== id);
  write(remaining);

  if (getActiveProfileId() === id) {
    if (remaining.length > 0) setActiveProfile(remaining[0].id);
    else localStorage.removeItem(ACTIVE_KEY);
  }
}

/** Sign out of the active profile without deleting it. */
export function clearActiveProfile() {
  localStorage.removeItem(ACTIVE_KEY);
}

/** Count recorded voice entries for a profile (shown in the switcher). */
export function profileEntryCount(id: string): number {
  const raw = localStorage.getItem(`voicediary_entries::${id}`);
  if (!raw) return 0;
  // Entries are stored encrypted; fall back to plain JSON for legacy data.
  for (const candidate of [raw, decryptText(raw)]) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed.length;
    } catch { /* try the next candidate */ }
  }
  return 0;
}
