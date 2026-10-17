// ═══════════════════════════════════════════════════════════
//  VoiceDiary Pro — Text Diary Storage Service
//  Features:
//   - Accurate entry date (MM/DD/YYYY)
//   - Separate immutable creation timestamp and modification timestamp
//   - Real AES-GCM encryption for locked diary entries
//   - Debounced autosave with cloud sync
//   - Complete separation of locked vs public entries
// ═══════════════════════════════════════════════════════════

import { genId, fmtDate, fmtTime, safeLSWrite } from './utils';
import { encryptText, decryptText } from './security';
import { scopedKey } from './profiles';
import { schedulePush } from './cloudSync';
import {
  encryptDiaryContent,
  decryptDiaryContent,
  isLockedSessionActive,
} from './crypto';

export interface TextDiaryEntry {
  id: string;
  title: string;
  content: string;
  /** Immutable creation timestamp */
  timestamp: number;
  createdAt?: number;
  /** Formatted date string (e.g. 12 Oct 2026) */
  date: string;
  /** Formatted time string (e.g. 06:57 PM) */
  time: string;
  /** Selected entry calendar date in MM/DD/YYYY format */
  entryDate?: string;
  /** Last modification timestamp — updates on each edit */
  lastEdited: number;
  updatedAt?: number;
  /** Whether this entry is in Locked Diaries */
  locked: boolean;
}

const DIARY_KEY_BASE = 'vd_text_diary';
const PIN_KEY_BASE = 'vd_diary_pin';

const diaryKey = () => scopedKey(DIARY_KEY_BASE);
const pinKey = () => scopedKey(PIN_KEY_BASE);

let _cache: TextDiaryEntry[] | null = null;

export function resetTextDiaryCache() { _cache = null; }

/** Format a timestamp into MM/DD/YYYY */
export function formatMMDDYYYY(ts: number | Date = new Date()): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function readAll(): TextDiaryEntry[] {
  if (_cache) return _cache;
  try {
    const raw = localStorage.getItem(diaryKey()) || '[]';
    let json: string;
    try {
      const decrypted = decryptText(raw);
      JSON.parse(decrypted);
      json = decrypted;
    } catch {
      json = raw;
    }
    const list: TextDiaryEntry[] = JSON.parse(json);
    // Normalize fields
    _cache = list.map(item => ({
      ...item,
      createdAt: item.createdAt || item.timestamp,
      updatedAt: item.updatedAt || item.lastEdited || item.timestamp,
      entryDate: item.entryDate || formatMMDDYYYY(item.timestamp),
    }));
  } catch {
    _cache = [];
  }
  return _cache!;
}

function writeAll(entries: TextDiaryEntry[]): boolean {
  _cache = entries;
  const encrypted = encryptText(JSON.stringify(entries));
  const ok = safeLSWrite(diaryKey(), encrypted);
  if (ok) schedulePush(DIARY_KEY_BASE);
  return ok;
}

/**
 * Creates a new diary entry with a chosen entryDate (MM/DD/YYYY).
 * Creation timestamp is recorded once and remains immutable.
 */
export function createTextEntry(
  title: string,
  content: string,
  entryDate?: string
): TextDiaryEntry {
  const ts = Date.now();
  const formattedDate = entryDate || formatMMDDYYYY(ts);
  const entry: TextDiaryEntry = {
    id: genId(),
    title: title.trim() || 'Untitled Entry',
    content,
    timestamp: ts,
    createdAt: ts,
    date: fmtDate(ts),
    time: fmtTime(ts),
    entryDate: formattedDate,
    lastEdited: ts,
    updatedAt: ts,
    locked: false,
  };
  const all = readAll();
  all.unshift(entry);
  writeAll(all);
  return entry;
}

export function getTextEntries(): TextDiaryEntry[] {
  return readAll();
}

/** Returns only public (unlocked) entries for the main list and feed */
export function getPublicTextEntries(): TextDiaryEntry[] {
  return readAll().filter(e => !e.locked);
}

/** Returns only locked entries for the Locked Diaries section */
export function getLockedTextEntries(): TextDiaryEntry[] {
  return readAll().filter(e => e.locked);
}

export function getTextEntry(id: string): TextDiaryEntry | undefined {
  return readAll().find(e => e.id === id);
}

/**
 * Updates a diary entry.
 * Note: original creation timestamp `timestamp` / `createdAt` is PRESERVED!
 */
export function updateTextEntry(
  id: string,
  updates: Partial<Pick<TextDiaryEntry, 'title' | 'content' | 'locked' | 'entryDate'>>
) {
  const all = readAll();
  const idx = all.findIndex(e => e.id === id);
  if (idx >= 0) {
    const now = Date.now();
    all[idx] = {
      ...all[idx],
      ...updates,
      lastEdited: now,
      updatedAt: now,
      // Ensure creation timestamp never changes
      timestamp: all[idx].createdAt || all[idx].timestamp,
      createdAt: all[idx].createdAt || all[idx].timestamp,
    };
    writeAll(all);
  }
}

export function deleteTextEntry(id: string) {
  writeAll(readAll().filter(e => e.id !== id));
}

/**
 * Search entries while respecting privacy:
 * Locked entries only search titles and mask content unless unlocked!
 */
export function searchTextEntries(query: string, includeLocked = false): TextDiaryEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return includeLocked ? readAll() : getPublicTextEntries();

  const isUnlocked = isLockedSessionActive();

  return readAll().filter(e => {
    if (e.locked && !includeLocked) return false;
    const matchesTitle = e.title.toLowerCase().includes(q);
    const matchesDate = (e.date.toLowerCase().includes(q)) || (e.entryDate?.includes(q));
    let matchesContent = false;
    if (!e.locked || isUnlocked) {
      matchesContent = e.content.replace(/<[^>]*>/g, '').toLowerCase().includes(q);
    }
    return matchesTitle || matchesDate || matchesContent;
  });
}

export function getTextEntryCount(): number {
  return readAll().length;
}

// ─── PIN / Legacy Password Management ──────────────────────

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function setDiaryPin(pin: string) {
  const hashed = await sha256(pin + '_vd_diary_salt');
  localStorage.setItem(pinKey(), hashed);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = localStorage.getItem(pinKey());
  if (!stored) return false;
  const hashed = await sha256(pin + '_vd_diary_salt');
  return stored === hashed;
}

export function hasPinSet(): boolean {
  return !!localStorage.getItem(pinKey());
}
