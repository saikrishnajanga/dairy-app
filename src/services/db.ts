// ═══════════════════════════════════════════════════════════
//  VoiceDiary Pro — IndexedDB Local Persistence Engine
//  Provides robust offline storage for:
//   - Documents (blobs + metadata)
//   - Voice recordings (audio blobs + transcripts)
//   - Autosave drafts
//   - In-app notifications
// ═══════════════════════════════════════════════════════════

const DB_NAME = 'VoiceDiaryDB';
const DB_VERSION = 1;

export interface StoredDocument {
  id: string;
  userId: string;
  name: string;
  fileSize: number;
  mimeType: string;
  category: string;
  createdAt: number;
  updatedAt: number;
  blob?: Blob;
  storagePath?: string;
  remoteUrl?: string;
}

export interface StoredAudioRecording {
  id: string;
  userId: string;
  title: string;
  date: string;
  timestamp: number;
  durationSeconds: number;
  audioBlob?: Blob;
  teluguTranscript: string;
  romanizedTranscript: string;
  synced: boolean;
}

export interface StoredDraft {
  id: string;
  entryId?: string;
  title: string;
  content: string;
  entryDate: string;
  updatedAt: number;
}

export interface AppNotification {
  id: string;
  userId?: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'security';
  timestamp: number;
  read: boolean;
  actionUrl?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('documents')) {
        const docStore = db.createObjectStore('documents', { keyPath: 'id' });
        docStore.createIndex('userId', 'userId', { unique: false });
        docStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('audio_recordings')) {
        const audioStore = db.createObjectStore('audio_recordings', { keyPath: 'id' });
        audioStore.createIndex('userId', 'userId', { unique: false });
        audioStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('notifications')) {
        const notifStore = db.createObjectStore('notifications', { keyPath: 'id' });
        notifStore.createIndex('timestamp', 'timestamp', { unique: false });
        notifStore.createIndex('read', 'read', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── Documents Helpers ─────────────────────────────────────

export async function dbSaveDocument(doc: StoredDocument): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('documents', 'readwrite');
      const store = tx.objectStore('documents');
      const req = store.put(doc);
      let settled = false;

      req.onsuccess = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      req.onerror = () => {
        if (!settled) {
          settled = true;
          reject(req.error || new Error('Put document failed'));
        }
      };
      tx.oncomplete = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      tx.onerror = () => {
        if (!settled) {
          settled = true;
          reject(tx.error || new Error('Transaction failed'));
        }
      };
      tx.onabort = () => {
        if (!settled) {
          settled = true;
          reject(tx.error || new Error('Transaction aborted'));
        }
      };
    } catch (err) {
      reject(err);
    }
  });
}

export async function dbGetDocuments(userId: string): Promise<StoredDocument[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readonly');
    const store = tx.objectStore('documents');
    const index = store.index('userId');
    const req = index.getAll(userId);
    req.onsuccess = () => {
      const docs = req.result as StoredDocument[];
      // Sort newest first
      docs.sort((a, b) => b.createdAt - a.createdAt);
      resolve(docs);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetDocumentById(id: string): Promise<StoredDocument | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readonly');
    const req = tx.objectStore('documents').get(id);
    req.onsuccess = () => resolve(req.result as StoredDocument | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function dbDeleteDocument(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    tx.objectStore('documents').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Audio Recordings Helpers ──────────────────────────────

export async function dbSaveAudioRecording(rec: StoredAudioRecording): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio_recordings', 'readwrite');
    tx.objectStore('audio_recordings').put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbGetAudioRecordings(userId: string): Promise<StoredAudioRecording[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio_recordings', 'readonly');
    const store = tx.objectStore('audio_recordings');
    const index = store.index('userId');
    const req = index.getAll(userId);
    req.onsuccess = () => {
      const recs = req.result as StoredAudioRecording[];
      recs.sort((a, b) => b.timestamp - a.timestamp);
      resolve(recs);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function dbDeleteAudioRecording(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio_recordings', 'readwrite');
    tx.objectStore('audio_recordings').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Drafts Helpers ────────────────────────────────────────

export async function dbSaveDraft(draft: StoredDraft): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite');
    tx.objectStore('drafts').put(draft);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbGetDraft(id: string): Promise<StoredDraft | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readonly');
    const req = tx.objectStore('drafts').get(id);
    req.onsuccess = () => resolve(req.result as StoredDraft | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function dbDeleteDraft(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite');
    tx.objectStore('drafts').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Notifications Helpers ─────────────────────────────────

export async function dbSaveNotification(notif: AppNotification): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notifications', 'readwrite');
    tx.objectStore('notifications').put(notif);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbGetNotifications(): Promise<AppNotification[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notifications', 'readonly');
    const store = tx.objectStore('notifications');
    const req = store.getAll();
    req.onsuccess = () => {
      const list = req.result as AppNotification[];
      list.sort((a, b) => b.timestamp - a.timestamp);
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function dbMarkNotificationRead(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notifications', 'readwrite');
    const store = tx.objectStore('notifications');
    const req = store.get(id);
    req.onsuccess = () => {
      if (req.result) {
        req.result.read = true;
        store.put(req.result);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbMarkAllNotificationsRead(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notifications', 'readwrite');
    const store = tx.objectStore('notifications');
    const req = store.getAll();
    req.onsuccess = () => {
      const list = req.result as AppNotification[];
      for (const item of list) {
        if (!item.read) {
          item.read = true;
          store.put(item);
        }
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbClearAllNotifications(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notifications', 'readwrite');
    tx.objectStore('notifications').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
