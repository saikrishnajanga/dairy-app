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
      await deleteDocument(target);
      showToast(`Deleted "${target.name}"`);
    } catch (err) {
      console.warn('Delete document notice:', err);
      showToast(`Deleted "${target.name}"`);
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
      const [url, blob] = await Promise.all([
        getDocumentUrl(doc),
        getDocumentBlob(doc),
      ]);
      setPreviewUrl(url);
      setPreviewBlob(blob);

      const ext = doc.name.split('.').pop()?.toLowerCase() || '';
      const isReadableDoc =
        ext === 'txt' ||
        ext === 'md' ||
        ext === 'json' ||
        ext === 'csv' ||
        ext === 'log' ||
        ext === 'docx' ||
        ext === 'doc' ||
        ext === 'pdf' ||
        doc.mimeType?.startsWith('text/') ||
        doc.mimeType?.includes('word') ||
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
            text = extracted || '(Word Document: Tap "Edit like Google Doc" to view and edit formatted text)';
          }
          setPreviewText(text);
          setEditedText(text);
        } catch {
          setPreviewText('(Unable to read text content)');
        } finally {
          setIsTextLoading(false);
        }
      }
    } catch (e: any) {
      showToast('Could not open file: ' + (e?.message || e));
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
        ext === 'pdf' ||
        doc.mimeType?.includes('text') ||
        doc.mimeType?.includes('word') ||
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
    if (ext === 'doc' || ext === 'docx' || mime?.includes('word'))
      return { icon: '📘', type: 'word', label: 'Word Document' };
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
            accept={ALLOWED_EXTENSIONS.join(',')}
            onChange={handleFileUpload}
          />
          <button
            type="button"
            className="action-btn upload-doc-btn"
            onClick={() => setShowNewDocModal(true)}
            title="Create a new text note in vault"
            style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
          >
            ➕ New Note
          </button>
          <button
            type="button"
            className="action-btn primary upload-doc-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            title="Upload a PDF, Word document, image, or text file"
          >
            {isUploading ? `Uploading (${uploadPercent}%)…` : '⬆️ Upload File'}
          </button>
        </div>
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
          <div style={{ display: 'flex', gap: '10px', marginTop: 16 }}>
            <button
              type="button"
              className="action-btn primary"
              onClick={() => fileInputRef.current?.click()}
            >
              ⬆️ Upload File
            </button>
            <button
              type="button"
              className="action-btn"
              onClick={() => setShowNewDocModal(true)}
            >
              ➕ Create Note
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
                      className="doc-action-btn primary-action"
                      onClick={() => handleOpenGoogleDocEditor(doc)}
                      title="Open and edit like Google Docs"
                    >
                      📝 Edit Doc
                    </button>
                  )}
                  <button
                    type="button"
                    className="doc-action-btn"
                    onClick={() => handleOpenPreview(doc)}
                    title="Open / Preview document"
                  >
                    👁️ View
                  </button>
                  <button
                    type="button"
                    className="doc-action-btn icon-only"
                    onClick={() => handleDownload(doc)}
                    title="Download file"
                  >
                    ⬇️
                  </button>
                  <button
                    type="button"
                    className="doc-action-btn icon-only"
                    onClick={(e) => handleOpenRename(doc, e)}
                    title="Rename file"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    className="doc-action-btn icon-only danger-action"
                    onClick={() => setDeleteTarget(doc)}
                    title="Delete file"
                  >
                    🗑️
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
                  ← Back
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
                    minWidth: '34px',
                    height: '34px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                  }}
                >
                  ✕
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
                    📝 Edit like Google Doc
                  </button>
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
                      👁️ View
                    </button>
                    <button
                      type="button"
                      className={`doc-mode-btn ${isEditingText ? 'active' : ''}`}
                      onClick={() => {
                        hapticTap();
                        setIsEditingText(true);
                      }}
                    >
                      ✏️ Edit
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
                  ⬇️ Download
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
                        <div className="doc-loading-view" style={{ padding: '60px 20px' }}>
                          <div className="doc-spinner" />
                          <p style={{ marginTop: '12px' }}>Loading PDF document…</p>
                        </div>
                      )}
                    </div>
                  );
                }

                // 3. TEXT & WORD DOCUMENT PREVIEW / INLINE EDITOR
                if (typeInfo.type === 'text' || (typeInfo.type === 'word' && (previewText || isTextLoading))) {
                  if (isTextLoading) {
                    return (
                      <div className="doc-loading-view">
                        <div className="doc-spinner" />
                        <p>Loading document content…</p>
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
                            ✏️ Edit Here
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
                      <div style={{ display: 'flex', gap: '10px', marginTop: 18, justifyContent: 'center' }}>
                        <button
                          type="button"
                          className="action-btn primary"
                          onClick={() => handleDownload(previewDoc)}
                        >
                          ⬇️ Download & Open
                        </button>
                        <button
                          type="button"
                          className="action-btn"
                          onClick={() => handleOpenGoogleDocEditor(previewDoc)}
                        >
                          📝 Open in Google Doc Editor
                        </button>
                        <button
                          type="button"
                          className="action-btn"
                          onClick={(e) => handleOpenRename(previewDoc, e)}
                        >
                          ✏️ Rename
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
          title="Delete Document?"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This file will be permanently removed.`}
          confirmLabel="Delete"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
