// ═══════════════════════════════════════════════════════════
//  "Save as Google Doc" export
//
//  Builds a real .docx and hands it to the platform:
//   • Android: Filesystem → Cache, then the system share sheet, where
//     the user picks Google Drive / Google Docs (which import .docx as
//     a native Google Doc). No Google Cloud project or login required.
//   • Web: a normal file download.
// ═══════════════════════════════════════════════════════════

import { buildDocx, type DocBlock, type DocRun } from './docx';
import type { DiaryEntry } from './storage';
import type { TextDiaryEntry } from './textDiary';

// ─── Bytes → base64 (chunked: avoids the argument limit of apply) ───

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Safe cross-platform filename (keeps Telugu/letters, drops path chars). */
export function docxFilename(base: string): string {
  const cleaned = base
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return `${cleaned || 'VoiceDiary'}.docx`;
}

/**
 * Write the file where the user can reach Google Docs:
 * native → share sheet, web → download.
 */
export async function saveOrShareFile(opts: {
  filename: string;
  bytes: Uint8Array;
  mime: string;
  title: string;
  dialogTitle?: string;
}): Promise<'shared' | 'downloaded'> {
  const { Capacitor } = await import('@capacitor/core');

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');

    const written = await Filesystem.writeFile({
      path: opts.filename,
      data: bytesToBase64(opts.bytes),
      directory: Directory.Cache,
    });
    await Share.share({
      title: opts.title,
      url: written.uri,
      dialogTitle: opts.dialogTitle ?? 'Save to Google Docs or Drive',
    });
    return 'shared';
  }

  // Copy into a plain ArrayBuffer-backed view so Blob accepts it
  // (keeps the type honest rather than casting it away).
  const copy = new Uint8Array(opts.bytes.length);
  copy.set(opts.bytes);
  const blob = new Blob([copy], { type: opts.mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = opts.filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}

export async function saveDocx(blocks: DocBlock[], baseName: string): Promise<'shared' | 'downloaded'> {
  const filename = docxFilename(baseName);
  const bytes = buildDocx(blocks, { title: baseName });
  return saveOrShareFile({
    filename,
    bytes,
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    title: baseName,
  });
}

// ─── Rich-text HTML → document blocks ──────────────────────
//  Tolerant mini-parser for the markup our own editor produces
//  (b/strong, i/em, u, s/strike/del, h2, h3, p, div, br, li,
//  blockquote, span, a). Anything unknown degrades to plain text.

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&apos;': "'", '&nbsp;': ' ',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, m => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export function htmlToBlocks(html: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  let current: DocBlock['type'] = 'paragraph';
  let inListItem = false;
  let open = 0;                       // >0 while inside a block element
  let runs: DocRun[] = [];
  const styleStack: Array<'bold' | 'italic' | 'underline' | 'strike'> = [];

  const flush = () => {
    const text = runs.map(r => r.text).join('').trim();
    if (text) blocks.push({ type: current, runs });
    runs = [];
  };

  const tokens = html.match(/<[^>]*>|[^<]+/g) ?? [];

  for (const token of tokens) {
    if (!token.startsWith('<')) {
      const text = decodeEntities(token).replace(/\s+/g, ' ');
      if (text) {
        const style = {
          bold: styleStack.includes('bold') || undefined,
          italic: styleStack.includes('italic') || undefined,
          underline: styleStack.includes('underline') || undefined,
          strike: styleStack.includes('strike') || undefined,
        };
        runs.push({ text, ...style });
      }
      continue;
    }

    const closing = token.startsWith('</');
    const name = (token.match(/^<\/?\s*([a-zA-Z0-9]+)/)?.[1] ?? '').toLowerCase();
    const selfClosing = /\/>$/.test(token) || name === 'br';

    if (name === 'br' || name === 'hr') { flush(); continue; }

    if (['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del'].includes(name)) {
      const style =
        name === 'b' || name === 'strong' ? 'bold'
          : name === 'i' || name === 'em' ? 'italic'
            : name === 'u' ? 'underline' : 'strike';
      if (closing) {
        const at = styleStack.lastIndexOf(style);
        if (at >= 0) styleStack.splice(at, 1);
      } else if (!selfClosing) {
        styleStack.push(style);
      }
      continue;
    }

    const isList = name === 'ul' || name === 'ol' || name === 'tr';
    const isBlock = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'li', 'blockquote'].includes(name) || isList;
    if (!isBlock) continue;

    if (closing) {
      if (open > 0) open -= 1;
      // A list item is always its own block: flush on the closing tag so
      // consecutive <li>s never merge into one paragraph.
      if (name === 'li') { flush(); inListItem = false; }
      else if (open === 0) flush();
      continue;
    }

    if (selfClosing) continue;

    if (open === 0) flush();
    open += 1;

    if (name === 'li') { inListItem = true; current = 'bullet'; }
    else if (name === 'h1') current = inListItem ? 'bullet' : 'heading1';
    else if (name === 'h2') current = inListItem ? 'bullet' : 'heading2';
    else if (name === 'h3' || name === 'h4') current = inListItem ? 'bullet' : 'heading3';
    else if (name === 'blockquote') current = inListItem ? 'bullet' : 'quote';
    else if (name === 'p' || name === 'div') current = inListItem ? 'bullet' : 'paragraph';
    // ul/ol/tr only group blocks — they keep the current paragraph role
  }

  flush();
  return blocks;
}

