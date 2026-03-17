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

  const handleSaveEdit = () => {
    if (editText.trim()) {
      onUpdate(entry.id, editText.trim())
      setEditing(false)
    }
  }

  return (
    <div className={`entry-card ${expanded ? 'expanded' : ''}`}
      onClick={() => { if (!editing) setExpanded(!expanded) }}
    >
      <div className="entry-meta">
        <span className="entry-date">📅 {entry.date}</span>
        <span className="entry-time">🕐 {entry.time}</span>
      </div>

      {editing ? (
        <textarea
          className="entry-edit-input"
          value={editText}
          onChange={e => setEditText(e.target.value)}
          onClick={e => e.stopPropagation()}
          autoFocus
        />
      ) : (
        <div className={`entry-text ${!expanded ? 'truncated' : ''}`}>
          {entry.romanizedText}
        </div>
      )}

      {expanded && entry.teluguText && !editing && (
        <div className="entry-telugu">
          <div className="entry-telugu-label">Telugu Original</div>
          <div className="entry-telugu-text telugu-text">{entry.teluguText}</div>
        </div>
      )}

      {expanded && (
        <div className="entry-actions" onClick={e => e.stopPropagation()}>
          {editing ? (
            <>
              <button className="entry-action-btn edit" onClick={handleSaveEdit}>✅ Save</button>
              <button className="entry-action-btn delete"
                onClick={() => { setEditing(false); setEditText(entry.romanizedText) }}>
                ✖ Cancel
              </button>
            </>
          ) : (
            <>
              <button className="entry-action-btn edit"
                onClick={() => setEditing(true)}>✏️ Edit</button>
              <button className="entry-action-btn share"
                onClick={() => onShare(entry)}>📤 Share</button>
              <button className="entry-action-btn delete"
                onClick={() => onDelete(entry.id)}>🗑️ Delete</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
