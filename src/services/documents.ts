// ═══════════════════════════════════════════════════════════
//  VoiceDiary Pro — Documents Service
//  Secure document management with Supabase Storage + IndexedDB:
//   - PDF, DOC, DOCX, TXT, Images
//   - Private cloud object storage with signed download URLs
//   - Local IndexedDB fallback for offline resilience
//   - Metadata persistence, rename, search, category tags
// ═══════════════════════════════════════════════════════════

import { getSupabase, isSupabaseConfigured } from './supabase';
import { getCurrentUserId } from './auth';
import {
  dbSaveDocument,
  dbGetDocuments,
  dbGetDocumentById,
  dbDeleteDocument,
  type StoredDocument,
} from './db';
import { genId } from './utils';
import { addNotification } from './notifications';

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB limit
export const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg'];
export const DOCUMENT_CATEGORIES = ['All', 'Personal', 'Work', 'Journal', 'Receipts', 'Other'] as const;

export type DocumentCategory = typeof DOCUMENT_CATEGORIES[number];

export interface DocumentItem {
  id: string;
  userId: string;
  name: string;
  fileSize: number;
  mimeType: string;
  category: string;
  createdAt: number;
  updatedAt: number;
  remoteUrl?: string;
  storagePath?: string;
  hasLocalBlob?: boolean;
}

