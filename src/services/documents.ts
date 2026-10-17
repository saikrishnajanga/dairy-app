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
import { saveOrShareFile } from './docExport';
import JSZip from 'jszip';

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
 * Download or share a document to the user's device (works on native Android APK and Web).
 */
export async function downloadDocument(doc: DocumentItem): Promise<void> {
  const blob = await getDocumentBlob(doc);
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  await saveOrShareFile({
    filename: doc.name,
    bytes,
    mime: doc.mimeType || 'application/octet-stream',
    title: doc.name,
    dialogTitle: 'Download or Save Document',
  });
}

/**
 * Retrieve the raw Blob for a document (from IndexedDB or by downloading from cloud).
 */
export async function getDocumentBlob(doc: DocumentItem): Promise<Blob> {
  const local = await dbGetDocumentById(doc.id);
  if (local?.blob) return local.blob;

  const url = await getDocumentUrl(doc);
  const resp = await fetch(url);
  const blob = await resp.blob();

  // Cache in IndexedDB for subsequent offline instant preview
  if (local) {
    local.blob = blob;
    await dbSaveDocument(local);
  }
  return blob;
}

/**
 * Extract plain text / paragraphs from a Word .docx file blob using JSZip.
 */
export async function extractDocxText(blob: Blob): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(blob);
    const docFile = zip.file('word/document.xml');
    if (!docFile) return '';
    const xmlText = await docFile.async('text');
    if (!xmlText) return '';

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    const pNodes = doc.getElementsByTagName('w:p');
    const lines: string[] = [];

    for (let i = 0; i < pNodes.length; i++) {
      const tNodes = pNodes[i].getElementsByTagName('w:t');
      let pText = '';
      for (let j = 0; j < tNodes.length; j++) {
        pText += tNodes[j].textContent || '';
      }
      if (pText.trim()) {
        lines.push(pText.trim());
      }
    }

    if (lines.length > 0) {
      return lines.join('\n\n');
    }
  } catch (err) {
    console.warn('Docx text extraction notice:', err);
  }
  return '';
}

/**
 * Read the text content of a text-based document (.txt, .md, text/*) or Word (.docx).
 */
export async function getDocumentTextContent(doc: DocumentItem): Promise<string> {
  const blob = await getDocumentBlob(doc);
  const ext = doc.name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'docx' || ext === 'doc') {
    const extracted = await extractDocxText(blob);
    if (extracted && extracted.trim()) {
      return extracted;
    }
    return '(Word Document: Use "Edit like Google Doc" to view and edit formatted text)';
  }
  return await blob.text();
}

/**
 * Update the text content of an existing document and persist to IndexedDB & Supabase.
 */
export async function updateDocumentTextContent(
  docId: string,
  newText: string,
  newCategory?: string
): Promise<void> {
  const local = await dbGetDocumentById(docId);
  if (!local) throw new Error('Document not found in vault.');

  const blob = new Blob([newText], { type: local.mimeType || 'text/plain' });
  const now = Date.now();
  local.blob = blob;
  local.fileSize = blob.size;
  local.updatedAt = now;
  if (newCategory) local.category = newCategory;

  await dbSaveDocument(local);

  // Sync updated file to Supabase Storage if authenticated
  if (local.storagePath && isSupabaseConfigured() && getCurrentUserId()) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.storage
          .from('documents')
          .upload(local.storagePath, blob, {
            upsert: true,
            contentType: local.mimeType || 'text/plain',
          });

        await supabase
          .from('documents')
          .update({
            file_size: blob.size,
            category: local.category,
            updated_at: new Date(now).toISOString(),
          })
          .eq('id', docId);
      } catch (e) {
        console.warn('Could not sync updated document to cloud:', e);
      }
    }
  }

  void addNotification({
    title: '📝 Document Saved',
    message: `"${local.name}" was edited and saved (${formatFileSize(blob.size)}).`,
    type: 'success',
  });
}

/**
 * Create a brand new text document directly in the document vault.
 */
export async function createTextDocument(
  name: string,
  content: string,
  category: string = 'Personal'
): Promise<DocumentItem> {
  const safeName = name.trim().endsWith('.txt') ? name.trim() : `${name.trim() || 'Untitled Document'}.txt`;
  const file = new File([content], safeName, { type: 'text/plain' });
  return await uploadDocument(file, category);
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
