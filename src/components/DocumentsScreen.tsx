import { useState, useEffect, useRef, useCallback } from 'react';
import {
  listDocuments,
  uploadDocument,
  downloadDocument,
  renameDocument,
  deleteDocument,
  formatFileSize,
  getDocumentUrl,
  getDocumentTextContent,
  extractDocxText,
  getDocumentBlob,
  updateDocumentTextContent,
  createTextDocument,
  DOCUMENT_CATEGORIES,
  ALLOWED_EXTENSIONS,
  type DocumentItem,
  type DocumentCategory,
} from '../services/documents';
import { createTextEntry, type TextDiaryEntry } from '../services/textDiary';
import ConfirmDialog from './ConfirmDialog';
import { hapticTap } from '../services/utils';
import PdfViewer from './PdfViewer';
import { moveDocumentToTrash } from '../services/trash';

// Modern SVG icons for document vault actions
const UploadCloudIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
    <path d="M12 12v9" />
    <path d="m16 16-4-4-4 4" />
  </svg>
);

const PlusIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const ViewEyeIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const DownloadTrayIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const EditPenIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const DocEditIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const TrashDeleteIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const ArrowBackIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const CloseXIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

interface Props {
  showToast: (msg: string) => void;
  onOpenEditor?: (entry: TextDiaryEntry) => void;
}

