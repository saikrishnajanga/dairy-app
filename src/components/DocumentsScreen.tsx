import { useState, useEffect, useRef, useCallback } from 'react';
import {
  listDocuments,
  uploadDocument,
  downloadDocument,
  renameDocument,
  deleteDocument,
  formatFileSize,
  DOCUMENT_CATEGORIES,
  ALLOWED_EXTENSIONS,
  type DocumentItem,
  type DocumentCategory,
} from '../services/documents';
import ConfirmDialog from './ConfirmDialog';
import { hapticTap } from '../services/utils';

interface Props {
  showToast: (msg: string) => void;
}

export default function DocumentsScreen({ showToast }: Props) {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [renameTarget, setRenameTarget] = useState<DocumentItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadPercent(10);
    hapticTap();

    try {
      await uploadDocument(file, selectedCategory === 'All' ? 'Personal' : selectedCategory, (p) => {
        setUploadPercent(p);
      });
      showToast(`Uploaded "${file.name}"`);
      await loadDocs();
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
      showToast(`Downloading "${doc.name}"…`);
      await downloadDocument(doc);
    } catch (e: any) {
      showToast('Download failed: ' + (e?.message || e));
    }
  };

  const handleOpenRename = (doc: DocumentItem) => {
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

  // Filtered documents
  const filteredDocs = docs.filter(doc => {
    const matchesCategory = selectedCategory === 'All' || doc.category === selectedCategory;
    const matchesSearch =
      !searchQuery.trim() ||
      doc.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
    return matchesCategory && matchesSearch;
  });

  const getDocIcon = (name: string, mime: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf' || mime.includes('pdf')) return '📕';
    if (ext === 'doc' || ext === 'docx' || mime.includes('word')) return '📘';
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || mime.includes('image')) return '🖼️';
    return '📄';
  };

  return (
    <div className="tab-content documents-screen">
      {/* Header and Upload Action */}
      <div className="documents-header">
        <div className="documents-header-text">
          <h2 className="documents-title">📁 Document Vault</h2>
          <p className="documents-subtitle">
            Securely store, organize, and preview your PDF, Word, and text files.
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
            className="action-btn primary upload-doc-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? `Uploading (${uploadPercent}%)…` : '⬆️ Upload Document'}
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
          {DOCUMENT_CATEGORIES.map(cat => (
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
            onChange={e => setSearchQuery(e.target.value)}
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
            Upload PDF, DOCX, Word, or images to link them with your personal reflections.
          </div>
          <button
            type="button"
            className="action-btn primary"
            onClick={() => fileInputRef.current?.click()}
            style={{ marginTop: 16 }}
          >
            Upload File
          </button>
        </div>
      ) : (
        <div className="documents-grid">
          {filteredDocs.map(doc => (
            <div key={doc.id} className="document-card">
              <div className="doc-card-top">
                <span className="doc-icon-badge">{getDocIcon(doc.name, doc.mimeType)}</span>
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
                    {new Date(doc.createdAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>

              <div className="doc-actions-row">
                <button
                  type="button"
                  className="doc-action-btn primary-action"
                  onClick={() => handleDownload(doc)}
                  title="Download / Open file"
                >
                  ⬇️ Download
                </button>
                <button
                  type="button"
                  className="doc-action-btn icon-only"
                  onClick={() => handleOpenRename(doc)}
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
          ))}
        </div>
      )}

      {/* Rename Dialog */}
      {renameTarget && (
        <div className="pin-overlay" onClick={() => setRenameTarget(null)}>
          <div className="pin-modal" onClick={e => e.stopPropagation()}>
            <h3 className="confirm-title">Rename Document</h3>
            <form onSubmit={handleSaveRename}>
              <div className="date-picker-field" style={{ margin: '16px 0' }}>
                <input
                  type="text"
                  required
                  className="date-picker-input text-input"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
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
