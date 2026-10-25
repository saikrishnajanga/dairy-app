import { useState, useEffect, useCallback } from 'react';
import {
  getTextEntries,
  getPublicTextEntries,
  createTextEntry,
  deleteTextEntry,
  searchTextEntries,
  type TextDiaryEntry,
} from '../services/textDiary';
import DatePickerModal from './DatePickerModal';
import FullScreenEditor from './FullScreenEditor';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from '../hooks/useToast';
import { hapticTap } from '../services/utils';
import { moveNoteToTrash } from '../services/trash';
import { TrashIcon } from './Icons';

interface TextDiaryScreenProps {
  onOpenEditor?: (entry: TextDiaryEntry) => void;
}

export default function TextDiaryScreen({ onOpenEditor }: TextDiaryScreenProps = {}) {
  const [entries, setEntries] = useState<TextDiaryEntry[]>([]);
  const [search, setSearch] = useState('');
  const [activeEntry, setActiveEntry] = useState<TextDiaryEntry | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TextDiaryEntry | null>(null);

  const toast = useToast();

  const loadEntries = useCallback(() => {
    // Only show public entries in main notebook; locked entries are in Locked Vault
    const list = search
      ? searchTextEntries(search, false)
      : getPublicTextEntries();
    setEntries(list);
  }, [search]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Click "New Note" -> Open DatePickerModal
  const handleNewNoteClick = () => {
    hapticTap();
    setShowDatePicker(true);
  };

  // Date picked -> Create entry -> Open FullScreenEditor
  const handleProceedNewNote = (entryDate: string, title: string) => {
    setShowDatePicker(false);
    const newEntry = createTextEntry(title, '', entryDate);
    if (onOpenEditor) {
      onOpenEditor(newEntry);
    } else {
      setActiveEntry(newEntry);
    }
  };

  const handleOpenEntry = (entry: TextDiaryEntry) => {
    hapticTap();
    if (onOpenEditor) {
      onOpenEditor(entry);
    } else {
      setActiveEntry(entry);
    }
  };

  const handleDeleteEntry = (entry: TextDiaryEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    hapticTap();
    setConfirmDelete(entry);
  };

  const confirmDeleteAction = () => {
    if (!confirmDelete) return;
    moveNoteToTrash(confirmDelete);
    deleteTextEntry(confirmDelete.id);
    toast.show('🗑️ Moved to Recycle Bin (30-day recovery)');
    setConfirmDelete(null);
    loadEntries();
  };

  // If editor is active, render FullScreenEditor
  if (activeEntry) {
    return (
      <FullScreenEditor
        entry={activeEntry}
        onBack={() => {
          setActiveEntry(null);
          loadEntries();
        }}
        onDelete={() => {
          setActiveEntry(null);
          loadEntries();
        }}
        showToast={toast.show}
      />
    );
  }

  return (
    <div className="tab-content text-diary-screen">
      {/* Header with New Note Action */}
      <div className="notebook-header-row">
        <div>
          <h2 className="notebook-title">✍️ Notebook & Diary</h2>
          <p className="notebook-subtitle">
            Reflective long-form writing with autosave, formatting, and cloud synchronization.
          </p>
        </div>

        <button
          type="button"
          className="action-btn primary new-note-btn"
          onClick={handleNewNoteClick}
        >
          ✍️ New Note
        </button>
      </div>

      {/* Search Bar */}
      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          className="search-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by title, content, or date…"
        />
        {search && (
          <button
            type="button"
            className="search-clear"
            onClick={() => setSearch('')}
          >
            ✕
          </button>
        )}
      </div>

      {/* Entries Feed */}
      {entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-emoji">📓</div>
          <div className="empty-title">
            {search ? 'No matching diary entries' : 'No entries yet'}
          </div>
          <div className="empty-desc">
            Tap "New Note" above to select a date and begin writing your thoughts.
          </div>
          <button
            type="button"
            className="action-btn primary"
            onClick={handleNewNoteClick}
            style={{ marginTop: 16 }}
          >
            Write Your First Note
          </button>
        </div>
      ) : (
        <div className="diary-grid">
          {entries.map(entry => {
            const previewText = entry.content.replace(/<[^>]*>/g, '').trim() || 'Empty entry…';
            return (
              <div
                key={entry.id}
                className="diary-entry-card"
                onClick={() => handleOpenEntry(entry)}
              >
                <div className="entry-header">
                  <span className="entry-date">
                    📅 {entry.entryDate || entry.date}
                  </span>
                  <button
                    type="button"
                    className="entry-delete-btn"
                    onClick={(e) => handleDeleteEntry(entry, e)}
                    title="Move to Recycle Bin"
                  >
                    <TrashIcon size={15} />
                  </button>
                </div>

                <h3 className="entry-title">{entry.title || 'Untitled Entry'}</h3>
                <p className="entry-preview">{previewText.slice(0, 140)}</p>

                <div className="entry-footer">
                  <span className="entry-time">{entry.time}</span>
                  <span className="entry-open-hint">Tap to edit →</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Date Picker Modal */}
      <DatePickerModal
        isOpen={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        onProceed={handleProceedNewNote}
      />

      {/* Delete Confirmation Dialog */}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Entry?"
          message={`Are you sure you want to delete "${confirmDelete.title || 'Untitled Entry'}"?`}
          confirmLabel="Delete"
          onConfirm={confirmDeleteAction}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
