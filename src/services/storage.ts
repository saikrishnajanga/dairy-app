import { genId, fmtDate, fmtTime, safeLSWrite } from './utils';
import { encryptText, decryptText } from './security';

export interface DiaryEntry {
  id: string;
  teluguText: string;
  romanizedText: string;
  timestamp: number;
  date: string;
  time: string;
  favorite?: boolean;
}

const KEY = 'voicediary_entries';

// ─── In-memory cache to avoid repeated JSON parsing ───
let _cache: DiaryEntry[] | null = null;

function read(): DiaryEntry[] {
  if (_cache) return _cache;
  try {
    const raw = localStorage.getItem(KEY) || '[]';
    // Try decrypting first (encrypted data), fall back to raw (legacy unencrypted)
    let json: string;
    try {
      const decrypted = decryptText(raw);
      JSON.parse(decrypted); // validate it's real JSON
      json = decrypted;
    } catch {
      json = raw; // Legacy unencrypted data — use as-is
    }
    _cache = JSON.parse(json);
  } catch { _cache = []; }
  return _cache!;
}

function write(entries: DiaryEntry[]): boolean {
  _cache = entries;
  const encrypted = encryptText(JSON.stringify(entries));
  const ok = safeLSWrite(KEY, encrypted);
  if (!ok) {
    console.error('Storage full! Could not save entries.');
  }
  return ok;
}

export function saveEntry(teluguText: string, romanizedText: string): { entry: DiaryEntry; ok: boolean } {
  const ts = Date.now();
  const entry: DiaryEntry = {
    id: genId(), teluguText, romanizedText, timestamp: ts,
    date: fmtDate(ts), time: fmtTime(ts),
  };
  const entries = read();
  entries.unshift(entry);
  const ok = write(entries);
  return { entry, ok };
}

export function getEntries(): DiaryEntry[] { return read(); }

export function deleteEntry(id: string) {
  write(read().filter(e => e.id !== id));
}

export function toggleFavorite(id: string) {
  const entries = read();
  const idx = entries.findIndex(e => e.id === id);
  if (idx >= 0) { entries[idx].favorite = !entries[idx].favorite; write(entries); }
}

export function updateEntry(id: string, updates: Partial<Pick<DiaryEntry, 'teluguText' | 'romanizedText'>>) {
  const entries = read();
  const idx = entries.findIndex(e => e.id === id);
  if (idx >= 0) { entries[idx] = { ...entries[idx], ...updates }; write(entries); }
}

export function searchEntries(query: string): DiaryEntry[] {
  const q = query.toLowerCase();
  return read().filter(e =>
    e.romanizedText.toLowerCase().includes(q) ||
    e.teluguText.toLowerCase().includes(q) ||
    e.date.toLowerCase().includes(q)
  );
}

export function exportEntries(): string {
  return read()
    .map(e => `[${e.date} ${e.time}]\n${e.romanizedText}\n${e.teluguText ? `(${e.teluguText})` : ''}`)
    .join('\n\n---\n\n');
}

export function getEntryCount(): number {
  return read().length;
}

/** Export ALL app data as a JSON backup string */
export function exportAllData(): string {
  const backup: Record<string, string | null> = {};
  const keys = ['voicediary_entries', 'vd_text_diary', 'vd_saved_translations', 'vd_theme', 'vd_app_lock_enabled', 'vd_auto_lock'];
  keys.forEach(k => { backup[k] = localStorage.getItem(k); });
  return JSON.stringify({ _backup: 'VoiceDiary Pro', _version: '1.2', _date: new Date().toISOString(), data: backup }, null, 2);
}
