import type { DiaryEntry as EntryType } from '../services/storage'
import DiaryEntry from './DiaryEntry'

interface Props {
  entries: EntryType[]
  searchQuery: string
  onSearchChange: (q: string) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, text: string) => void
  onShare: (entry: EntryType) => void
}

export default function DiaryList({
  entries, searchQuery, onSearchChange,
  onDelete, onUpdate, onShare,
}: Props) {
  return (
    <div>
      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input
          className="search-input"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search diary entries..."
        />
        {searchQuery && (
          <button className="search-clear" onClick={() => onSearchChange('')}>✕</button>
        )}
      </div>

      {entries.length > 0 && (
        <div className="list-header">
          <span className="entry-count">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
          {searchQuery && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              filtered by "{searchQuery}"
            </span>
          )}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-emoji">📖</div>
          <div className="empty-title">No diary entries yet</div>
          <div className="empty-desc">
            Tap the 🎤 button to start recording<br />your first entry in Telugu
          </div>
        </div>
      ) : (
        entries.map(entry => (
          <DiaryEntry
            key={entry.id}
            entry={entry}
            onDelete={onDelete}
            onUpdate={onUpdate}
            onShare={onShare}
          />
        ))
      )}
    </div>
  )
}
