import { useState, useEffect, useRef, useCallback } from 'react'
import {
  createTextEntry, getTextEntries, updateTextEntry, deleteTextEntry,
  searchTextEntries, type TextDiaryEntry,
} from '../services/textDiary'

export default function TextDiaryScreen() {
  const [entries, setEntries] = useState<TextDiaryEntry[]>([])
  const [search, setSearch] = useState('')
  const [activeEntry, setActiveEntry] = useState<TextDiaryEntry | null>(null)
  const [title, setTitle] = useState('')
  const [toast, setToast] = useState('')
  const editorRef = useRef<HTMLDivElement>(null)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>()

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000) }

  const loadEntries = useCallback(() => {
    setEntries(search ? searchTextEntries(search) : getTextEntries())
  }, [search])

  useEffect(() => { loadEntries() }, [loadEntries])

  // Auto-save every 30 seconds
  useEffect(() => {
    if (!activeEntry) return
    autoSaveTimer.current = setInterval(() => {
      if (editorRef.current && activeEntry) {
        updateTextEntry(activeEntry.id, {
          title: title || 'Untitled',
          content: editorRef.current.innerHTML,
        })
        showToast('💾 Auto-saved')
      }
    }, 30000)
    return () => clearInterval(autoSaveTimer.current)
  }, [activeEntry, title])

  const handleNew = () => {
    const entry = createTextEntry('Untitled Entry', '')
    setActiveEntry(entry); setTitle(entry.title)
    loadEntries()
    setTimeout(() => editorRef.current?.focus(), 100)
  }

  const handleOpen = (entry: TextDiaryEntry) => {
    // Save current before switching
    if (activeEntry && editorRef.current) {
      updateTextEntry(activeEntry.id, { title, content: editorRef.current.innerHTML })
    }
    setActiveEntry(entry); setTitle(entry.title)
    setTimeout(() => {
      if (editorRef.current) editorRef.current.innerHTML = entry.content
    }, 50)
  }

  const handleSave = () => {
    if (!activeEntry || !editorRef.current) return
    updateTextEntry(activeEntry.id, {
      title: title || 'Untitled',
      content: editorRef.current.innerHTML,
    })
    loadEntries()
    showToast('✅ Saved!')
  }

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    deleteTextEntry(id)
    if (activeEntry?.id === id) { setActiveEntry(null); setTitle('') }
    loadEntries()
    showToast('🗑️ Deleted')
  }

  const handleBack = () => {
    if (activeEntry && editorRef.current) {
      updateTextEntry(activeEntry.id, { title, content: editorRef.current.innerHTML })
      loadEntries()
    }
    setActiveEntry(null); setTitle('')
  }

  const execCmd = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
  }

  const handleExport = () => {
    if (!activeEntry || !editorRef.current) return
    const text = `${title}\n${'='.repeat(title.length)}\n\n${editorRef.current.innerText}`
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${title.replace(/\s+/g, '_')}.txt`; a.click()
    URL.revokeObjectURL(url)
    showToast('📥 Exported!')
  }

  // Editor View
  if (activeEntry) {
    return (
      <div className="tab-content editor-view">
        <div className="editor-header">
          <button className="back-btn" onClick={handleBack}>← Back</button>
          <div className="editor-actions">
            <button className="action-btn" onClick={handleSave}>💾 Save</button>
            <button className="action-btn" onClick={handleExport}>📥 Export</button>
          </div>
        </div>

        <input
          className="editor-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Entry title..."
        />

        {/* Toolbar */}
        <div className="editor-toolbar">
          <button className="tool-btn" onClick={() => execCmd('bold')} title="Bold"><b>B</b></button>
          <button className="tool-btn" onClick={() => execCmd('italic')} title="Italic"><i>I</i></button>
          <button className="tool-btn" onClick={() => execCmd('underline')} title="Underline"><u>U</u></button>
          <span className="tool-sep">|</span>
          <button className="tool-btn" onClick={() => execCmd('insertUnorderedList')} title="Bullet List">• List</button>
          <button className="tool-btn" onClick={() => execCmd('insertOrderedList')} title="Numbered List">1. List</button>
          <span className="tool-sep">|</span>
          <button className="tool-btn" onClick={() => execCmd('formatBlock', 'h2')} title="Heading">H2</button>
          <button className="tool-btn" onClick={() => execCmd('formatBlock', 'h3')} title="Subheading">H3</button>
          <button className="tool-btn" onClick={() => execCmd('formatBlock', 'p')} title="Paragraph">P</button>
          <span className="tool-sep">|</span>
          <button className="tool-btn" onClick={() => execCmd('removeFormat')} title="Clear Formatting">✕</button>
        </div>

        {/* Editor */}
        <div
          ref={editorRef}
          className="rich-editor"
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Start writing your diary entry..."
        />

        <div className="editor-footer">
          <span className="auto-save-hint">Auto-saves every 30s</span>
          <span className="last-edited">
            Last edited: {new Date(activeEntry.lastEdited).toLocaleString('en-IN')}
          </span>
        </div>

        {toast && <div className="mini-toast">{toast}</div>}
      </div>
    )
  }

  // List View
  return (
    <div className="tab-content">
      <div className="diary-list-header">
        <button className="new-entry-btn" onClick={handleNew}>✏️ New Entry</button>
      </div>

      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input className="search-input" value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search diary entries..."
        />
        {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
      </div>

      {entries.length > 0 && (
        <div className="list-header">
          <span className="entry-count">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-emoji">✍️</div>
          <div className="empty-title">No diary entries yet</div>
          <div className="empty-desc">Tap "New Entry" to start writing</div>
        </div>
      ) : (
        entries.map(entry => (
          <div key={entry.id} className="entry-card" onClick={() => handleOpen(entry)}>
            <div className="entry-meta">
              <span className="entry-date">📅 {entry.date}</span>
              <span className="entry-time">🕐 {entry.time}</span>
            </div>
            <div className="text-entry-title">{entry.title}</div>
            <div className="entry-text truncated">
              {entry.content.replace(/<[^>]*>/g, '').slice(0, 120) || 'Empty entry'}
            </div>
            <button className="entry-card-delete" onClick={e => handleDelete(entry.id, e)}>🗑️</button>
          </div>
        ))
      )}

      {toast && <div className="mini-toast">{toast}</div>}
    </div>
  )
}