/** Check if file is supported */
export function validateDocumentFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: 'File size exceeds 25 MB limit.' };
  }
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported file format (${ext}). Supported: PDF, DOC, DOCX, TXT, Images.`,
    };
  }
  return { valid: true };
}

/** Format file size into human-readable string */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Upload a document file.
 * Saves to local IndexedDB and synchronizes to Supabase Storage if authenticated.
 */
export async function uploadDocument(
  file: File,
  category: string = 'Personal',
  onProgress?: (percent: number) => void
): Promise<DocumentItem> {
  const check = validateDocumentFile(file);
  if (!check.valid) throw new Error(check.error);

  const userId = getCurrentUserId() || 'local_user';
  const docId = genId();
  const safeName = file.name.replace(/[^\w.-]/g, '_');
  const storagePath = `${userId}/${docId}_${safeName}`;
  const now = Date.now();

  onProgress?.(25);

  let remoteUrl: string | undefined = undefined;

  // Attempt Supabase Storage upload if online & signed in
  if (isSupabaseConfigured() && getCurrentUserId()) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error: uploadErr } = await supabase.storage
          .from('documents')
          .upload(storagePath, file, {
            cacheControl: '3600',
            upsert: true,
          });

        if (uploadErr) {
          console.warn('Supabase storage upload error:', uploadErr.message);
        } else {
          // Generate a signed URL valid for 1 hour
          const { data: signedData } = await supabase.storage
            .from('documents')
            .createSignedUrl(storagePath, 3600);
          if (signedData?.signedUrl) {
            remoteUrl = signedData.signedUrl;
          }

          // Also save metadata row in table 'documents' if available
          await supabase.from('documents').upsert({
            id: docId,
            user_id: userId,
            name: file.name,
            file_size: file.size,
            mime_type: file.type,
            category: category,
            storage_path: storagePath,
            created_at: new Date(now).toISOString(),
            updated_at: new Date(now).toISOString(),
          }).catch(() => {});
        }
      } catch (err) {
        console.warn('Cloud sync error for document:', err);
      }
    }
  }

  onProgress?.(70);

  // Always save in IndexedDB for reliable offline access & instant preview
  const storedDoc: StoredDocument = {
    id: docId,
    userId,
    name: file.name,
    fileSize: file.size,
    mimeType: file.type,
    category,
    createdAt: now,
    updatedAt: now,
    blob: file,
    storagePath,
    remoteUrl,
  };

  await dbSaveDocument(storedDoc);
  onProgress?.(100);

  // Emit event notification
  void addNotification({
    title: '📄 Document Uploaded',
    message: `"${file.name}" was uploaded successfully (${formatFileSize(file.size)}).`,
    type: 'success',
  });

  return {
    id: docId,
    userId,
    name: file.name,
    fileSize: file.size,
    mimeType: file.type,
    category,
    createdAt: now,
    updatedAt: now,
    remoteUrl,
    storagePath,
    hasLocalBlob: true,
  };
}

/**
 * List all documents for the current user.
 * Merges local IndexedDB records with remote metadata if available.
 */
export async function listDocuments(): Promise<DocumentItem[]> {
  const userId = getCurrentUserId() || 'local_user';
  const localDocs = await dbGetDocuments(userId);

  // If connected to Supabase, sync remote metadata
  if (isSupabaseConfigured() && getCurrentUserId()) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data } = await supabase
          .from('documents')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (data && Array.isArray(data)) {
          // Merge metadata
          const localMap = new Map(localDocs.map(d => [d.id, d]));
          for (const row of data) {
            if (!localMap.has(row.id)) {
              localDocs.push({
                id: row.id,
                userId: row.user_id,
                name: row.name,
                fileSize: row.file_size,
                mimeType: row.mime_type,
                category: row.category || 'Other',
                createdAt: new Date(row.created_at).getTime(),
                updatedAt: new Date(row.updated_at).getTime(),
                storagePath: row.storage_path,
              });
            }
          }
        }
      } catch {
        // Fallback to local
      }
    }
  }

  return localDocs.map(d => ({
    id: d.id,
    userId: d.userId,
    name: d.name,
    fileSize: d.fileSize,
    mimeType: d.mimeType,
    category: d.category,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    remoteUrl: d.remoteUrl,
    storagePath: d.storagePath,
    hasLocalBlob: !!d.blob,
  }));
}

/**
 * Get a downloadable or previewable URL for a document.
 */
export async function getDocumentUrl(doc: DocumentItem): Promise<string> {
  // First check local IndexedDB blob
  const local = await dbGetDocumentById(doc.id);
  if (local?.blob) {
    return URL.createObjectURL(local.blob);
  }

  // If remote storage exists, generate a fresh signed URL
  if (doc.storagePath && isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (supabase) {
      const { data } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.storagePath, 3600);
      if (data?.signedUrl) return data.signedUrl;
    }
  }

  if (doc.remoteUrl) return doc.remoteUrl;
  throw new Error('File content is not available locally or in cloud.');
}

/**
 * Download a document to the user's device.
 */
export async function downloadDocument(doc: DocumentItem): Promise<void> {
  const url = await getDocumentUrl(doc);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (url.startsWith('blob:')) {
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

/**
 * Rename a document.
 */
export async function renameDocument(id: string, newName: string): Promise<void> {
  const local = await dbGetDocumentById(id);
  if (local) {
    local.name = newName.trim();
    local.updatedAt = Date.now();
    await dbSaveDocument(local);
  }

  if (isSupabaseConfigured() && getCurrentUserId()) {
    const supabase = getSupabase();
    if (supabase) {
      await supabase
        .from('documents')
        .update({ name: newName.trim(), updated_at: new Date().toISOString() })
        .eq('id', id)
        .catch(() => {});
    }
  }
}

/**
 * Delete a document from IndexedDB and cloud storage safely.
 */
export async function deleteDocument(doc: DocumentItem): Promise<void> {
  // Always delete locally first
  try {
    await dbDeleteDocument(doc.id);
  } catch (err) {
    console.warn('Local document delete notice:', err);
  }

  // Attempt cloud delete if connected
  if (isSupabaseConfigured() && getCurrentUserId()) {
    try {
      const supabase = getSupabase();
      if (supabase) {
        if (doc.storagePath) {
          try {
            await supabase.storage.from('documents').remove([doc.storagePath]);
          } catch {}
        }
        try {
          await supabase.from('documents').delete().eq('id', doc.id);
        } catch {}
      }
    } catch (err) {
      console.warn('Remote document delete notice:', err);
    }
  }

  try {
    void addNotification({
      title: '🗑️ Document Deleted',
      message: `"${doc.name}" was removed.`,
      type: 'info',
    });
  } catch {}
}
