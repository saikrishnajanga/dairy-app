export interface DiaryEntry {
  id: string;
  teluguText: string;
  romanizedText: string;
  timestamp: number;
  date: string;
  time: string;
}

const KEY = 'voicediary_entries';

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

function read(): DiaryEntry[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}

function write(entries: DiaryEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

export function saveEntry(teluguText: string, romanizedText: string): DiaryEntry {
  const ts = Date.now();
  const entry: DiaryEntry = {
    id: genId(), teluguText, romanizedText, timestamp: ts,
    date: fmtDate(ts), time: fmtTime(ts),
  };
  const entries = read();
  entries.unshift(entry);
  write(entries);
  return entry;
}

export function getEntries(): DiaryEntry[] { return read(); }

export function deleteEntry(id: string) {
  write(read().filter(e => e.id !== id));
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
