import { useState } from 'react'
import type { DiaryEntry as EntryType } from '../services/storage'

interface Props {
  entry: EntryType
  onDelete: (id: string) => void
  onUpdate: (id: string, text: string) => void
  onShare: (entry: EntryType) => void
}

export default function DiaryEntry({ entry, onDelete, onUpdate, onShare }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(entry.romanizedText)

  // Derive a title from the first line of text
  const title = entry.romanizedText.split(/[.\n]/)[0]?.slice(0, 40) || 'Untitled'

  const handleSaveEdit = () => {
    if (editText.trim()) {
      onUpdate(entry.id, editText.trim())
      setEditing(false)
    }
  }

  return (
    <>
      {/* Grid card — square preview */}
      <div
        className="grid-card"
        onClick={() => { if (!editing) setExpanded(true) }}
      >
        <div className="grid-card-date">📅 {entry.date}</div>
        <div className="grid-card-title">{title}</div>
        <div className="grid-card-preview">
          {entry.romanizedText}
        </div>
        <div className="grid-card-time">🕐 {entry.time}</div>
      </div>

      {/* Expanded detail modal */}
      {expanded && (
        <div className="entry-overlay" onClick={() => { if (!editing) setExpanded(false) }}>
          <div className="entry-detail" onClick={e => e.stopPropagation()}>
            <div className="entry-detail-header">
              <div>
                <span className="entry-date">📅 {entry.date}</span>
                <span className="entry-time" style={{ marginLeft: 12 }}>🕐 {entry.time}</span>
              </div>
              <button className="entry-close-btn" onClick={() => setExpanded(false)}>✕</button>
            </div>

            {editing ? (
              <textarea
                className="entry-edit-input"
                value={editText}
                onChange={e => setEditText(e.target.value)}
                autoFocus
              />
            ) : (
              <div className="entry-text">{entry.romanizedText}</div>
            )}

            {entry.teluguText && !editing && (
              <div className="entry-telugu">
                <div className="entry-telugu-label">Telugu Original</div>
                <div className="entry-telugu-text telugu-text">{entry.teluguText}</div>
              </div>
            )}

            <div className="entry-actions">
              {editing ? (
                <>
                  <button className="modern-btn save" onClick={handleSaveEdit}>
                    <span className="btn-icon">💾</span> Save
                  </button>
                  <button className="modern-btn cancel"
                    onClick={() => { setEditing(false); setEditText(entry.romanizedText) }}>
                    <span className="btn-icon">✕</span> Cancel
                  </button>
                </>
              ) : (
                <>
                  <button className="modern-btn edit" onClick={() => setEditing(true)}>
                    <span className="btn-icon">✏️</span> Edit
                  </button>
                  <button className="modern-btn share" onClick={() => onShare(entry)}>
                    <span className="btn-icon">📤</span> Share
                  </button>
                  <button className="modern-btn delete" onClick={() => { onDelete(entry.id); setExpanded(false) }}>
                    <span className="btn-icon">🗑️</span> Delete
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
