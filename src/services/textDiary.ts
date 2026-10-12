// Text Diary storage service with lock support
import { genId, fmtDate, fmtTime, safeLSWrite } from './utils';
import { encryptText, decryptText } from './security';
import { scopedKey } from './profiles';
import { schedulePush } from './cloudSync';

export interface TextDiaryEntry {
  id: string;
  title: string;
  content: string;
  timestamp: number;
  date: string;
  time: string;
  lastEdited: number;
  locked: boolean;
}

const DIARY_KEY_BASE = 'vd_text_diary';
const PIN_KEY_BASE = 'vd_diary_pin';

// Diary entries and their PIN belong to the active profile.
const diaryKey = () => scopedKey(DIARY_KEY_BASE);
const pinKey = () => scopedKey(PIN_KEY_BASE);

// ─── In-memory cache ───
let _cache: TextDiaryEntry[] | null = null;

/** Drop the cache — call when the active profile changes. */
export function resetTextDiaryCache() { _cache = null; }

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
      json = raw; // Legacy unencrypted data
    }
    _cache = JSON.parse(json);
  } catch { _cache = []; }
  return _cache!;
}

function writeAll(entries: TextDiaryEntry[]): boolean {
  _cache = entries;
  const encrypted = encryptText(JSON.stringify(entries));
  const ok = safeLSWrite(diaryKey(), encrypted);
  if (ok) schedulePush(DIARY_KEY_BASE); // mirror to the Google account
  return ok;
}

export function createTextEntry(title: string, content: string): TextDiaryEntry {
  const ts = Date.now();
  const entry: TextDiaryEntry = {
    id: genId(), title, content, timestamp: ts,
    date: fmtDate(ts), time: fmtTime(ts), lastEdited: ts, locked: false,
  };
  const all = readAll();
  all.unshift(entry);
  writeAll(all);
  return entry;
}

export function getTextEntries(): TextDiaryEntry[] { return readAll(); }

export function getTextEntry(id: string): TextDiaryEntry | undefined {
  return readAll().find(e => e.id === id);
}

export function updateTextEntry(id: string, updates: Partial<Pick<TextDiaryEntry, 'title' | 'content' | 'locked'>>) {
  const all = readAll();
  const idx = all.findIndex(e => e.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...updates, lastEdited: Date.now() };
    writeAll(all);
  }
}

export function deleteTextEntry(id: string) {
  writeAll(readAll().filter(e => e.id !== id));
}

export function searchTextEntries(query: string): TextDiaryEntry[] {
  const q = query.toLowerCase();
  return readAll().filter(e =>
    e.title.toLowerCase().includes(q) ||
    e.content.replace(/<[^>]*>/g, '').toLowerCase().includes(q) ||
    e.date.toLowerCase().includes(q)
  );
}

export function getTextEntryCount(): number {
  return readAll().length;
}

// PIN/Password management — using SHA-256 hashing
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