// ─── Diary entries → document blocks ───────────────────────

function plainTextRuns(text: string): DocBlock[] {
  return text
    .split(/\n{2,}|\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => ({ type: 'paragraph' as const, runs: [{ text: line }] }));
}

/** All voice-diary entries as one document. */
export function voiceEntriesToBlocks(entries: DiaryEntry[]): DocBlock[] {
  const blocks: DocBlock[] = [
    { type: 'title', runs: [{ text: 'Voice Diary' }] },
    { type: 'subtitle', runs: [{ text: `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} · transliterated from Telugu` }] },
  ];

  for (const entry of entries) {
    blocks.push({ type: 'heading2', runs: [{ text: `${entry.date} · ${entry.time}` }] });
    blocks.push(...plainTextRuns(entry.romanizedText || '(empty)'));
    if (entry.teluguText) {
      blocks.push({ type: 'heading3', runs: [{ text: 'Telugu original' }] });
      blocks.push({ type: 'quote', runs: [{ text: entry.teluguText }] });
    }
  }
  return blocks;
}

export const voiceEntryToBlocks = (entry: DiaryEntry): DocBlock[] => voiceEntriesToBlocks([entry]);

/** One rich-text diary entry as a document, keeping its formatting. */
export function textEntryToBlocks(entry: TextDiaryEntry, html: string): DocBlock[] {
  return [
    { type: 'title', runs: [{ text: entry.title || 'Untitled' }] },
    { type: 'subtitle', runs: [{ text: `${entry.date} · ${entry.time}` }] },
    ...htmlToBlocks(html),
  ];
}

// ─── Ready-to-use exports ──────────────────────────────────

/** Save one voice entry (or the whole diary) as a document. */
export function exportVoiceEntriesDocx(entries: DiaryEntry[]): Promise<'shared' | 'downloaded'> {
  const name = entries.length === 1
    ? `VoiceDiary_${entries[0].date.replace(/\s+/g, '_')}_${entries[0].time.replace(/[:\s]+/g, '')}`
    : `VoiceDiary_${new Date().toISOString().slice(0, 10)}`;
  return saveDocx(voiceEntriesToBlocks(entries), name);
}

/** Save a rich-text diary entry as a document, keeping its formatting. */
export function exportTextEntryDocx(entry: TextDiaryEntry, html: string): Promise<'shared' | 'downloaded'> {
  return saveDocx(textEntryToBlocks(entry, html), entry.title || 'VoiceDiary');
}