export default function DocumentsScreen({ showToast, onOpenEditor }: Props) {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);

  // Dialog targets
  const [renameTarget, setRenameTarget] = useState<DocumentItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);

  // Preview & Edit Modal states
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewText, setPreviewText] = useState<string>('');
  const [isTextLoading, setIsTextLoading] = useState(false);
  const [isEditingText, setIsEditingText] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [isSavingDoc, setIsSavingDoc] = useState(false);

  // Create New Document Modal
  const [showNewDocModal, setShowNewDocModal] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [newDocContent, setNewDocContent] = useState('');
  const [newDocCategory, setNewDocCategory] = useState<DocumentCategory>('Personal');
  const [isCreatingDoc, setIsCreatingDoc] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    try {
      const items = await listDocuments();
      setDocs(items);
    } catch (e) {
      console.warn('Could not load documents:', e);
    }
  }, []);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  // Clean up object URLs on modal close or unmount
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadPercent(10);
    hapticTap();

    try {
      const newDoc = await uploadDocument(
        file,
        selectedCategory === 'All' ? 'Personal' : selectedCategory,
        (p) => setUploadPercent(p)
      );
      showToast(`Uploaded "${file.name}"`);
      await loadDocs();
      // Automatically open the uploaded document for immediate preview / edit!
      handleOpenPreview(newDoc);
    } catch (err: unknown) {
      showToast('Upload failed: ' + (err instanceof Error ? err.message : 'Error'));
    } finally {
      setIsUploading(false);
      setUploadPercent(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (doc: DocumentItem) => {
    hapticTap();
    try {
      showToast(`Preparing "${doc.name}"…`);
      await downloadDocument(doc);
    } catch (e: any) {
      showToast('Download failed: ' + (e?.message || e));
    }
  };

  const handleOpenRename = (doc: DocumentItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    hapticTap();
    setRenameTarget(doc);
    setRenameValue(doc.name);
  };

  const handleSaveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;
    hapticTap();
    try {
      await renameDocument(renameTarget.id, renameValue);
      showToast('Renamed document');
      if (previewDoc && previewDoc.id === renameTarget.id) {
        setPreviewDoc({ ...previewDoc, name: renameValue });
      }
      setRenameTarget(null);
      await loadDocs();
    } catch {
      showToast('Could not rename document');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    hapticTap();
    const target = deleteTarget;
    setDeleteTarget(null);
    if (previewDoc?.id === target.id) {
      handleClosePreview();
    }
    try {
      await moveDocumentToTrash(target);
      showToast(`Moved "${target.name}" to Recycle Bin`);
    } catch (err) {
      console.warn('Delete document notice:', err);
      showToast(`Moved "${target.name}" to Recycle Bin`);
    } finally {
      await loadDocs();
    }
  };

  // Open Document in Preview / Edit Modal
  const handleOpenPreview = async (doc: DocumentItem) => {
    hapticTap();
    setPreviewDoc(doc);
    setIsEditingText(false);
    setPreviewText('');
    setEditedText('');
    setPreviewBlob(null);

    try {
      const blob = await getDocumentBlob(doc);
      setPreviewBlob(blob);
      try {
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      } catch {}

      const ext = doc.name.split('.').pop()?.toLowerCase() || '';
      const isReadableDoc =
        ext === 'txt' ||
        ext === 'md' ||
        ext === 'json' ||
        ext === 'csv' ||
        ext === 'log' ||
        ext === 'docx' ||
        ext === 'doc' ||
        ext === 'gdoc' ||
        ext === 'odt' ||
        ext === 'rtf' ||
        ext === 'pdf' ||
        doc.mimeType?.startsWith('text/') ||
        doc.mimeType?.includes('word') ||
        doc.mimeType?.includes('officedocument') ||
        doc.mimeType?.includes('google-apps') ||
        doc.mimeType?.includes('pdf');

      if (isReadableDoc) {
        setIsTextLoading(true);
        try {
          let text = await getDocumentTextContent(doc);
          if (
            text.startsWith('PK\x03\x04') ||
            text.startsWith('PK ') ||
            text.includes('word/numbering.xml') ||
            text.includes('word/document.xml')
          ) {
            const extracted = await extractDocxText(blob);
            text = extracted || '(Word Document: Tap "Edit Doc" or "Open in Google Doc Editor" to view and edit formatted text)';
          }
          setPreviewText(text);
          setEditedText(text);
        } catch {
          setPreviewText('(Unable to read text content - Tap "Edit Doc" to edit directly)');
        } finally {
          setIsTextLoading(false);
        }
      }
    } catch (e: any) {
      console.warn('Could not open file preview:', e);
      showToast('Could not load file: ' + (e?.message || e));
    }
  };

  const handleClosePreview = () => {
    hapticTap();
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewDoc(null);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setPreviewText('');
    setEditedText('');
    setIsEditingText(false);
  };

  // Save Text Edits to Document
  const handleSaveTextChanges = async () => {
    if (!previewDoc) return;
    hapticTap();
    setIsSavingDoc(true);
    try {
      await updateDocumentTextContent(previewDoc.id, editedText);
      setPreviewText(editedText);
      setIsEditingText(false);
      showToast('Saved changes to document');
      await loadDocs();
    } catch (e: any) {
      showToast('Could not save changes: ' + (e?.message || e));
    } finally {
      setIsSavingDoc(false);
    }
  };

  // Open any uploaded document directly in Google Docs-style Rich Text Editor
  const handleOpenGoogleDocEditor = async (doc: DocumentItem) => {
    hapticTap();
    try {
      showToast('Opening in Google Doc Editor…');
      let text = '';
      const ext = doc.name.split('.').pop()?.toLowerCase() || '';
      if (
        ext === 'txt' ||
        ext === 'md' ||
        ext === 'docx' ||
        ext === 'doc' ||
        ext === 'gdoc' ||
        ext === 'odt' ||
        ext === 'rtf' ||
        ext === 'pdf' ||
        doc.mimeType?.includes('text') ||
        doc.mimeType?.includes('word') ||
        doc.mimeType?.includes('officedocument') ||
        doc.mimeType?.includes('google-apps') ||
        doc.mimeType?.includes('pdf')
      ) {
        text = await getDocumentTextContent(doc);
        if (
          text.startsWith('PK\x03\x04') ||
          text.startsWith('PK ') ||
          text.includes('word/numbering.xml') ||
          text.includes('word/document.xml')
        ) {
          const blob = await getDocumentBlob(doc);
          const extracted = await extractDocxText(blob);
          text = extracted || '';
        }
      } else {
        text = previewText || '';
      }

      const cleanTitle = doc.name.replace(/\.[^/.]+$/, '');
      const paragraphs = text
        ? text
            .split(/\n\n+/)
            .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
            .join('')
        : `<p>Start writing and editing "${doc.name}" here…</p>`;

      const entry = createTextEntry(cleanTitle, paragraphs);
      if (onOpenEditor) {
        handleClosePreview();
        onOpenEditor(entry);
      } else {
        showToast('Document opened in Diary Notebook!');
      }
    } catch (e: any) {
      showToast('Could not open editor: ' + (e?.message || e));
    }
  };

  // Send Text Document to Diary Entry
  const handleSendToDiary = () => {
    if (!previewDoc || !previewText) return;
    hapticTap();
    try {
      const cleanTitle = previewDoc.name.replace(/\.[^/.]+$/, '');
      createTextEntry(cleanTitle, previewText);
      showToast('🎉 Document text saved into your Diary Notebook!');
    } catch {
      showToast('Could not create diary entry');
    }
  };

  // Create Brand New Text Document
  const handleCreateNewDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocName.trim()) return;
    hapticTap();
    setIsCreatingDoc(true);
    try {
      const created = await createTextDocument(newDocName, newDocContent, newDocCategory);
      showToast(`Created document "${created.name}"`);
      setShowNewDocModal(false);
      setNewDocName('');
      setNewDocContent('');
      await loadDocs();
      handleOpenPreview(created);
    } catch (err: any) {
      showToast('Failed to create document: ' + (err?.message || err));
    } finally {
      setIsCreatingDoc(false);
    }
  };

  // Copy text to clipboard
  const handleCopyDocText = async () => {
    const textToCopy = isEditingText ? editedText : previewText;
    if (!textToCopy) return;
    hapticTap();
    try {
      await navigator.clipboard.writeText(textToCopy);
      showToast('📋 Copied text to clipboard');
    } catch {
      showToast('Could not copy text');
    }
  };

  // Filtered documents
  const filteredDocs = docs.filter((doc) => {
    const matchesCategory = selectedCategory === 'All' || doc.category === selectedCategory;
    const matchesSearch =
      !searchQuery.trim() ||
      doc.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
    return matchesCategory && matchesSearch;
  });

  const getDocTypeInfo = (name: string, mime: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf' || mime?.includes('pdf')) return { icon: '📕', type: 'pdf', label: 'PDF Document' };
    if (
      ext === 'doc' ||
      ext === 'docx' ||
      ext === 'gdoc' ||
      ext === 'odt' ||
      ext === 'rtf' ||
      mime?.includes('word') ||
      mime?.includes('officedocument') ||
      mime?.includes('google-apps')
    )
      return { icon: '📘', type: 'word', label: ext === 'gdoc' || mime?.includes('google-apps') ? 'Google Doc' : 'Word Document' };
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp' || mime?.includes('image'))
      return { icon: '🖼️', type: 'image', label: 'Image' };
    if (ext === 'txt' || ext === 'md' || ext === 'json' || ext === 'csv' || mime?.includes('text'))
      return { icon: '📄', type: 'text', label: 'Text Note' };
    return { icon: '📁', type: 'other', label: 'File' };
  };

  return (
    <div className="tab-content documents-screen">
      {/* Header and Upload Actions */}
      <div className="documents-header">
        <div className="documents-header-text">
          <h2 className="documents-title">📁 Document Vault</h2>
          <p className="documents-subtitle">
            Securely store, organize, preview, and edit your PDF, Word, and text documents.
          </p>
        </div>

        <div className="documents-upload-actions">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".pdf,.doc,.docx,.gdoc,.odt,.rtf,.txt,.md,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.google-apps.document,application/vnd.oasis.opendocument.text,application/rtf,text/rtf,text/plain,image/*"
            onChange={handleFileUpload}
          />
          <button
            type="button"
            className="vault-new-note-btn"
            onClick={() => setShowNewDocModal(true)}
            title="Create a new text note in vault"
          >
            <PlusIcon size={16} />
            <span>New Note</span>
          </button>
          <button
            type="button"
            className="vault-upload-btn-bright"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            title="Upload a Google Doc, Word document, PDF, image, or text file"
          >
            <UploadCloudIcon size={19} />
            <span>{isUploading ? `Uploading (${uploadPercent}%)…` : 'Upload File'}</span>
          </button>
        </div>
      </div>

      {/* Helpful Google Docs & Word Support Tip */}
      <div
        className="vault-helper-strip"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 14px',
          background: 'var(--surface-raised)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          margin: '-8px 0 12px',
        }}
      >
        <span>💡</span>
        <span>
          <strong>Google Docs & Word:</strong> Supports <code>.docx</code>, <code>.doc</code>, <code>.gdoc</code>, <code>.odt</code>, and <code>.pdf</code>. (From Google Docs, you can also click <em>File → Download → Microsoft Word (.docx)</em> to edit offline.)
        </span>
      </div>

      {isUploading && (
        <div className="upload-progress-container">
          <div className="upload-progress-bar" style={{ width: `${uploadPercent}%` }} />
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="documents-toolbar">
        <div className="category-pills" role="tablist" aria-label="Document Categories">
          {DOCUMENT_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`category-pill ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="search-bar doc-search-bar">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search documents by name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear"
              onClick={() => setSearchQuery('')}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Documents Grid / Empty State */}
      {filteredDocs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-emoji">📂</div>
          <div className="empty-title">
            {searchQuery ? 'No matching documents' : 'No documents in this folder'}
          </div>
          <div className="empty-desc">
            Upload PDF, DOCX, Word, Images, or write notes to link them with your reflections.
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              type="button"
              className="vault-upload-btn-bright"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloudIcon size={18} />
              <span>Upload File</span>
            </button>
            <button
              type="button"
              className="vault-new-note-btn"
              onClick={() => setShowNewDocModal(true)}
            >
              <PlusIcon size={16} />
              <span>Create Note</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="documents-grid">
          {filteredDocs.map((doc) => {
            const info = getDocTypeInfo(doc.name, doc.mimeType);
            const isEditable = info.type === 'text' || info.type === 'word' || info.type === 'pdf';

            return (
              <div
                key={doc.id}
                className="document-card"
                onClick={() => handleOpenPreview(doc)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleOpenPreview(doc);
                  }
                }}
              >
                <div className="doc-card-top">
                  <span className="doc-icon-badge">{info.icon}</span>
                  <span className="doc-category-badge">{doc.category}</span>
                </div>

                <div className="doc-info">
                  <h4 className="doc-name" title={doc.name}>
                    {doc.name}
                  </h4>
                  <div className="doc-meta-row">
                    <span className="doc-size">{formatFileSize(doc.fileSize)}</span>
                    <span className="doc-meta-sep">•</span>
                    <span className="doc-date">
                      {new Date(doc.updatedAt || doc.createdAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                <div className="doc-actions-row" onClick={(e) => e.stopPropagation()}>
                  {isEditable && (
                    <button
                      type="button"
                      className="doc-action-btn primary-action edit-doc-action"
                      onClick={() => handleOpenGoogleDocEditor(doc)}
                      title="Open and edit like Google Docs"
                    >
                      <DocEditIcon size={14} />
                      <span>Edit Doc</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="doc-action-btn view-action"
                    onClick={() => handleOpenPreview(doc)}
                    title="Open / Preview document"
                  >
                    <ViewEyeIcon size={14} />
                    <span>View</span>
                  </button>
                  <button
                    type="button"
                    className="doc-action-btn icon-only download-action"
                    onClick={() => handleDownload(doc)}
                    title="Download file"
                  >
                    <DownloadTrayIcon size={15} />
                  </button>
                  <button
                    type="button"
                    className="doc-action-btn icon-only rename-action"
                    onClick={(e) => handleOpenRename(doc, e)}
                    title="Rename file"
                  >
                    <EditPenIcon size={15} />
                  </button>
                  <button
                    type="button"
                    className="doc-action-btn icon-only danger-action delete-action"
                    onClick={() => setDeleteTarget(doc)}
                    title="Delete document"
                  >
                    <TrashDeleteIcon size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── FULL DOCUMENT PREVIEW & EDITOR MODAL ─── */}
      {previewDoc && (
        <div className="doc-preview-overlay" onClick={handleClosePreview}>
          <div
            className="doc-preview-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="doc-preview-title"
          >
            {/* Modal Header */}
            <div className="doc-preview-header">
              {/* Top Row: Back button, Title & Icon, Close button */}
              <div className="doc-preview-top-row">
                <button
                  type="button"
                  className="doc-preview-back-btn"
                  onClick={handleClosePreview}
                  title="Back to documents"
                >
                  <ArrowBackIcon size={16} />
                  <span>Back</span>
                </button>

                <div className="doc-preview-title-wrap">
                  <span className="doc-preview-icon">
                    {getDocTypeInfo(previewDoc.name, previewDoc.mimeType).icon}
                  </span>
                  <div className="doc-preview-meta">
                    <h3 id="doc-preview-title" className="doc-preview-title" title={previewDoc.name}>
                      {previewDoc.name}
                    </h3>
                    <div className="doc-preview-sub">
                      <span className="doc-badge-chip">{previewDoc.category}</span>
                      <span>•</span>
                      <span>{formatFileSize(previewDoc.fileSize)}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="doc-header-btn close-doc-btn"
                  onClick={handleClosePreview}
                  title="Close preview"
                  style={{
                    flexShrink: 0,
                    width: '34px',
                    height: '34px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                    padding: 0,
                  }}
                >
                  <CloseXIcon size={16} />
                </button>
              </div>

              {/* Action Toolbar Row */}
              <div className="doc-preview-top-actions">
                {/* Google Doc Editor Launch Button */}
                {(getDocTypeInfo(previewDoc.name, previewDoc.mimeType).type === 'text' ||
                  getDocTypeInfo(previewDoc.name, previewDoc.mimeType).type === 'word' ||
                  getDocTypeInfo(previewDoc.name, previewDoc.mimeType).type === 'pdf') && (
                  <button
                    type="button"
                    className="doc-header-btn primary-doc-btn"
                    onClick={() => handleOpenGoogleDocEditor(previewDoc)}
                    title="Open in full Google Docs-style rich text editor with full toolbar"
                    style={{
                      background: 'var(--primary-gradient)',
                      color: 'var(--text-inverse)',
                      fontWeight: 700,
                      border: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <DocEditIcon size={15} />
                    <span>Edit Doc</span>
                  </button>
                )}

                {/* Direct Google Docs web link if link found */}
                {previewText.includes('docs.google.com') && (
                  <a
                    href={previewText.match(/https:\/\/docs\.google\.com\/[^\s\)]+/)?.[0] || 'https://docs.google.com'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="doc-header-btn"
                    style={{
                      background: 'rgba(66, 133, 244, 0.15)',
                      color: '#4285f4',
                      border: '1px solid #4285f4',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      textDecoration: 'none',
                    }}
                  >
                    🌐 Open in Google Docs
                  </a>
                )}

                {/* Text View / Edit mode toggle */}
                {(getDocTypeInfo(previewDoc.name, previewDoc.mimeType).type === 'text' ||
                  (getDocTypeInfo(previewDoc.name, previewDoc.mimeType).type === 'word' && previewText)) && (
                  <div className="doc-mode-toggle" style={{ flexShrink: 0 }}>
                    <button
                      type="button"
                      className={`doc-mode-btn ${!isEditingText ? 'active' : ''}`}
                      onClick={() => {
                        hapticTap();
                        setIsEditingText(false);
                      }}
                    >
                      <ViewEyeIcon size={13} />
                      <span style={{ marginLeft: 4 }}>View</span>
                    </button>
                    <button
                      type="button"
                      className={`doc-mode-btn ${isEditingText ? 'active' : ''}`}
                      onClick={() => {
                        hapticTap();
                        setIsEditingText(true);
                      }}
                    >
                      <EditPenIcon size={13} />
                      <span style={{ marginLeft: 4 }}>Edit</span>
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  className="doc-header-btn"
                  onClick={() => handleDownload(previewDoc)}
                  title="Download file"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <DownloadTrayIcon size={15} />
                  <span>Download</span>
                </button>
              </div>
            </div>

            {/* Modal Body: Type-Specific Viewer & Editor */}
            <div className="doc-preview-body">
              {(() => {
                const typeInfo = getDocTypeInfo(previewDoc.name, previewDoc.mimeType);

                // 1. IMAGE PREVIEW
                if (typeInfo.type === 'image' && previewUrl) {
                  return (
                    <div className="doc-image-viewport">
                      <img
                        src={previewUrl}
                        alt={previewDoc.name}
                        className="doc-image-preview"
                      />
                    </div>
                  );
                }

                // 2. PDF PREVIEW (Cross-Platform High-Res Canvas via PDF.js)
                if (typeInfo.type === 'pdf') {
                  return (
                    <div className="doc-pdf-viewport">
                      {previewBlob ? (
                        <PdfViewer
                          blob={previewBlob}
                          fileName={previewDoc.name}
                          onOpenEditor={() => handleOpenGoogleDocEditor(previewDoc)}
                          onDownload={() => handleDownload(previewDoc)}
                        />
                      ) : (
                        <div className="doc-loading-view" style={{ padding: '60px 20px', textAlign: 'center' }}>
                          <div className="doc-spinner" />
                          <p style={{ marginTop: '12px' }}>Loading PDF document…</p>
                          <button
                            type="button"
                            className="action-btn primary"
                            style={{ marginTop: '16px' }}
                            onClick={() => handleDownload(previewDoc)}
                          >
                            <DownloadTrayIcon size={15} style={{ marginRight: 6 }} />
                            <span>Download PDF Directly</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }

                // 3. TEXT & WORD DOCUMENT PREVIEW / INLINE EDITOR
                if (typeInfo.type === 'text' || typeInfo.type === 'word') {
                  if (isTextLoading) {
                    return (
                      <div className="doc-loading-view" style={{ padding: '60px 20px' }}>
                        <div className="doc-spinner" />
                        <p style={{ marginTop: '12px' }}>
                          {typeInfo.type === 'word' ? 'Extracting Word document text…' : 'Loading document content…'}
                        </p>
                      </div>
                    );
                  }

                  if (isEditingText) {
                    return (
                      <div className="doc-editor-view">
                        <div className="doc-editor-toolbar">
                          <span className="doc-stats">
                            {editedText.length} chars •{' '}
                            {editedText.trim() ? editedText.trim().split(/\s+/).length : 0} words
                          </span>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="action-btn"
                              onClick={handleCopyDocText}
                            >
                              📋 Copy
                            </button>
                            <button
                              type="button"
                              className="action-btn"
                              onClick={() => handleOpenGoogleDocEditor(previewDoc)}
                              style={{ background: 'var(--primary-soft)', color: 'var(--primary-text)' }}
                            >
                              🚀 Open in Google Doc Editor
                            </button>
                            <button
                              type="button"
                              className="action-btn primary"
                              onClick={handleSaveTextChanges}
                              disabled={isSavingDoc}
                            >
                              {isSavingDoc ? 'Saving…' : '💾 Save Changes'}
                            </button>
                          </div>
                        </div>
                        {typeInfo.type === 'word' && (
                          <div style={{
                            padding: '8px 12px',
                            background: 'rgba(59, 130, 246, 0.08)',
                            border: '1px solid rgba(59, 130, 246, 0.25)',
                            borderRadius: '6px',
                            fontSize: '12px',
                            color: 'var(--text)',
                            margin: '8px 14px 0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            flexWrap: 'wrap',
                          }}>
                            <span>📘 <strong>Word Document:</strong> Extracted plain text. For rich formatting (bold, headings, bullet points), tap <strong>"Open in Google Doc Editor"</strong>!</span>
                          </div>
                        )}
                        <textarea
                          className="doc-editor-textarea"
                          value={editedText}
                          onChange={(e) => setEditedText(e.target.value)}
                          placeholder="Type or edit your document text here…"
                          autoFocus
                        />
                      </div>
                    );
                  }

                  // Read-only text / Word viewer
                  return (
                    <div className="doc-text-view">
                      <div className="doc-editor-toolbar">
                        <span className="doc-stats">
                          {previewText.length} chars •{' '}
                          {previewText.trim() ? previewText.trim().split(/\s+/).length : 0} words
                        </span>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="action-btn"
                            onClick={handleCopyDocText}
                          >
                            📋 Copy Text
                          </button>
                          <button
                            type="button"
                            className="action-btn"
                            onClick={() => setIsEditingText(true)}
                          >
                            <EditPenIcon size={14} style={{ marginRight: 6 }} />
                            <span>Edit Here</span>
                          </button>
                          <button
                            type="button"
                            className="action-btn primary"
                            onClick={() => handleOpenGoogleDocEditor(previewDoc)}
                          >
                            🚀 Open in Google Doc Editor
                          </button>
                          <button
                            type="button"
                            className="action-btn"
                            onClick={handleSendToDiary}
                            title="Import this text into your personal Diary"
                          >
                            ✍️ Save to Diary
                          </button>
                        </div>
                      </div>
                      <pre className="doc-text-content">{previewText || '(Empty document)'}</pre>
                    </div>
                  );
                }

                // 4. OTHER GENERIC FILE TYPES
                return (
                  <div className="doc-generic-view">
                    <div className="doc-generic-card">
                      <div className="doc-generic-icon">{typeInfo.icon}</div>
                      <h4 className="doc-generic-name">{previewDoc.name}</h4>
                      <p className="doc-generic-desc">
                        {typeInfo.label} • {formatFileSize(previewDoc.fileSize)}
                      </p>
                      <p className="doc-generic-help">
                        This file format is ready for download or external viewing in Microsoft Word or Google Docs.
                      </p>
                      <div style={{ display: 'flex', gap: '8px', marginTop: 18, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="action-btn primary"
                          onClick={() => handleDownload(previewDoc)}
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          <DownloadTrayIcon size={15} style={{ marginRight: 6 }} />
                          <span>Download & Open</span>
                        </button>
                        <button
                          type="button"
                          className="action-btn"
                          onClick={() => handleOpenGoogleDocEditor(previewDoc)}
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          <DocEditIcon size={14} style={{ marginRight: 6 }} />
                          <span>Open in Google Doc Editor</span>
                        </button>
                        <button
                          type="button"
                          className="action-btn"
                          onClick={(e) => handleOpenRename(previewDoc, e)}
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          <EditPenIcon size={14} style={{ marginRight: 6 }} />
                          <span>Rename</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ─── CREATE NEW TEXT DOCUMENT MODAL ─── */}
      {showNewDocModal && (
        <div className="pin-overlay" onClick={() => setShowNewDocModal(false)}>
          <div className="pin-modal new-doc-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirm-title">📄 Create New Text Note</h3>
            <p className="documents-subtitle" style={{ margin: '6px 0 16px' }}>
              Create an editable document directly in your vault.
            </p>
            <form onSubmit={handleCreateNewDoc}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Document Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Project Idea.txt"
                  className="date-picker-input text-input"
                  value={newDocName}
                  onChange={(e) => setNewDocName(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Category
                </label>
                <select
                  className="date-picker-input text-input"
                  value={newDocCategory}
                  onChange={(e) => setNewDocCategory(e.target.value as DocumentCategory)}
                >
                  {DOCUMENT_CATEGORIES.filter((c) => c !== 'All').map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Content
                </label>
                <textarea
                  className="date-picker-input text-input"
                  style={{ minHeight: 140, resize: 'vertical', fontFamily: 'inherit' }}
                  placeholder="Write note contents here…"
                  value={newDocContent}
                  onChange={(e) => setNewDocContent(e.target.value)}
                />
              </div>

              <div className="pin-actions">
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => setShowNewDocModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="action-btn primary"
                  disabled={isCreatingDoc || !newDocName.trim()}
                >
                  {isCreatingDoc ? 'Creating…' : 'Create & Open'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Dialog */}
      {renameTarget && (
        <div className="pin-overlay" onClick={() => setRenameTarget(null)}>
          <div className="pin-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirm-title">Rename Document</h3>
            <form onSubmit={handleSaveRename}>
              <div className="date-picker-field" style={{ margin: '16px 0' }}>
                <input
                  type="text"
                  required
                  className="date-picker-input text-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="pin-actions">
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => setRenameTarget(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="action-btn primary">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <ConfirmDialog
          title="Move to Recycle Bin?"
          message={`Are you sure you want to delete "${deleteTarget.name}"? It will be kept in the Recycle Bin and can be recovered within 30 days.`}
          confirmLabel="Move to Bin"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
