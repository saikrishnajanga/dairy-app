// Text Diary storage service

export interface TextDiaryEntry {
  id: string;
  title: string;
  content: string; // HTML content for rich text
  timestamp: number;
  date: string;
  time: string;
  lastEdited: number;
}

const DIARY_KEY = 'vd_text_diary';

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

function readAll(): TextDiaryEntry[] {
  try { return JSON.parse(localStorage.getItem(DIARY_KEY) || '[]'); }
  catch { return []; }
}

function writeAll(entries: TextDiaryEntry[]) {
  localStorage.setItem(DIARY_KEY, JSON.stringify(entries));
}

export function createTextEntry(title: string, content: string): TextDiaryEntry {
  const ts = Date.now();
  const entry: TextDiaryEntry = {
    id: genId(), title, content, timestamp: ts,
    date: fmtDate(ts), time: fmtTime(ts), lastEdited: ts,
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

export function updateTextEntry(id: string, updates: Partial<Pick<TextDiaryEntry, 'title' | 'content'>>) {
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

export function exportTextEntries(): string {
  return readAll()
    .map(e => `# ${e.title}\n[${e.date} ${e.time}]\n\n${e.content.replace(/<[^>]*>/g, '')}\n`)
    .join('\n---\n\n');
}
