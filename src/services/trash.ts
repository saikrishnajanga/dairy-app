import { scopedKey } from './profiles';
import { safeLSWrite } from './utils';
import { dbGetDocumentById, dbSaveDocument, dbDeleteDocument } from './db';
import { addNotification } from './notifications';
import type { TextDiaryEntry } from './textDiary';
import type { DiaryEntry } from './storage';
import type { DocumentItem } from './documents';

export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TRASH_KEY_BASE = 'vd_recycle_bin';

export type TrashItemType = 'note' | 'voice' | 'document';

export interface TrashItem {
  id: string; // unique trash item ID
  originalId: string;
  type: TrashItemType;
  title: string;
  preview: string;
  deletedAt: number; // timestamp ms
  expiresAt: number; // deletedAt + 30 days
  data: any; // payload for recovery
  meta?: {
    fileSize?: number;
    mimeType?: string;
    category?: string;
    date?: string;
    time?: string;
  };
}

function trashKey(): string {
  return scopedKey(TRASH_KEY_BASE);
}

function genId(): string {
  return 'tr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function readTrashRaw(): TrashItem[] {
  try {
    const raw = localStorage.getItem(trashKey());
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeTrashRaw(items: TrashItem[]): void {
  safeLSWrite(trashKey(), JSON.stringify(items));
}

/**
 * Returns all active items in trash, automatically purging any item older than 30 days.
 */
export function getTrashItems(): TrashItem[] {
  const items = readTrashRaw();
  const now = Date.now();
  const valid: TrashItem[] = [];
  const expired: TrashItem[] = [];

  for (const item of items) {
    if (now - item.deletedAt > THIRTY_DAYS_MS) {
      expired.push(item);
    } else {
      valid.push(item);
    }
  }

  // Auto purge expired items permanently in background
  if (expired.length > 0) {
    writeTrashRaw(valid);
    for (const exp of expired) {
      if (exp.type === 'document' && exp.originalId) {
        void dbDeleteDocument(exp.originalId);
      }
    }
  }

  // Sort newest deleted first
  valid.sort((a, b) => b.deletedAt - a.deletedAt);
  return valid;
}

/**
 * Returns total count of items currently in trash.
 */
export function getTrashCount(): number {
  return getTrashItems().length;
}

/**
 * Calculates human-readable days remaining before permanent deletion.
 */
export function getDaysRemaining(item: TrashItem): number {
  const msLeft = (item.deletedAt + THIRTY_DAYS_MS) - Date.now();
  return Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
}

/**
 * Move a text note to the recycle bin.
 */
export function moveNoteToTrash(entry: TextDiaryEntry): TrashItem {
  const now = Date.now();
  const snippet = entry.content.replace(/<[^>]*>/g, '').trim().slice(0, 160) || 'Empty note';
  const trashItem: TrashItem = {
    id: genId(),
    originalId: entry.id,
    type: 'note',
    title: entry.title || 'Untitled Note',
    preview: snippet,
    deletedAt: now,
    expiresAt: now + THIRTY_DAYS_MS,
    data: entry,
    meta: {
      date: entry.entryDate || entry.date,
      time: entry.time,
    },
  };

  const items = getTrashItems();
  items.unshift(trashItem);
  writeTrashRaw(items);

  void addNotification({
    title: '🗑️ Moved to Trash',
    message: `"${trashItem.title}" moved to Recycle Bin (recoverable for 30 days).`,
    type: 'info',
  });

  return trashItem;
}

/**
 * Move a voice diary entry to the recycle bin.
 */
export function moveVoiceToTrash(entry: DiaryEntry): TrashItem {
  const now = Date.now();
  const text = entry.romanizedText || entry.teluguText || 'Voice recording';
  const trashItem: TrashItem = {
    id: genId(),
    originalId: entry.id,
    type: 'voice',
    title: `Voice Entry • ${entry.date} ${entry.time}`,
    preview: text.slice(0, 160),
    deletedAt: now,
    expiresAt: now + THIRTY_DAYS_MS,
    data: entry,
    meta: {
      date: entry.date,
      time: entry.time,
    },
  };

  const items = getTrashItems();
  items.unshift(trashItem);
  writeTrashRaw(items);

  void addNotification({
    title: '🗑️ Moved to Trash',
    message: `Voice recording moved to Recycle Bin (recoverable for 30 days).`,
    type: 'info',
  });

  return trashItem;
}

/**
 * Move a vault document to the recycle bin.
 */
export async function moveDocumentToTrash(doc: DocumentItem): Promise<TrashItem> {
  const now = Date.now();
  
  // Soft delete in IndexedDB by adding deletedAt flag
  const localDoc = await dbGetDocumentById(doc.id);
  if (localDoc) {
    (localDoc as any).deletedAt = now;
    await dbSaveDocument(localDoc);
  }

  const trashItem: TrashItem = {
    id: genId(),
    originalId: doc.id,
    type: 'document',
    title: doc.name,
    preview: `${doc.category} • ${(doc.fileSize / 1024).toFixed(1)} KB`,
    deletedAt: now,
    expiresAt: now + THIRTY_DAYS_MS,
    data: doc,
    meta: {
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      category: doc.category,
    },
  };

  const items = getTrashItems();
  items.unshift(trashItem);
  writeTrashRaw(items);

  void addNotification({
    title: '🗑️ Moved to Trash',
    message: `"${doc.name}" moved to Recycle Bin (recoverable for 30 days).`,
    type: 'info',
  });

  return trashItem;
}

/**
 * Restore an item from the recycle bin back to its original location.
 */
export async function restoreTrashItem(trashId: string): Promise<boolean> {
  const items = getTrashItems();
  const target = items.find(i => i.id === trashId);
  if (!target) return false;

  try {
    if (target.type === 'note') {
      // Dynamic import to avoid circular dependency
      const { getTextEntries } = await import('./textDiary');
      const all = getTextEntries();
      // Ensure restored note is at the beginning
      if (!all.some(e => e.id === target.originalId)) {
        all.unshift(target.data as TextDiaryEntry);
        const { encryptText } = await import('./crypto');
        const encrypted = encryptText(JSON.stringify(all));
        safeLSWrite(scopedKey('vd_text_diary'), encrypted);
      }
    } else if (target.type === 'voice') {
      const { getEntries } = await import('./storage');
      const all = getEntries();
      if (!all.some(e => e.id === target.originalId)) {
        all.unshift(target.data as DiaryEntry);
        const { encryptText } = await import('./crypto');
        const encrypted = encryptText(JSON.stringify(all));
        safeLSWrite(scopedKey('vd_entries'), encrypted);
      }
    } else if (target.type === 'document') {
      const localDoc = await dbGetDocumentById(target.originalId);
      if (localDoc) {
        delete (localDoc as any).deletedAt;
        localDoc.updatedAt = Date.now();
        await dbSaveDocument(localDoc);
      }
    }

    // Remove from trash
    writeTrashRaw(items.filter(i => i.id !== trashId));

    void addNotification({
      title: '♻️ Item Restored',
      message: `"${target.title}" was successfully restored.`,
      type: 'success',
    });

    return true;
  } catch (err) {
    console.error('Failed to restore item:', err);
    return false;
  }
}

/**
 * Permanently delete an item from trash forever.
 */
export async function deleteTrashItemPermanently(trashId: string): Promise<boolean> {
  const items = getTrashItems();
  const target = items.find(i => i.id === trashId);
  if (!target) return false;

  try {
    if (target.type === 'document') {
      await dbDeleteDocument(target.originalId);
    }
    writeTrashRaw(items.filter(i => i.id !== trashId));
    return true;
  } catch (err) {
    console.error('Failed to delete trash item permanently:', err);
    return false;
  }
}

/**
 * Empty the entire recycle bin immediately.
 */
export async function emptyTrash(): Promise<void> {
  const items = getTrashItems();
  for (const item of items) {
    if (item.type === 'document') {
      try {
        await dbDeleteDocument(item.originalId);
      } catch {}
    }
  }
  writeTrashRaw([]);
}
